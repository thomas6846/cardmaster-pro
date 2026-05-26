import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ApprovalView } from "@/components/approval-view";

export const dynamic = "force-dynamic";

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tx = await prisma.transaction.findUnique({
    where: { approvalToken: token },
    include: { cards: true },
  });
  if (!tx) notFound();

  return (
    <div className="container max-w-5xl py-6">
      <ApprovalView
        transaction={{
          id: tx.id,
          token,
          transactionNo: tx.transactionNo,
          status: tx.status,
          staffName: tx.staffName,
          customerName: tx.customerName,
          totalAmount: tx.totalAmount,
          supervisorName: tx.supervisorName,
          supervisorNote: tx.supervisorNote,
          cards: tx.cards.map((c) => ({
            id: c.id,
            name: c.name,
            setCode: c.setCode,
            rarity: c.rarity,
            condition: c.condition,
            imageUrl: c.imageUrl,
            marketPrice: c.marketPrice,
            marketSource: c.marketSource,
            inventoryCount: c.inventoryCount,
            quotedPrice: c.quotedPrice,
            finalPrice: c.finalPrice,
          })),
        }}
      />
    </div>
  );
}
