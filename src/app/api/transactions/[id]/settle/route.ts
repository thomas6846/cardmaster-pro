import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPurchaseToShopify } from "@/lib/shopify";
import { consumeBudget } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { cards: true },
  });
  if (!tx) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (tx.status !== "approved") {
    return NextResponse.json(
      { error: "Transaction must be approved before settlement" },
      { status: 409 },
    );
  }

  const total = tx.cards.reduce(
    (sum, c) => sum + (c.finalPrice ?? c.quotedPrice),
    0,
  );

  // Pass every card (not just ones with SKU) — auto-create will handle the
  // SKU-less ones using the card name.
  const shopifyInputs = tx.cards.map((c) => ({
    sku: c.shopifySku || c.setCode || null,
    name: c.name,
    rarity: c.rarity,
    language: c.language,
    costPerItem: c.finalPrice ?? c.quotedPrice,
    buyQuantity: 1,
  }));

  const shopifyResults = await syncPurchaseToShopify(shopifyInputs, {
    locationId: tx.locationId,
  });

  await consumeBudget(total);

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      status: "settled",
      shopifySynced: shopifyResults.every((r) => r.ok),
      shopifySyncLog: JSON.stringify(shopifyResults),
      settledAt: new Date(),
      totalAmount: total,
    },
    include: { cards: true },
  });

  await prisma.card.updateMany({
    where: { transactionId: id },
    data: { status: "sold" },
  });

  await logAudit({
    action: "SETTLE",
    entityType: "Transaction",
    entityId: id,
    actor: "system",
    payload: { total, shopifyResults },
  });

  return NextResponse.json({
    transaction: updated,
    shopify: shopifyResults,
    budgetDeducted: total,
  });
}
