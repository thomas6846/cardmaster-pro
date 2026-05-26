import Link from "next/link";
import { ArrowRight, FileText, ArrowLeft, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { STORE_LOCATIONS } from "@/lib/locations";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  }
> = {
  draft: { label: "草稿", variant: "outline" },
  pending_approval: { label: "待審批", variant: "warning" },
  approved: { label: "已核准", variant: "success" },
  rejected: { label: "已拒絕", variant: "destructive" },
  settled: { label: "已完成", variant: "success" },
  cancelled: { label: "已取消", variant: "secondary" },
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    location?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = await searchParams;

  const where: Prisma.TransactionWhereInput = {};
  if (sp.status && sp.status !== "all" && STATUS_MAP[sp.status])
    where.status = sp.status;
  if (sp.location && sp.location !== "all") where.locationId = sp.location;
  if (sp.q) {
    where.OR = [
      { transactionNo: { contains: sp.q } },
      { customerName: { contains: sp.q } },
      { customerPhone: { contains: sp.q } },
    ];
  }
  if (sp.from || sp.to) {
    where.createdAt = {};
    if (sp.from) where.createdAt.gte = new Date(sp.from);
    if (sp.to) {
      const to = new Date(sp.to);
      to.setHours(23, 59, 59, 999);
      where.createdAt.lte = to;
    }
  }

  const txs = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { cards: true },
    take: 200,
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
        <Badge variant="outline">{txs.length} 條結果</Badge>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label className="text-xs">搜尋（單號 / 客人姓名 / 電話）</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={sp.q}
                  className="pl-8"
                  placeholder="BUY-... / 姓名 / 9xxx xxxx"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">狀態</Label>
              <Select name="status" defaultValue={sp.status || "all"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {Object.entries(STATUS_MAP).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">店舖</Label>
              <Select name="location" defaultValue={sp.location || "all"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {STORE_LOCATIONS.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-1">
              <div className="flex-1">
                <Label className="text-xs">由</Label>
                <Input type="date" name="from" defaultValue={sp.from} />
              </div>
            </div>
            <div className="flex items-end gap-1">
              <div className="flex-1">
                <Label className="text-xs">至</Label>
                <Input type="date" name="to" defaultValue={sp.to} />
              </div>
              <Button type="submit" size="sm">
                <Search className="h-3 w-3" />
                篩選
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {txs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            冇符合條件嘅交易記錄
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {txs.map((tx) => {
            const s = STATUS_MAP[tx.status] || {
              label: tx.status,
              variant: "outline" as const,
            };
            return (
              <Card key={tx.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{tx.transactionNo}</CardTitle>
                      <CardDescription>
                        {formatDate(tx.createdAt)} · 店員 {tx.staffName || "—"} ·{" "}
                        {tx.customerName || "客人未填"}
                        {tx.locationName ? ` · ${tx.locationName}` : ""}
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
                      {tx.shopifySynced && <Badge variant="outline">Shopify 已同步</Badge>}
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
