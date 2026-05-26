import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetupForm } from "@/components/setup-form";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const count = await prisma.user.count();
  if (count > 0) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Sparkles className="h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold">CardMaster Pro</h1>
          <p className="text-sm text-muted-foreground">
            建立第一個管理員帳號（一次性）
          </p>
        </div>
        <SetupForm />
      </div>
    </div>
  );
}
