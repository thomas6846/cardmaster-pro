import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncPurchaseToShopify } from "@/lib/shopify";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Re-runs the Shopify sync for an already-settled transaction. Only retries
 * cards that previously failed (or all cards if the prior log is empty).
 * Useful when Shopify was down at settle time, or when the integration was
 * misconfigured. Admin/supervisor only.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERVISOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { cards: true },
  });
  if (!tx) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (tx.status !== "settled") {
    return NextResponse.json(
      { error: `Only settled transactions can resync (status=${tx.status})` },
      { status: 409 },
    );
  }

  // Re-sync everything. If staff only wants to retry failures, the previous
  // log shows what failed; the auto-create lookup chain handles both cases.
  const shopifyInputs = tx.cards.map((c) => ({
    sku: c.shopifySku || c.setCode || null,
    name: c.name,
    rarity: c.rarity,
    language: c.language,
    costPerItem: c.finalPrice ?? c.quotedPrice,
    buyQuantity: 1,
  }));

  const results = await syncPurchaseToShopify(shopifyInputs, {
    locationId: tx.locationId,
  });

  const allOk = results.every((r) => r.ok);
  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      shopifySynced: allOk,
      shopifySyncLog: JSON.stringify(results),
    },
  });

  await logAudit({
    action: "SHOPIFY_RESYNC",
    entityType: "Transaction",
    entityId: id,
    actor: session.user.email || session.user.id,
    payload: { results, allOk },
  });

  return NextResponse.json({
    transaction: updated,
    shopify: results,
    allOk,
  });
}
