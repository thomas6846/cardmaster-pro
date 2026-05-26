import Link from "next/link";
import {
  ScanLine,
  ShieldCheck,
  Settings as SettingsIcon,
  Receipt,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/user-menu";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getDashboard() {
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
  const [s, totalCards, pending, settledToday, scansToday, overridesToday, syncedSettled, totalSettled] =
    await Promise.all([
      getSettings(),
      prisma.card.count(),
      prisma.transaction.count({ where: { status: "pending_approval" } }),
      prisma.transaction.count({
        where: { status: "settled", settledAt: { gte: startOfToday } },
      }),
      prisma.card.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.card.count({
        where: {
          createdAt: { gte: startOfToday },
          conditionConfirmedByStaff: true,
        },
      }),
      prisma.transaction.count({
        where: { status: "settled", shopifySynced: true },
      }),
      prisma.transaction.count({ where: { status: "settled" } }),
    ]);
  const overrideRate = scansToday > 0 ? Math.round((overridesToday / scansToday) * 100) : 0;
  const aiAccuracy = scansToday > 0 ? 100 - overrideRate : null;
  const shopifyRate =
    totalSettled > 0 ? Math.round((syncedSettled / totalSettled) * 100) : null;
  return {
    settings: s,
    totalCards,
    pending,
    settledToday,
    scansToday,
    aiAccuracy,
    shopifyRate,
  };
}

export default async function Home() {
  const [session, dash] = await Promise.all([auth(), getDashboard()]);
  const { settings, totalCards, pending, settledToday, scansToday, aiAccuracy, shopifyRate } = dash;
  const remaining = Math.max(0, settings.budgetTotal - settings.budgetUsed);
  const pct = settings.budgetTotal
    ? (settings.budgetUsed / settings.budgetTotal) * 100
    : 0;
  const role = session?.user?.role || "STAFF";
  const isAdmin = role === "ADMIN";

  return (
    <div className="container py-10">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">CardMaster Pro</h1>
            <Badge variant="secondary">v0.1.0</Badge>
          </div>
          <p className="mt-2 text-muted-foreground">
            AI 識別 · SNKRDUNK 行情 · Shopify 同步 · Telegram 審批
          </p>
        </div>
        {session?.user && (
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            role={role}
          />
        )}
      </header>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>今日預算</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(remaining)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 rounded-full bg-secondary">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              已用 {formatCurrency(settings.budgetUsed)} / {formatCurrency(settings.budgetTotal)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>今日掃描 / 成交</CardDescription>
            <CardTitle className="text-2xl">
              {scansToday} / {settledToday}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">累計卡牌 {totalCards}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>待主管審批</CardDescription>
            <CardTitle className="text-2xl">{pending}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>AI Condition 準確度 (今日)</CardDescription>
            <CardTitle className="text-2xl">
              {aiAccuracy === null ? "—" : `${aiAccuracy}%`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Shopify 同步 {shopifyRate === null ? "—" : `${shopifyRate}%`}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <ActionCard
          href="/scan"
          icon={<ScanLine className="h-6 w-6" />}
          title="開始買取"
          description="掃描客人帶來的卡牌，AI 自動識別 + 即時報價"
          cta="進入店員介面"
        />
        <ActionCard
          href="/history"
          icon={<Receipt className="h-6 w-6" />}
          title="買取記錄"
          description="查看歷史交易、補印買取協議書"
          cta="查看記錄"
        />
        {isAdmin && (
          <ActionCard
            href="/settings"
            icon={<SettingsIcon className="h-6 w-6" />}
            title="系統設定"
            description="預算上限、報價公式係數、Condition 係數"
            cta="調整設定"
          />
        )}
        {isAdmin && (
          <ActionCard
            href="/admin/users"
            icon={<Users className="h-6 w-6" />}
            title="使用者管理"
            description="新增/停用 店員、主管、管理員"
            cta="管理帳號"
          />
        )}
        {!isAdmin && (
          <Card>
            <CardHeader>
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
              <CardTitle className="text-lg">主管審批</CardTitle>
              <CardDescription>
                連結會透過 Telegram 推送，主管直接點開審批
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                你嘅角色：<Badge variant="outline">{role}</Badge>
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="text-primary">{icon}</div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        <Link href={href}>
          <Button className="w-full">{cta}</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
