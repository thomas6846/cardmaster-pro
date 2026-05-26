import Link from "next/link";
import { ArrowRight, FileText, ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
  draft: { label: "草稿", variant: "outline" },
  pending_approval: { label: "待審批", variant: "warning" },
  approved: { label: "已核准", variant: "success" },
  rejected: { label: "已拒絕", variant: "destructive" },
  settled: { label: "已完成", variant: "success" },
  cancelled: { label: "已取消", variant: "secondary" },
};

export default async function HistoryPage() {
  const txs = await prisma.transaction.findMany({
    orderBy: { createdAt: "desc" },
    include: { cards: true },
    take: 100,
  });

  return (
    <div className="container max-w-5xl py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft />
            返回
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">買取記錄</h1>
      </div>

      {txs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            尚無交易記錄
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {txs.map((tx) => {
            const s = STATUS_MAP[tx.status] || { label: tx.status, variant: "outline" as const };
            return (
              <Card key={tx.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        {tx.transactionNo}
                      </CardTitle>
                      <CardDescription>
                        {formatDate(tx.createdAt)} · 店員 {tx.staffName || "—"} ·{" "}
                        {tx.customerName || "客人未填"}
                      </CardDescription>
                    </div>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>卡牌數：{tx.cards.length}</span>
                      <span className="text-base font-semibold text-foreground">
                        {formatCurrency(tx.totalAmount)}
                      </span>
                      {tx.shopifySynced && (
                        <Badge variant="outline">Shopify 已同步</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/api/transactions/${tx.id}/pdf`} target="_blank">
                        <Button size="sm" variant="outline">
                          <FileText />
                          PDF
                        </Button>
                      </Link>
                      <Link href={`/transaction/${tx.id}`}>
                        <Button size="sm">
                          開啟
                          <ArrowRight />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
