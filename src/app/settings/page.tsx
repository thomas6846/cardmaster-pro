import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();
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
