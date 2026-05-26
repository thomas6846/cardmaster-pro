"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

type Role = "STAFF" | "SUPERVISOR" | "ADMIN";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  active: boolean;
  createdAt: string;
}

export function UsersAdmin({
  initialUsers,
  selfId,
}: {
  initialUsers: User[];
  selfId: string;
}) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "STAFF" as Role,
  });

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "新增失敗");
      setUsers((prev) => [...prev, { ...data.user, createdAt: new Date().toISOString() }]);
      setForm({ name: "", email: "", password: "", role: "STAFF" });
      toast.success("已新增使用者");
    } catch (err) {
      toast.error("新增失敗", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCreating(false);
    }
  }

  async function updateRole(id: string, role: Role) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
      toast.success("角色已更新");
    } else {
      toast.error("更新失敗");
    }
  }

  async function deactivate(id: string) {
    if (!confirm("確定要停用此使用者嗎？")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, active: false } : u)),
      );
      toast.success("已停用");
    } else {
      toast.error("停用失敗");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">新增使用者</CardTitle>
          <CardDescription>店員可掃卡 / 主管可審批 / 管理員可改設定</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createUser} className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-1">
              <Label>姓名</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="md:col-span-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="md:col-span-1">
              <Label>密碼 (≥6)</Label>
              <Input
                type="password"
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div className="md:col-span-1">
              <Label>角色</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as Role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">STAFF（店員）</SelectItem>
                  <SelectItem value="SUPERVISOR">SUPERVISOR（主管）</SelectItem>
                  <SelectItem value="ADMIN">ADMIN（管理員）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end md:col-span-1">
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? <Loader2 className="animate-spin" /> : <Plus />}
                新增
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">所有使用者 ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 ${
                !u.active ? "opacity-50" : ""
              }`}
            >
              <div className="flex-1">
                <p className="font-medium">
                  {u.name || u.email}
                  {u.id === selfId && (
                    <span className="ml-2 text-xs text-muted-foreground">(你)</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {u.email} · 建立於 {formatDate(u.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!u.active && <Badge variant="secondary">已停用</Badge>}
                <Select
                  value={u.role}
                  onValueChange={(v) => updateRole(u.id, v as Role)}
                  disabled={u.id === selfId}
                >
                  <SelectTrigger className="h-9 w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAFF">STAFF</SelectItem>
                    <SelectItem value="SUPERVISOR">SUPERVISOR</SelectItem>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={u.id === selfId || !u.active}
                  onClick={() => deactivate(u.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
