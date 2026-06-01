import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { aggregateMarket } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  cardName: z.string().min(1),
  cardCode: z.string().optional(),
  language: z.string().optional(),
  condition: z.string().optional(),
});

/**
 * POST /api/market-reference
 *
 * 買取チェッカー-style multi-source aggregation. Returns each enabled source's
 * price quote(s) plus a combined median / range. Sources that aren't
 * configured (no token) are listed as skipped so the UI can show what would
 * light up once credentials are added.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await aggregateMarket({
    name: parsed.data.cardName,
    setCode: parsed.data.cardCode,
    language: parsed.data.language,
    condition: parsed.data.condition,
  });

  return NextResponse.json(result);
}
