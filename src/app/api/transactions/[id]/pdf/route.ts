import { prisma } from "@/lib/prisma";
import { generateBuybackPdf } from "@/lib/pdf";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { cards: true },
  });
  if (!tx) return new Response("Not found", { status: 404 });

  const pdf = generateBuybackPdf({
    transactionNo: tx.transactionNo,
    createdAt: tx.createdAt,
    customerName: tx.customerName,
    customerPhone: tx.customerPhone,
    customerIdLast4: tx.customerIdLast4,
    staffName: tx.staffName,
    supervisorName: tx.supervisorName,
    cards: tx.cards.map((c) => ({
      name: c.name,
      setCode: c.setCode,
      rarity: c.rarity,
      condition: c.condition,
      finalPrice: c.finalPrice ?? c.quotedPrice,
    })),
    totalAmount: tx.cards.reduce(
      (sum, c) => sum + (c.finalPrice ?? c.quotedPrice),
      0,
    ),
    signatureDataUrl: tx.signatureData,
  });

  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${tx.transactionNo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
