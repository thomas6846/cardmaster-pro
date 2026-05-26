import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UsersAdmin } from "@/components/users-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });

  return (
    <div className="container max-w-4xl py-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft />
            返回
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">使用者管理</h1>
      </div>
      <UsersAdmin
        initialUsers={users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        }))}
        selfId={session.user.id}
      />
    </div>
  );
}
