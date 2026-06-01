import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const Body = z.object({
  handle: z.string().min(1).transform((s) => s.replace(/^@/, "").trim()),
  shopName: z.string().min(1),
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session.user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const shops = await prisma.monitoredShop.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ shops });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const shop = await prisma.monitoredShop.create({ data: parsed.data });
    return NextResponse.json({ shop });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002")
      return NextResponse.json({ error: "此帳號已加入" }, { status: 409 });
    throw err;
  }
}
