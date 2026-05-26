"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Loader2,
  ZoomIn,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Condition } from "@/lib/types";

interface ApprovalCard {
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
}

interface ApprovalTransaction {
  id: string;
  token: string;
  transactionNo: string;
  status: string;
  staffName?: string | null;
  customerName?: string | null;
  totalAmount: number;
  supervisorName?: string | null;
  supervisorNote?: string | null;
  cards: ApprovalCard[];
}

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "S", label: "S" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
];

export function ApprovalView({ transaction }: { transaction: ApprovalTransaction }) {
  const [supervisorNote, setSupervisorNote] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"approved" | "rejected" | null>(null);
  const [adjustments, setAdjustments] = useState<
    Record<string, { condition?: Condition; finalPrice?: number }>
  >({});

  const isFinal = ["approved", "rejected", "settled", "cancelled"].includes(
    transaction.status,
  );

  const cards = useMemo(
    () =>
      transaction.cards.map((c) => {
        const adj = adjustments[c.id] || {};
        return {
          ...c,
          condition: adj.condition || c.condition,
          finalPrice: adj.finalPrice ?? c.finalPrice ?? c.quotedPrice,
        };
      }),
    [transaction.cards, adjustments],
  );

  const total = cards.reduce((sum, c) => sum + (c.finalPrice ?? 0), 0);

  function setAdj(
    id: string,
    patch: Partial<{ condition: Condition; finalPrice: number }>,
  ) {
    setAdjustments((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function decide(decision: "approved" | "rejected") {
    setSubmitting(decision);
    try {
      const res = await fetch(`/api/approve/${transaction.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          supervisorNote,
          adjustments: Object.entries(adjustments).map(([cardId, a]) => ({
            cardId,
            ...a,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失敗");
      toast.success(decision === "approved" ? "已核准 ✅" : "已拒絕 ❌");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error("送出失敗", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
                主管審批 — {transaction.transactionNo}
              </CardTitle>
              <CardDescription>
                店員：{transaction.staffName || "—"} · 客人：
                {transaction.customerName || "—"}
              </CardDescription>
            </div>
            <StatusBadge status={transaction.status} />
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3">
        {cards.map((c, i) => (
          <Card key={c.id}>
            <CardContent className="flex gap-4 p-4">
              <button
                className="group relative h-40 w-28 shrink-0 overflow-hidden rounded-md bg-secondary"
                onClick={() => setZoom(c.imageUrl)}
              >
                {c.imageUrl && (
                  <Image
                    src={c.imageUrl}
                    alt={c.name}
                    fill
                    sizes="112px"
                    className="object-cover transition-transform group-hover:scale-105"
                    unoptimized
                  />
                )}
                <span className="absolute bottom-1 right-1 rounded-full bg-black/60 p-1 text-white">
                  <ZoomIn className="h-3 w-3" />
                </span>
              </button>
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">#{i + 1}</p>
                    <h3 className="text-base font-semibold leading-tight">
                      {c.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {c.setCode || "—"} · {c.rarity || "?"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">
                      市價 {formatCurrency(c.marketPrice)}
                    </Badge>
                    <Badge variant="outline">{c.marketSource}</Badge>
                    <Badge variant={c.inventoryCount > 10 ? "warning" : "outline"}>
                      庫存 {c.inventoryCount}
                    </Badge>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-[120px_1fr_140px]">
                  <div>
                    <Label className="text-xs">Condition</Label>
                    <Select
                      disabled={isFinal}
                      value={c.condition}
                      onValueChange={(v) =>
                        setAdj(c.id, { condition: v as Condition })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">
                      原報價 {formatCurrency(c.quotedPrice)}
                    </Label>
                    <div className="text-xs text-muted-foreground">
                      原 Condition：{transaction.cards.find((tc) => tc.id === c.id)?.condition}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">主管核定價</Label>
                    <Input
                      type="number"
                      disabled={isFinal}
                      value={c.finalPrice ?? ""}
                      onChange={(e) =>
                        setAdj(c.id, {
                          finalPrice: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      className="h-9 text-right font-semibold"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <Label className="text-base">合計</Label>
            <span className="text-3xl font-bold text-primary">
              {formatCurrency(total)}
            </span>
          </div>
          <Separator />

          {!isFinal ? (
            <>
              <div>
                <Label>主管備註 (可選)</Label>
                <Input
                  value={supervisorNote}
                  onChange={(e) => setSupervisorNote(e.target.value)}
                  placeholder="例：A 條件勉強核准、要客人補簽身份證"
                />
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <Button
                  size="lg"
                  variant="success"
                  className="flex-1"
                  disabled={!!submitting}
                  onClick={() => decide("approved")}
                >
                  {submitting === "approved" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <CheckCircle2 />
                  )}
                  核准
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  className="flex-1"
                  disabled={!!submitting}
                  onClick={() => decide("rejected")}
                >
                  {submitting === "rejected" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <XCircle />
                  )}
                  拒絕
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>主管</Label>
              <p className="text-sm">{transaction.supervisorName || "—"}</p>
              {transaction.supervisorNote && (
                <Textarea
                  readOnly
                  value={transaction.supervisorNote}
                  className="bg-muted"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoom(null)}
        >
          <Image
            src={zoom}
            alt="zoom"
            width={800}
            height={1120}
            className="max-h-[90vh] w-auto object-contain"
            unoptimized
          />
        </div>
      )}
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
