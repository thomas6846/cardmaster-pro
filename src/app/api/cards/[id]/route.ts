import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { quoteCard } from "@/lib/pricing";
import { logAudit } from "@/lib/audit";
import type { Condition } from "@/lib/types";

export const runtime = "nodejs";

const PatchBody = z.object({
  condition: z.enum(["S", "A", "B", "C", "D"]).optional(),
  finalPrice: z.number().nonnegative().optional(),
  status: z
    .enum(["pending", "quoted", "approved", "rejected", "sold", "dropped"])
    .optional(),
  notes: z.string().optional(),
  recompute: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const card = await prisma.card.findUnique({ where: { id } });
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ card });
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

  const existing = await prisma.card.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  let newQuoted = existing.quotedPrice;
  if (parsed.data.recompute || parsed.data.condition) {
    const cond = (parsed.data.condition || existing.condition) as Condition;
    const q = await quoteCard({
      marketPrice: existing.marketPrice,
      condition: cond,
      inventoryCount: existing.inventoryCount,
    });
    newQuoted = q.finalPrice;
  }

  const updated = await prisma.card.update({
    where: { id },
    data: {
      ...(parsed.data.condition ? { condition: parsed.data.condition } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      quotedPrice: newQuoted,
      ...(parsed.data.finalPrice !== undefined
        ? { finalPrice: parsed.data.finalPrice }
        : {}),
    },
  });

  await logAudit({
    action: "QUOTE_UPDATE",
    entityType: "Card",
    entityId: id,
    actor: "staff",
    payload: parsed.data,
  });

  return NextResponse.json({ card: updated });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await prisma.card.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
