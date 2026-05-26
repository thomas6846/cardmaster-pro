"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  Upload,
  Trash2,
  Loader2,
  Send,
  Sparkles,
  AlertTriangle,
  LayoutGrid,
  Square,
  Pencil,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { STORE_LOCATIONS } from "@/lib/locations";
import type { Condition } from "@/lib/types";

interface ConditionDetails {
  centering?: { front?: string; back?: string };
  corners?: {
    topLeft?: string;
    topRight?: string;
    bottomLeft?: string;
    bottomRight?: string;
  };
  edges?: string;
  surface?: string;
  estimatedPsa?: number;
  estimatedGrade?: string;
  notes?: string;
}

interface HistoryEntry {
  id: string;
  condition: string;
  finalPrice: number | null;
  quotedPrice: number;
  createdAt: string;
  transaction?: { locationName?: string | null; transactionNo: string } | null;
}

interface ScannedCard {
  id: string;
  name: string;
  setCode?: string | null;
  rarity?: string | null;
  condition: string;
  imageUrl: string;
  marketPrice: number;
  marketSource: string;
  inventoryCount: number;
  quotedPrice: number;
  finalPrice?: number | null;
  aiConditionEstimate?: string | null;
  conditionDetails?: ConditionDetails | null;
  history?: HistoryEntry[];
}

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "S", label: "S — Mint / 全新" },
  { value: "A", label: "A — Near Mint / 接近完美" },
  { value: "B", label: "B — Excellent / 輕微瑕疵" },
  { value: "C", label: "C — Good / 明顯磨損" },
  { value: "D", label: "D — Played / 重度磨損" },
];

