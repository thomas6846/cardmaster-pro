import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const unassigned = searchParams.get("unassigned") === "1";

  const cards = await prisma.card.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(unassigned ? { transactionId: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ cards });
}
