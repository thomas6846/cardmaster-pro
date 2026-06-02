"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Store, CheckCircle2, Download } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface RecentShop {
  shop: string;
  count: number;
  lastAt: string | null;
}

interface ExtractedRow {
  cardName: string;
  setCode: string | null;
  priceJpy: number;
  conditionNote: string | null;
}

export function BuybackTableUploader({ recent }: { recent: RecentShop[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [shopOverride, setShopOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    shop: string;
    rowCount: number;
    rows: ExtractedRow[];
  } | null>(null);

  async function handleFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("圖片太大", { description: "請壓縮至 8 MB 以下" });
      return;
    }
    setBusy(true);
    setResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/buyback-table", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl: String(reader.result),
            shopOverride: shopOverride || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "OCR 失敗");
        setResult(data);
        toast.success(`已抽取 ${data.rowCount} 行 — ${data.shop}`, {
          description: "已加入多店市場行情",
        });
      } catch (err) {
        toast.error("OCR 失敗", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">上傳買取表</CardTitle>
          <CardDescription>
            可選：填店名（如圖中冇顯示，AI 會自動讀）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>店名（可選）</Label>
            <Input
              value={shopOverride}
              onChange={(e) => setShopOverride(e.target.value)}
              placeholder="例：トレカバンク / BIG トレカ"
            />
          </div>
          <Button
            size="lg"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy ? "AI 抽取中..." : "選擇買取表圖片"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {result.shop} — 抽取 {result.rowCount} 行
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 space-y-0.5 overflow-auto text-xs">
              {result.rows.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 border-b py-0.5"
                >
                  <span className="truncate">
                    {r.cardName}
                    {r.setCode && (
                      <span className="ml-1 text-muted-foreground">{r.setCode}</span>
                    )}
                    {r.conditionNote && (
                      <Badge variant="outline" className="ml-1 text-[10px]">
                        {r.conditionNote}
                      </Badge>
                    )}
                  </span>
                  <span className="shrink-0 font-bold text-red-600">
                    ¥{r.priceJpy.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">已收錄店舖</CardTitle>
            {recent.length > 0 && (
              <Link href="/api/buyback-table/export" target="_blank">
                <Button size="sm" variant="outline">
                  <Download className="h-3 w-3" />
                  下載全部 CSV
                </Button>
              </Link>
            )}
          </div>
          <CardDescription>
            CSV 可喺 Excel 開，核對 AI 抽到嘅卡名 / setCode / 價 / 原圖連結
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚未上傳任何買取表</p>
          ) : (
            <div className="space-y-1">
              {recent.map((s) => (
                <div
                  key={s.shop}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    {s.shop}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {s.count} 張卡 · {s.lastAt ? formatDate(s.lastAt) : "—"}
                    <Link
                      href={`/api/buyback-table/export?shop=${encodeURIComponent(s.shop)}`}
                      target="_blank"
                      className="text-primary hover:underline"
                    >
                      CSV
                    </Link>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
