import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { extractBuybackTable, matchKey } from "@/lib/buybacktable";
import { shortId } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  imageDataUrl: z.string().min(50),
  shopOverride: z.string().optional(),
  sourceNote: z.string().optional(),
});

/**
 * POST /api/buyback-table
 *
 * Admin/supervisor uploads a rival shop's 買取表 image. Claude Vision OCRs it
 * into structured rows, which are stored as CompetitorPrice and immediately
 * available to the market aggregator's competitor provider.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERVISOR") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let extracted;
  try {
    extracted = await extractBuybackTable(parsed.data.imageDataUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const shop = parsed.data.shopOverride || extracted.shop || "未知店舖";
  const ingestId = shortId() + shortId();

  if (extracted.rows.length > 0) {
    await prisma.competitorPrice.createMany({
      data: extracted.rows.map((r) => ({
        shop,
        cardName: r.cardName,
        setCode: r.setCode,
        priceJpy: r.priceJpy,
        conditionNote: r.conditionNote,
        matchKey: matchKey(r.cardName, r.setCode),
        sourceNote: parsed.data.sourceNote,
        ingestId,
      })),
    });
  }

  await logAudit({
    action: "BUYBACK_TABLE_INGEST",
    entityType: "Settings",
    entityId: ingestId,
    actor: session.user.email || session.user.id,
    payload: { shop, rowCount: extracted.rows.length },
  });

  return NextResponse.json({
    ok: true,
    shop,
    ingestId,
    rowCount: extracted.rows.length,
    rows: extracted.rows,
  });
}
