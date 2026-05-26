"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";

interface SettingsFormState {
  budgetTotal: number;
  budgetUsed: number;
  baseMargin: number;
  conditionS: number;
  conditionA: number;
  conditionB: number;
  conditionC: number;
  conditionD: number;
  highStockFactor: number;
  lowStockFactor: number;
  highStockThresh: number;
  lowStockThresh: number;
}

export function SettingsForm({ initial }: { initial: SettingsFormState }) {
  const [state, setState] = useState<SettingsFormState>(initial);
  const [saving, setSaving] = useState(false);

  function field<K extends keyof SettingsFormState>(key: K, label: string, step = 0.01) {
    return (
      <div>
        <Label>{label}</Label>
        <Input
          type="number"
          step={step}
          value={state[key]}
          onChange={(e) =>
            setState({ ...state, [key]: Number(e.target.value) })
          }
        />
      </div>
    );
  }

  async function save(reset = false) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...state, resetBudget: reset }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success(reset ? "已重置今日預算 & 儲存設定" : "已儲存");
    } catch (err) {
      toast.error("儲存失敗", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>每日預算</CardTitle>
          <CardDescription>
            預算耗盡時，報價會自動依「Budget Factor」公式向下調整
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {field("budgetTotal", "今日預算上限 (HKD)", 100)}
            <div>
              <Label>今日已用 (唯讀)</Label>
              <Input type="number" value={state.budgetUsed} disabled />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => save(true)}
            disabled={saving}
          >
            <RotateCcw />
            重置今日預算
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>報價公式</CardTitle>
          <CardDescription>
            FinalPrice = MarketPrice × BaseMargin × Cond × Inv × Budget
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {field("baseMargin", "基礎毛利率 (0~1)")}
          </div>
          <Separator />
          <div>
            <Label className="text-base">Condition 係數</Label>
            <p className="mb-3 text-xs text-muted-foreground">
              S=全新；A=接近完美；B=輕微瑕疵；C=明顯磨損；D=重度磨損
            </p>
            <div className="grid gap-4 md:grid-cols-5">
              {field("conditionS", "S")}
              {field("conditionA", "A")}
              {field("conditionB", "B")}
              {field("conditionC", "C")}
              {field("conditionD", "D")}
            </div>
          </div>
          <Separator />
          <div>
            <Label className="text-base">庫存係數</Label>
            <p className="mb-3 text-xs text-muted-foreground">
              庫存高於門檻 → 折讓；低於門檻 → 加價
            </p>
            <div className="grid gap-4 md:grid-cols-4">
              {field("highStockFactor", "高庫存折扣")}
              {field("highStockThresh", "高庫存門檻", 1)}
              {field("lowStockFactor", "低庫存加價")}
              {field("lowStockThresh", "低庫存門檻", 1)}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save(false)} disabled={saving} size="lg">
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          儲存設定
        </Button>
      </div>
    </div>
  );
}
