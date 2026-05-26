import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACTION_COLORS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
  SCAN: "secondary",
  TX_CREATE: "secondary",
  SUBMIT: "warning",
  APPROVE: "success",
  REJECT: "destructive",
  SETTLE: "success",
  SHOPIFY_INSTALL: "default",
  SHOPIFY_SYNC: "default",
  USER_CREATE: "default",
  USER_UPDATE: "outline",
  USER_DEACTIVATE: "destructive",
  USER_BOOTSTRAP: "default",
  QUOTE_UPDATE: "outline",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; actor?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const sp = await searchParams;
  const logs = await prisma.auditLog.findMany({
    where: {
      ...(sp.action ? { action: sp.action } : {}),
      ...(sp.actor ? { actor: { contains: sp.actor } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const actions = Array.from(new Set(logs.map((l) => l.action)));

  return (
    <div className="container max-w-5xl py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft />
            返回
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">稽核日誌</h1>
        <Badge variant="outline">最近 200 條</Badge>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">篩選</CardTitle>
          <CardDescription>
            <Link href="/admin/audit" className="text-primary hover:underline">
              全部
            </Link>
            {actions.map((a) => (
              <span key={a}>
                {" · "}
                <Link
                  href={`/admin/audit?action=${a}`}
                  className="text-primary hover:underline"
                >
                  {a}
                </Link>
              </span>
            ))}
          </CardDescription>
        </CardHeader>
      </Card>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            冇符合條件嘅 log
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const variant = ACTION_COLORS[log.action] || "outline";
            return (
              <Card key={log.id}>
                <CardContent className="flex items-start gap-3 p-3 text-sm">
                  <Badge variant={variant} className="shrink-0">
                    {log.action}
                  </Badge>
                  <div className="flex-1">
                    <p className="font-medium leading-tight">
                      {log.actor}{" "}
                      <span className="text-muted-foreground">·</span>{" "}
                      <span className="text-muted-foreground">
                        {log.entityType}:{log.entityId.slice(0, 8)}…
                      </span>
                    </p>
                    {log.payload != null && (
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                        {JSON.stringify(log.payload, null, 0).slice(0, 400)}
                      </pre>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
