import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CheckoutView } from "@/components/checkout-view";

export const dynamic = "force-dynamic";

export default async function TransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tx = await prisma.transaction.findUnique({
    where: { id },
    include: { cards: true },
  });
  if (!tx) notFound();

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `http://localhost:${process.env.PORT || 3000}`;
  const approvalUrl = `${appUrl}/approve/${tx.approvalToken}`;

  return (
    <div className="container max-w-4xl py-6">
      <CheckoutView
        approvalUrl={approvalUrl}
        transaction={{
          id: tx.id,
          transactionNo: tx.transactionNo,
          status: tx.status,
          customerName: tx.customerName,
          customerPhone: tx.customerPhone,
          customerIdLast4: tx.customerIdLast4,
          staffName: tx.staffName,
          supervisorName: tx.supervisorName,
          totalAmount: tx.totalAmount,
          signatureData: tx.signatureData,
          shopifySynced: tx.shopifySynced,
          settledAt: tx.settledAt?.toISOString() || null,
          cards: tx.cards.map((c) => ({
            id: c.id,
            name: c.name,
            setCode: c.setCode,
            rarity: c.rarity,
            condition: c.condition,
            imageUrl: c.imageUrl,
            quotedPrice: c.quotedPrice,
            finalPrice: c.finalPrice,
            status: c.status,
          })),
        }}
      />
    </div>
  );
}
