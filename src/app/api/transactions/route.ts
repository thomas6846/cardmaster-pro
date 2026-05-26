import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateTransactionNo, shortId } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { findLocation } from "@/lib/locations";

export const runtime = "nodejs";

const Body = z.object({
  cardIds: z.array(z.string()).min(1),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerIdLast4: z.string().optional(),
  locationId: z.string().min(1, "請揀返入庫店鋪"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const txs = await prisma.transaction.findMany({
    orderBy: { createdAt: "desc" },
    include: { cards: true },
    take: 50,
  });
  return NextResponse.json({ transactions: txs });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const cards = await prisma.card.findMany({
    where: { id: { in: parsed.data.cardIds } },
  });
  if (cards.length === 0) {
    return NextResponse.json({ error: "no cards" }, { status: 400 });
  }

  const total = cards.reduce(
    (sum, c) => sum + (c.finalPrice ?? c.quotedPrice),
    0,
  );

  const staffName = session.user.name || session.user.email || "staff";
  const location = findLocation(parsed.data.locationId);
  if (!location) {
    return NextResponse.json(
      { error: `Unknown location id: ${parsed.data.locationId}` },
      { status: 400 },
    );
  }

  const tx = await prisma.transaction.create({
    data: {
      transactionNo: generateTransactionNo(),
      approvalToken: shortId() + shortId(),
      staffName,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      customerIdLast4: parsed.data.customerIdLast4,
      totalAmount: total,
      status: "draft",
      createdById: session.user.id,
      locationId: location.id,
      locationName: location.name,
      cards: {
        connect: cards.map((c) => ({ id: c.id })),
      },
    },
    include: { cards: true },
  });

  await logAudit({
    action: "TX_CREATE",
    entityType: "Transaction",
    entityId: tx.id,
    actor: staffName,
    payload: { cardIds: parsed.data.cardIds, total },
  });

  return NextResponse.json({ transaction: tx });
}
