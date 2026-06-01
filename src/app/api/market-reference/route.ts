import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getMarketReferenceForBuyback } from "@/lib/marketreference";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  cardName: z.string().optional(),
  cardCode: z.string().optional(),
  setName: z.string().optional(),
  language: z.string().optional(),
  condition: z.string().min(1),
  cardImageUrl: z.string().optional(),
  extraKeywords: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  returnLimit: z.number().int().min(1).max(50).optional(),
});

/**
 * POST /api/market-reference
 *
 * Look up market reference prices from eBay + SNKRDUNK proxy in parallel.
 * Returns asking-price-based reference (median of lowest 5) for sanity-
 * checking the internal pricing engine output. Does NOT replace our quote.
 *
 * Used by the staff scanner UI when staff hits "睇市場參考" on a card.
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

  try {
    const result = await getMarketReferenceForBuyback(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }
}
