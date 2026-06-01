"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Twitter, Power } from "lucide-react";
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

interface Shop {
  id: string;
  handle: string;
  shopName: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunNote: string | null;
}

export function MonitoredShops({
  initial,
  xConfigured,
}: {
  initial: Shop[];
  xConfigured: boolean;
}) {
  const [shops, setShops] = useState<Shop[]>(initial);
  const [handle, setHandle] = useState("");
  const [shopName, setShopName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/monitored-shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, shopName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "新增失敗");
      setShops((p) => [...p, { ...data.shop, lastRunAt: null, lastRunNote: null }]);
      setHandle("");
      setShopName("");
      toast.success("已加入監察");
    } catch (err) {
      toast.error("失敗", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: Shop) {
    const res = await fetch(`/api/monitored-shops/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    if (res.ok) {
      setShops((p) => p.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
    }
  }

  async function remove(id: string) {
    if (!confirm("移除此監察帳號？")) return;
    const res = await fetch(`/api/monitored-shops/${id}`, { method: "DELETE" });
    if (res.ok) setShops((p) => p.filter((x) => x.id !== id));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Twitter className="h-5 w-5" />
              自動監察卡店 X (Twitter)
            </CardTitle>
            <CardDescription>
              加入卡店 X 帳號，系統每隔幾小時自動抓佢哋出嘅買取表圖 → AI 抽價
            </CardDescription>
          </div>
          {xConfigured ? (
            <Badge variant="success">X API 已連</Badge>
          ) : (
            <Badge variant="warning">X_BEARER_TOKEN 未設</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={add} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label className="text-xs">X 帳號 (@handle)</Label>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="torecabank"
              required
            />
          </div>
          <div>
            <Label className="text-xs">店名（顯示用）</Label>
            <Input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="トレカバンク"
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              加入
            </Button>
          </div>
        </form>

        {shops.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚未監察任何帳號</p>
        ) : (
          <div className="space-y-1">
            {shops.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${
                  !s.enabled ? "opacity-50" : ""
                }`}
              >
                <div>
                  <p className="font-medium">
                    {s.shopName}{" "}
                    <span className="text-xs text-muted-foreground">@{s.handle}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.lastRunAt
                      ? `上次 ${formatDate(s.lastRunAt)} · ${s.lastRunNote || ""}`
                      : "未跑過"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggle(s)}
                    title={s.enabled ? "停用" : "啟用"}
                  >
                    <Power
                      className={`h-4 w-4 ${s.enabled ? "text-emerald-600" : "text-muted-foreground"}`}
                    />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(s.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
