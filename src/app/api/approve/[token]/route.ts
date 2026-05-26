import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyDecision } from "@/lib/telegram";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const Decision = z.object({
  decision: z.enum(["approved", "rejected"]),
  supervisorNote: z.string().optional(),
  adjustments: z
    .array(
      z.object({
        cardId: z.string(),
        condition: z.enum(["S", "A", "B", "C", "D"]).optional(),
        finalPrice: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const tx = await prisma.transaction.findUnique({
    where: { approvalToken: token },
    include: { cards: true },
  });
  if (!tx) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ transaction: tx });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "SUPERVISOR" && session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden — supervisor or admin only" },
      { status: 403 },
    );
  }

  const { token } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = Decision.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const supervisorName = session.user.name || session.user.email || "supervisor";

  const tx = await prisma.transaction.findUnique({
    where: { approvalToken: token },
    include: { cards: true },
  });
  if (!tx) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (tx.status !== "pending_approval" && tx.status !== "draft") {
    return NextResponse.json(
      { error: `Transaction already ${tx.status}` },
      { status: 409 },
    );
  }

  // Apply per-card adjustments first so totals match.
  if (parsed.data.adjustments?.length) {
    for (const adj of parsed.data.adjustments) {
      await prisma.card.update({
        where: { id: adj.cardId },
        data: {
          ...(adj.condition ? { condition: adj.condition } : {}),
          ...(adj.finalPrice !== undefined
            ? { finalPrice: adj.finalPrice }
            : {}),
        },
      });
    }
  }

  const refreshed = await prisma.transaction.findUnique({
    where: { id: tx.id },
    include: { cards: true },
  });
  const total = (refreshed?.cards || []).reduce(
    (sum, c) => sum + (c.finalPrice ?? c.quotedPrice),
    0,
  );

  const updated = await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      status: parsed.data.decision,
      supervisorName,
      supervisorNote: parsed.data.supervisorNote,
      totalAmount: total,
      approvedAt: parsed.data.decision === "approved" ? new Date() : null,
      approvedById: session.user.id,
    },
    include: { cards: true },
  });

  // Propagate decision to each card's status for downstream filtering.
  await prisma.card.updateMany({
    where: { transactionId: tx.id },
    data: {
      status: parsed.data.decision === "approved" ? "approved" : "rejected",
    },
  });

  await notifyDecision({
    transactionNo: tx.transactionNo,
    decision: parsed.data.decision,
    supervisorName,
    totalAmount: total,
    note: parsed.data.supervisorNote,
  });

  await logAudit({
    action: parsed.data.decision === "approved" ? "APPROVE" : "REJECT",
    entityType: "Transaction",
    entityId: tx.id,
    actor: supervisorName,
    payload: parsed.data,
  });

  return NextResponse.json({ transaction: updated });
}
