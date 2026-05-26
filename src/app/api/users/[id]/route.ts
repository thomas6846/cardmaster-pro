import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const PatchBody = z.object({
  name: z.string().optional(),
  role: z.enum(["STAFF", "SUPERVISOR", "ADMIN"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, active: true },
  });

  await logAudit({
    action: "USER_UPDATE",
    entityType: "User",
    entityId: id,
    actor: session.user.email || session.user.id,
    payload: { changed: Object.keys(data) },
  });

  return NextResponse.json({ user });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "Cannot delete self" },
      { status: 400 },
    );
  }
  await prisma.user.update({
    where: { id },
    data: { active: false },
  });
  await logAudit({
    action: "USER_DEACTIVATE",
    entityType: "User",
    entityId: id,
    actor: session.user.email || session.user.id,
  });
  return NextResponse.json({ ok: true });
}
