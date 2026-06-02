import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const JPY_TO_HKD = Number(process.env.JPY_TO_HKD || 0.0505);

/**
 * GET /api/buyback-table/export[?shop=...&days=N]
 *
 * Exports ingested competitor buyback rows as CSV so staff can audit:
 *   - did the AI read the RIGHT card (cardName + setCode) from each image
 *   - what price was extracted, and the HKD conversion
 *   - which shop / source / original tweet it came from
 *
 * Admin/supervisor only. Excel opens this directly (UTF-8 BOM for kanji).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERVISOR") {
    return new Response("forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const shop = url.searchParams.get("shop") || undefined;
  const days = Number(url.searchParams.get("days") || "0");

  const where: { shop?: string; capturedAt?: { gte: Date } } = {};
  if (shop) where.shop = shop;
  if (days > 0) {
    where.capturedAt = { gte: new Date(Date.now() - days * 86_400_000) };
  }

  const rows = await prisma.competitorPrice.findMany({
    where,
    orderBy: [{ shop: "asc" }, { capturedAt: "desc" }],
    take: 20_000,
  });

  const headers = [
    "店名 shop",
    "AI判斷卡名 cardName",
    "setCode",
    "買取價JPY priceJpy",
    "買取價HKD priceHkd",
    "條件 condition",
    "來源 source",
    "帳號 handle",
    "原圖連結 tweetUrl",
    "捕捉時間 capturedAt",
  ];

  function esc(v: unknown): string {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.shop,
        r.cardName,
        r.setCode || "",
        Math.round(r.priceJpy),
        Math.round(r.priceJpy * JPY_TO_HKD),
        r.conditionNote || "",
        r.source,
        r.sourceNote || "",
        r.tweetUrl || "",
        r.capturedAt.toISOString(),
      ]
        .map(esc)
        .join(","),
    );
  }

  // UTF-8 BOM so Excel renders Japanese/Chinese correctly.
  const csv = "﻿" + lines.join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="competitor-buyback-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
