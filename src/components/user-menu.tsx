"use client";

import { signOut } from "next-auth/react";
import { LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function UserMenu({
  name,
  email,
  role,
}: {
  name?: string | null;
  email?: string | null;
  role: "STAFF" | "SUPERVISOR" | "ADMIN";
}) {
  const roleVariant =
    role === "ADMIN" ? "destructive" : role === "SUPERVISOR" ? "warning" : "secondary";
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium leading-tight">{name || email}</p>
        <Badge variant={roleVariant} className="mt-0.5">
          {role}
        </Badge>
      </div>
      <UserIcon className="h-5 w-5 text-muted-foreground sm:hidden" />
      <Button
        variant="outline"
        size="sm"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="h-4 w-4" />
        登出
      </Button>
    </div>
  );
}
