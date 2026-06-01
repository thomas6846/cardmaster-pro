import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuybackTableUploader } from "@/components/buyback-table-uploader";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BuybackTablePage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPERVISOR")) {
    redirect("/");
  }

  // Recent ingests summary — group by shop.
  const recent = await prisma.competitorPrice.groupBy({
    by: ["shop"],
    _count: { _all: true },
    _max: { capturedAt: true },
    orderBy: { _max: { capturedAt: "desc" } },
    take: 20,
  });

  return (
    <div className="container max-w-3xl py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft />
            返回
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">同行買取表 OCR</h1>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        上傳卡店嘅買取表圖（例如佢哋 Twitter 出嘅價目表），AI 會抽晒入面每張卡嘅價，
        之後員工掃卡時喺「多店市場行情」就會見到呢啲同行收購價作對比。
      </p>

      <BuybackTableUploader
        recent={recent.map((r) => ({
          shop: r.shop,
          count: r._count._all,
          lastAt: r._max.capturedAt?.toISOString() || null,
        }))}
      />
    </div>
  );
}
