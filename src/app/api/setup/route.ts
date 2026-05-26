import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(6, "密碼至少 6 位"),
  name: z.string().min(1),
});

/**
 * Bootstrap the first ADMIN account. Hard-gated: refuses if any user already
 * exists. After the first admin is created, admins manage everyone else via
 * /api/users.
 */
export async function GET() {
  const count = await prisma.user.count();
  return NextResponse.json({ needsSetup: count === 0 });
}

export async function POST(req: Request) {
  const count = await prisma.user.count();
  if (count > 0) {
    return NextResponse.json(
      { error: "Setup already complete" },
      { status: 409 },
    );
  }
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      passwordHash,
      role: "ADMIN",
    },
  });
  await logAudit({
    action: "USER_BOOTSTRAP",
    entityType: "User",
    entityId: user.id,
    actor: "system",
    payload: { email: user.email },
  });
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