export function StaffScanner({
  budgetRemaining,
  budgetTotal,
}: {
  budgetRemaining: number;
  budgetTotal: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMode, setScanMode] = useState<"single" | "bulk">("single");
  const [condition, setCondition] = useState<Condition>("A");
  const [cards, setCards] = useState<ScannedCard[]>([]);
  // Remembers the last-chosen store on this device so staff don't re-pick
  // every transaction. Hydrates from localStorage after mount.
  const [locationId, setLocationId] = useState<string>(STORE_LOCATIONS[0].id);
  useEffect(() => {
    const saved = localStorage.getItem("cardmaster:lastLocationId");
    if (saved && STORE_LOCATIONS.some((l) => l.id === saved)) {
      setLocationId(saved);
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("cardmaster:lastLocationId", locationId);
  }, [locationId]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const total = cards.reduce(
    (sum, c) => sum + (c.finalPrice ?? c.quotedPrice),
    0,
  );

  async function handleFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("圖片太大", { description: "請壓縮至 8 MB 以下" });
      return;
    }
    setScanning(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      try {
        const res = await fetch("/api/recognize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl: dataUrl,
            condition,
            mode: scanMode,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "識別失敗");

        const results = (data.results || []) as Array<{
          card: ScannedCard;
        }>;

        if (results.length === 0) {
          toast.warning("未辨識到卡牌", {
            description: data.message || "請拍清楚啲再試",
          });
          return;
        }

        const newCards: ScannedCard[] = results.map(
          (r: { card: ScannedCard; history?: HistoryEntry[] }) => ({
            id: r.card.id,
            name: r.card.name,
            setCode: r.card.setCode,
            rarity: r.card.rarity,
            condition: r.card.condition,
            imageUrl: r.card.imageUrl,
            marketPrice: r.card.marketPrice,
            marketSource: r.card.marketSource,
            inventoryCount: r.card.inventoryCount,
            quotedPrice: r.card.quotedPrice,
            aiConditionEstimate: r.card.aiConditionEstimate,
            conditionDetails: r.card.conditionDetails,
            history: r.history,
          }),
        );

        setCards((prev) => [...newCards, ...prev]);

        if (newCards.length === 1) {
          toast.success(`已加入 — ${newCards[0].name}`, {
            description: `報價 ${formatCurrency(newCards[0].quotedPrice)}`,
          });
        } else {
          const total = newCards.reduce((s, c) => s + c.quotedPrice, 0);
          toast.success(`平鋪識別：加入 ${newCards.length} 張卡`, {
            description: `合計報價 ${formatCurrency(total)}`,
          });
        }
      } catch (err) {
        toast.error("識別失敗", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function updateCardCondition(cardId: string, c: Condition) {
    setCards((prev) =>
      prev.map((card) => (card.id === cardId ? { ...card, condition: c } : card)),
    );
    const res = await fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ condition: c, recompute: true }),
    });
    const data = await res.json();
    if (res.ok) {
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? { ...card, quotedPrice: data.card.quotedPrice, condition: data.card.condition }
            : card,
        ),
      );
    }
  }

  async function updateMarketPrice(cardId: string, marketPrice: number) {
    const res = await fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketPrice, recompute: true }),
    });
    const data = await res.json();
    if (res.ok) {
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? {
                ...card,
                marketPrice: data.card.marketPrice,
                marketSource: data.card.marketSource,
                quotedPrice: data.card.quotedPrice,
              }
            : card,
        ),
      );
      toast.success("市價已更新，報價已重新計算");
    } else {
      toast.error("更新失敗");
    }
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    fetch(`/api/cards/${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function submitForApproval() {
    if (cards.length === 0) {
      toast.error("尚未掃描任何卡牌");
      return;
    }
    setSubmitting(true);
    try {
      const create = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardIds: cards.map((c) => c.id),
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          locationId,
        }),
      });
      const createJson = await create.json();
      if (!create.ok) throw new Error(createJson.error || "建立交易失敗");

      const txId = createJson.transaction.id as string;
      const submit = await fetch(`/api/transactions/${txId}/submit`, {
        method: "POST",
      });
      const submitJson = await submit.json();
      if (!submit.ok) throw new Error(submitJson.error || "送審失敗");

      if (submitJson.telegram?.ok) {
        toast.success("已透過 Telegram 送審", {
          description: `等待主管審批 — ${submitJson.transaction.transactionNo}`,
        });
      } else {
        toast.warning("已建立交易，但 Telegram 未送出", {
          description: submitJson.telegram?.error || "請手動複製審批連結",
        });
      }
      router.push(`/transaction/${txId}`);
    } catch (err) {
      toast.error("送審失敗", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  店員買取介面
                </CardTitle>
                <CardDescription>
                  拍照或上傳 → AI 識別 → 即時報價 → 送主管審批
                </CardDescription>
              </div>
              <Link href="/" className="text-sm text-muted-foreground underline">
                回首頁
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>入庫店鋪 *</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STORE_LOCATIONS.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>客人姓名</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="可選"
                />
              </div>
              <div>
                <Label>客人電話</Label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="可選"
                />
              </div>
            </div>

            <div>
              <Label>識別模式</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScanMode("single")}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    scanMode === "single"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent"
                  }`}
                >
                  <Square className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium">單卡</div>
                    <div className="text-xs opacity-80">一張相一隻卡</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setScanMode("bulk")}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    scanMode === "bulk"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent"
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium">平鋪多卡</div>
                    <div className="text-xs opacity-80">一張相 N 隻卡</div>
                  </div>
                </button>
              </div>
              {scanMode === "bulk" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  💡 將卡牌平鋪喺枱面（建議 2–12 張，唔好疊），AI 會逐隻辨識並建立報價。
                </p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-[200px_1fr]">
              <div>
                <Label>初始 Condition</Label>
                <Select
                  value={condition}
                  onValueChange={(v) => setCondition(v as Condition)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  size="xl"
                  className="flex-1"
                  disabled={scanning}
                  onClick={() => fileRef.current?.click()}
                >
                  {scanning ? (
                    <Loader2 className="animate-spin" />
                  ) : scanMode === "bulk" ? (
                    <LayoutGrid className="h-5 w-5" />
                  ) : (
                    <Camera className="h-5 w-5" />
                  )}
                  {scanning
                    ? "AI 識別中..."
                    : scanMode === "bulk"
                      ? "拍照識別 (多卡)"
                      : "拍照識別"}
                </Button>
                <Button
                  size="xl"
                  variant="outline"
                  disabled={scanning}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-5 w-5" />
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">已掃描卡牌 ({cards.length})</h2>
          {cards.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                尚無紀錄。請按「拍照識別」開始。
              </CardContent>
            </Card>
          ) : (
            cards.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                onConditionChange={(c) => updateCardCondition(card.id, c)}
                onMarketPriceChange={(p) => updateMarketPrice(card.id, p)}
                onRemove={() => removeCard(card.id)}
              />
            ))
          )}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardDescription>今日預算剩餘</CardDescription>
            <CardTitle>{formatCurrency(budgetRemaining)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all ${
                  budgetTotal > 0 && budgetRemaining / budgetTotal < 0.2
                    ? "bg-destructive"
                    : budgetTotal > 0 && budgetRemaining / budgetTotal < 0.5
                      ? "bg-amber-500"
                      : "bg-primary"
                }`}
                style={{
                  width: `${
                    budgetTotal > 0
                      ? Math.min(100, ((budgetTotal - budgetRemaining) / budgetTotal) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            {budgetTotal > 0 && budgetRemaining / budgetTotal < 0.2 && (
              <p className="mt-2 text-xs text-destructive font-medium">
                ⚠️ 預算少於 20%，報價會自動向下調整
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>本次合計</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(total)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {total > budgetRemaining && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                金額超出當日剩餘預算
              </div>
            )}
            <Button
              size="lg"
              className="w-full"
              disabled={submitting || cards.length === 0}
              onClick={submitForApproval}
            >
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              送主管審批
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function CardRow({
  card,
  onConditionChange,
  onMarketPriceChange,
  onRemove,
}: {
  card: ScannedCard;
  onConditionChange: (c: Condition) => void;
  onMarketPriceChange: (p: number) => void;
  onRemove: () => void;
}) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState(String(card.marketPrice));

  const snkrdunkUrl = `https://snkrdunk.com/search?q=${encodeURIComponent(card.setCode || card.name)}`;

  function commitPrice() {
    const v = Number(priceDraft);
    if (!Number.isFinite(v) || v < 0) {
      toast.error("請輸入有效金額");
      return;
    }
    onMarketPriceChange(v);
    setEditingPrice(false);
  }

  return (
    <Card>
      <CardContent className="flex gap-4 p-4">
        <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-md bg-secondary">
          {card.imageUrl ? (
            <Image
              src={card.imageUrl}
              alt={card.name}
              fill
              sizes="96px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold leading-tight">{card.name}</h3>
              <p className="text-xs text-muted-foreground">
                {card.setCode || "—"} · {card.rarity || "?"}
              </p>
            </div>
            <Button size="icon" variant="ghost" onClick={onRemove}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {editingPrice ? (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">市價 HKD</span>
                <Input
                  type="number"
                  value={priceDraft}
                  onChange={(e) => setPriceDraft(e.target.value)}
                  className="h-7 w-24 px-2 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitPrice();
                    if (e.key === "Escape") {
                      setEditingPrice(false);
                      setPriceDraft(String(card.marketPrice));
                    }
                  }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={commitPrice}>
                  <Check className="h-3 w-3 text-emerald-600" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingPrice(false);
                    setPriceDraft(String(card.marketPrice));
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPriceDraft(String(card.marketPrice));
                  setEditingPrice(true);
                }}
                className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 font-semibold hover:bg-accent"
              >
                市價 {formatCurrency(card.marketPrice)}
                <Pencil className="h-3 w-3 opacity-60" />
              </button>
            )}
            <Badge variant="outline">{card.marketSource}</Badge>
            <a
              href={snkrdunkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-input px-2.5 py-0.5 text-xs hover:bg-accent"
            >
              SNKRDUNK
              <ExternalLink className="h-3 w-3" />
            </a>
            <Badge variant={card.inventoryCount > 10 ? "warning" : "outline"}>
              庫存 {card.inventoryCount}
            </Badge>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="w-44">
              <Label className="text-xs">
                Condition
                {card.aiConditionEstimate &&
                  card.aiConditionEstimate !== card.condition && (
                    <span className="ml-1 text-amber-600">
                      (AI 估 {card.aiConditionEstimate})
                    </span>
                  )}
              </Label>
              <Select
                value={card.condition}
                onValueChange={(v) => onConditionChange(v as Condition)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">建議買取價</p>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(card.finalPrice ?? card.quotedPrice)}
              </p>
            </div>
          </div>
          {card.conditionDetails && (
            <ConditionBreakdown details={card.conditionDetails} />
          )}
          {card.history && card.history.length > 0 && (
            <BuybackHistory history={card.history} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BuybackHistory({ history }: { history: HistoryEntry[] }) {
  const prices = history.map((h) => h.finalPrice ?? h.quotedPrice);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-xs">
      <div className="mb-1 flex items-center justify-between font-medium text-emerald-900">
        <span>📈 過往買取參考 ({history.length})</span>
        <span>
          平均 {formatCurrency(avg)} · 範圍 {formatCurrency(min)}–{formatCurrency(max)}
        </span>
      </div>
      <div className="space-y-0.5 text-emerald-800/80">
        {history.map((h) => (
          <div key={h.id} className="flex justify-between gap-2">
            <span>
              {new Date(h.createdAt).toLocaleDateString("zh-HK", {
                month: "2-digit",
                day: "2-digit",
              })}{" "}
              · Cond {h.condition}
              {h.transaction?.locationName ? ` · ${h.transaction.locationName}` : ""}
            </span>
            <span className="font-semibold">
              {formatCurrency(h.finalPrice ?? h.quotedPrice)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConditionBreakdown({ details }: { details: ConditionDetails }) {
  const [open, setOpen] = useState(false);
  const psa = details.estimatedPsa;
  return (
    <div className="rounded-md border bg-muted/40 p-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left font-medium"
      >
        <span>
          🔍 AI Condition 拆解
          {psa !== undefined && (
            <span className="ml-2 text-muted-foreground">est. PSA {psa}</span>
          )}
        </span>
        <span className="text-muted-foreground">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1 text-muted-foreground">
          {details.centering && (
            <div>
              <strong className="text-foreground">Centering:</strong>{" "}
              前 {details.centering.front || "?"} / 後 {details.centering.back || "?"}
            </div>
          )}
          {details.corners && (
            <div>
              <strong className="text-foreground">Corners:</strong>{" "}
              TL {details.corners.topLeft || "?"} · TR {details.corners.topRight || "?"}
              · BL {details.corners.bottomLeft || "?"} · BR {details.corners.bottomRight || "?"}
            </div>
          )}
          {details.edges && (
            <div>
              <strong className="text-foreground">Edges:</strong> {details.edges}
            </div>
          )}
          {details.surface && (
            <div>
              <strong className="text-foreground">Surface:</strong> {details.surface}
            </div>
          )}
          {details.notes && (
            <div className="text-amber-700">
              <strong>⚠️ {details.notes}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
