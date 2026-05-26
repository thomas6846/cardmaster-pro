import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendApprovalRequest } from "@/lib/telegram";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `http://localhost:${process.env.PORT || 3000}`;
  const approvalUrl = `${appUrl}/approve/${tx.approvalToken}`;

  const result = await sendApprovalRequest({
    transactionNo: tx.transactionNo,
    approvalUrl,
    staffName: tx.staffName || undefined,
    totalAmount: tx.totalAmount,
    cardCount: tx.cards.length,
  });

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      status: "pending_approval",
      telegramSent: result.ok,
      telegramMsgId: result.messageId,
    },
  });

  await logAudit({
    action: "SUBMIT",
    entityType: "Transaction",
    entityId: id,
    actor: tx.staffName || "staff",
    payload: { approvalUrl, telegram: result },
  });

  return NextResponse.json({
    transaction: updated,
    approvalUrl,
    telegram: result,
  });
}
