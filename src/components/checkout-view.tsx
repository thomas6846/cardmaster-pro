"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  FileText,
  ShoppingBag,
  Loader2,
  Copy,
  PenTool,
  Eraser,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface CheckoutCard {
  id: string;
  name: string;
  setCode?: string | null;
  rarity?: string | null;
  condition: string;
  imageUrl: string;
  quotedPrice: number;
  finalPrice?: number | null;
  status: string;
}

interface CheckoutTx {
  id: string;
  transactionNo: string;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerIdLast4?: string | null;
  staffName?: string | null;
  supervisorName?: string | null;
  locationName?: string | null;
  totalAmount: number;
  signatureData?: string | null;
  shopifySynced: boolean;
  shopifySyncLog?: string | null;
  settledAt?: string | null;
  cards: CheckoutCard[];
}

interface ShopifySyncResult {
  sku: string | null;
  name: string;
  ok: boolean;
  error?: string;
  matchedBy?: "sku" | "name" | "created";
  productId?: string;
  newQuantity?: number;
}

export function CheckoutView({
  transaction,
  approvalUrl,
}: {
  transaction: CheckoutTx;
  approvalUrl: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(transaction.cards.map((c) => c.id)),
  );
  const [customerName, setCustomerName] = useState(transaction.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(transaction.customerPhone || "");
  const [customerIdLast4, setCustomerIdLast4] = useState(
    transaction.customerIdLast4 || "",
  );
  const [saving, setSaving] = useState(false);
  const [settling, setSettling] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  const syncResults: ShopifySyncResult[] = (() => {
    if (!transaction.shopifySyncLog) return [];
    try {
      return JSON.parse(transaction.shopifySyncLog);
    } catch {
      return [];
    }
  })();
  const syncFailures = syncResults.filter((r) => !r.ok);

  const total = useMemo(
    () =>
      transaction.cards
        .filter((c) => selected.has(c.id))
        .reduce((sum, c) => sum + (c.finalPrice ?? c.quotedPrice), 0),
    [transaction.cards, selected],
  );

  const canSettle =
    transaction.status === "approved" &&
    selected.size > 0 &&
    !!transaction.signatureData;

  const isSettled = transaction.status === "settled";
  const isPending = transaction.status === "pending_approval";
  const isDraft = transaction.status === "draft";
  const isRejected = transaction.status === "rejected";

  async function saveSelection() {
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerIdLast4,
          selectedCardIds: Array.from(selected),
        }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success("已儲存");
    } catch (err) {
      toast.error("儲存失敗", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveSignature(dataUrl: string) {
    await fetch(`/api/transactions/${transaction.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureData: dataUrl }),
    });
    toast.success("已儲存簽名");
  }

  async function resyncShopify() {
    setResyncing(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/resync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resync failed");
      const okCount = data.shopify?.filter((r: { ok: boolean }) => r.ok).length || 0;
      const total = data.shopify?.length || 0;
      if (data.allOk) {
        toast.success(`Shopify 重新同步成功 ${okCount}/${total}`);
      } else {
        toast.warning(`部分仍失敗 ${okCount}/${total}`, {
          description: "睇 Shopify 同步記錄入面嘅 error 詳情",
        });
      }
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error("Resync 失敗", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setResyncing(false);
    }
  }

  async function settle() {
    if (!canSettle) {
      toast.error("尚未準備完成", {
        description: "需要：主管核准 ✓ 客戶簽名 ✓",
      });
      return;
    }
    setSettling(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/settle`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "結算失敗");
      const okCount = data.shopify?.filter((r: { ok: boolean }) => r.ok).length || 0;
      const totalCount = data.shopify?.length || 0;
      toast.success(`已完成交易！Shopify 同步 ${okCount}/${totalCount}`, {
        description: `扣減預算 ${formatCurrency(data.budgetDeducted)}`,
      });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error("結算失敗", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSettling(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{transaction.transactionNo}</CardTitle>
              <CardDescription>
                店員：{transaction.staffName || "—"}
                {transaction.supervisorName ? ` · 主管：${transaction.supervisorName}` : ""}
                {transaction.locationName ? ` · 入庫：${transaction.locationName}` : ""}
              </CardDescription>
            </div>
            <StatusBadge status={transaction.status} />
          </div>
        </CardHeader>
        <CardContent>
          {isPending && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-amber-700" />
              <div className="flex-1">
                <p className="font-medium text-amber-900">等待主管審批中</p>
                <p className="text-xs text-amber-800">
                  審批連結已發送至 Telegram。亦可手動複製：
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-amber-100 px-2 py-1 text-xs">
                    {approvalUrl}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(approvalUrl);
                      toast.success("已複製");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Link href={approvalUrl} target="_blank">
                    <Button size="icon" variant="outline">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
          {isRejected && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              主管已拒絕此單，請與客人說明。
            </div>
          )}
        </CardContent>
      </Card>

      {isSettled && syncResults.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-4 w-4" />
                Shopify 同步記錄
              </CardTitle>
              {syncFailures.length === 0 ? (
                <Badge variant="success">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  全部成功
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resyncing}
                  onClick={resyncShopify}
                >
                  {resyncing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  重試 {syncFailures.length} 張失敗
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {syncResults.map((r, i) => (
              <div
                key={i}
                className={`flex items-start justify-between gap-2 rounded p-1.5 ${
                  r.ok
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-red-50 text-red-900"
                }`}
              >
                <div className="flex-1">
                  <p className="font-medium">{r.name}</p>
                  {r.sku && <p className="opacity-70">SKU: {r.sku}</p>}
                  {!r.ok && r.error && <p className="opacity-90">⚠️ {r.error}</p>}
                </div>
                {r.ok && (
                  <Badge variant="outline" className="text-xs">
                    {r.matchedBy === "created"
                      ? "新建"
                      : r.matchedBy === "name"
                        ? "按名 match"
                        : "按 SKU match"}
                    {" · 庫存"}
                    {r.newQuantity ?? "?"}
                  </Badge>
                )}
                {!r.ok && (
                  <AlertTriangle className="h-3 w-3 shrink-0 text-red-700" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="cards">
        <TabsList>
          <TabsTrigger value="cards">卡牌結算</TabsTrigger>
          <TabsTrigger value="signature">客戶簽名</TabsTrigger>
          <TabsTrigger value="document">買取協議書 PDF</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">客戶資料</CardTitle>
              <CardDescription>
                客人可勾選最終決定賣出的項目
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>姓名</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={isSettled}
                  />
                </div>
                <div>
                  <Label>電話</Label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    disabled={isSettled}
                  />
                </div>
                <div>
                  <Label>身分證後 4 碼</Label>
                  <Input
                    value={customerIdLast4}
                    maxLength={4}
                    onChange={(e) => setCustomerIdLast4(e.target.value)}
                    disabled={isSettled}
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={saveSelection}
                disabled={saving || isSettled}
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                儲存資料 / 更新勾選
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-3">
            {transaction.cards.map((c) => (
              <CheckoutCardRow
                key={c.id}
                card={c}
                selected={selected.has(c.id)}
                disabled={isSettled || isPending || isDraft}
                onToggle={(checked) => {
                  setSelected((prev) => {
                    const n = new Set(prev);
                    if (checked) n.add(c.id);
                    else n.delete(c.id);
                    return n;
                  });
                }}
              />
            ))}
          </div>

          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-muted-foreground">合計 ({selected.size} 張)</p>
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(total)}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/api/transactions/${transaction.id}/pdf`} target="_blank">
                  <Button variant="outline" size="lg">
                    <FileText />
                    預覽 PDF
                  </Button>
                </Link>
                <Button
                  size="lg"
                  variant="success"
                  disabled={!canSettle || settling}
                  onClick={settle}
                >
                  {settling ? <Loader2 className="animate-spin" /> : <ShoppingBag />}
                  完成交易 & 同步 Shopify
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signature">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">客戶簽名</CardTitle>
              <CardDescription>
                請客戶在下方簽名後按「儲存簽名」
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignaturePad
                initial={transaction.signatureData}
                disabled={isSettled}
                onSave={saveSignature}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="document">
          <Card>
            <CardContent className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                PDF 將在新分頁開啟。簽名儲存後會自動嵌入。
              </p>
              <Link href={`/api/transactions/${transaction.id}/pdf`} target="_blank">
                <Button size="lg">
                  <FileText />
                  開啟買取協議書
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CheckoutCardRow({
  card,
  selected,
  disabled,
  onToggle,
}: {
  card: CheckoutCard;
  selected: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <Card className={!selected ? "opacity-60" : ""}>
      <CardContent className="flex items-center gap-4 p-4">
        <Checkbox
          checked={selected}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
        <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded bg-secondary">
          {card.imageUrl && (
            <Image
              src={card.imageUrl}
              alt={card.name}
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
          )}
        </div>
        <div className="flex-1">
          <p className="font-medium leading-tight">{card.name}</p>
          <p className="text-xs text-muted-foreground">
            {card.setCode || "—"} · {card.rarity || "?"} · Cond {card.condition}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-primary">
            {formatCurrency(card.finalPrice ?? card.quotedPrice)}
          </p>
          {card.finalPrice && card.finalPrice !== card.quotedPrice && (
            <p className="text-xs text-muted-foreground line-through">
              {formatCurrency(card.quotedPrice)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SignaturePad({
  initial,
  disabled,
  onSave,
}: {
  initial?: string | null;
  disabled: boolean;
  onSave: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(!!initial);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    if (initial) {
      const img = new window.Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = initial;
    }
  }, [initial]);

  function point(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return {
      x: ((t.clientX - rect.left) * canvas.width) / rect.width,
      y: ((t.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    if (disabled) return;
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function save() {
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    onSave(dataUrl);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-white">
        <canvas
          ref={canvasRef}
          width={800}
          height={240}
          className="block h-60 w-full touch-none cursor-crosshair"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={clear} disabled={disabled}>
          <Eraser />
          清除
        </Button>
        <Button onClick={save} disabled={disabled || !hasInk}>
          <PenTool />
          儲存簽名
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" }> = {
    draft: { label: "草稿", variant: "outline" },
    pending_approval: { label: "待審批", variant: "warning" },
    approved: { label: "已核准", variant: "success" },
    rejected: { label: "已拒絕", variant: "destructive" },
    settled: { label: "已完成", variant: "success" },
    cancelled: { label: "已取消", variant: "secondary" },
  };
  const m = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
