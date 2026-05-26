import { ArrowLeft, ShoppingBag, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ shopify?: string }>;
}) {
  const settings = await getSettings();
  const sp = await searchParams;
  const justInstalled = sp.shopify === "installed";
  const isShopifyInstalled = Boolean(settings.shopifyAccessToken);

  return (
    <div className="container max-w-3xl py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft />
            返回
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">系統設定</h1>
      </div>

      {justInstalled && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          Shopify 已成功安裝 ✅
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingBag className="h-5 w-5" />
                Shopify 連線
              </CardTitle>
              <CardDescription>
                {isShopifyInstalled
                  ? `已連到 ${settings.shopifyShop}`
                  : "未連線 — 完成 OAuth 後可同步庫存"}
              </CardDescription>
            </div>
            {isShopifyInstalled ? (
              <Badge variant="success">已連線</Badge>
            ) : (
              <Badge variant="outline">未連線</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isShopifyInstalled && settings.shopifyInstalledAt && (
            <p className="mb-3 text-xs text-muted-foreground">
              安裝於 {formatDate(settings.shopifyInstalledAt)} · scopes:{" "}
              <code>{settings.shopifyScopes}</code>
            </p>
          )}
          <Link href="/api/shopify/install">
            <Button variant={isShopifyInstalled ? "outline" : "default"}>
              {isShopifyInstalled ? "重新安裝 / 更新 scopes" : "安裝到 Shopify"}
            </Button>
          </Link>
        </CardContent>
      </Card>

      <SettingsForm
        initial={{
          budgetTotal: settings.budgetTotal,
          budgetUsed: settings.budgetUsed,
          baseMargin: settings.baseMargin,
          conditionS: settings.conditionS,
          conditionA: settings.conditionA,
          conditionB: settings.conditionB,
          conditionC: settings.conditionC,
          conditionD: settings.conditionD,
          highStockFactor: settings.highStockFactor,
          lowStockFactor: settings.lowStockFactor,
          highStockThresh: settings.highStockThresh,
          lowStockThresh: settings.lowStockThresh,
        }}
      />
    </div>
  );
}
