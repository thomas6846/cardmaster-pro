import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PatchBody = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerIdLast4: z.string().optional(),
  signatureData: z.string().optional(),
  selectedCardIds: z.array(z.string()).optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { cards: true },
  });
  if (!tx) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ transaction: tx });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // If customer changed the selection, drop the unchecked cards from the tx.
  if (parsed.data.selectedCardIds) {
    const tx = await prisma.transaction.findUnique({
      where: { id },
      include: { cards: true },
    });
    if (!tx) return NextResponse.json({ error: "not found" }, { status: 404 });

    const keep = new Set(parsed.data.selectedCardIds);
    const drop = tx.cards.filter((c) => !keep.has(c.id));
    if (drop.length) {
      await prisma.card.updateMany({
        where: { id: { in: drop.map((c) => c.id) } },
        data: { transactionId: null, status: "dropped" },
      });
    }
  }

  const tx = await prisma.transaction.update({
    where: { id },
    data: {
      ...(parsed.data.customerName !== undefined
        ? { customerName: parsed.data.customerName }
        : {}),
      ...(parsed.data.customerPhone !== undefined
        ? { customerPhone: parsed.data.customerPhone }
        : {}),
      ...(parsed.data.customerIdLast4 !== undefined
        ? { customerIdLast4: parsed.data.customerIdLast4 }
        : {}),
      ...(parsed.data.signatureData !== undefined
        ? { signatureData: parsed.data.signatureData }
        : {}),
    },
    include: { cards: true },
  });

  const total = tx.cards.reduce(
    (sum, c) => sum + (c.finalPrice ?? c.quotedPrice),
    0,
  );
  if (total !== tx.totalAmount) {
    await prisma.transaction.update({
      where: { id },
      data: { totalAmount: total },
    });
  }

  return NextResponse.json({ transaction: tx });
}
