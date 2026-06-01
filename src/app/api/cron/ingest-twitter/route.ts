import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isXConfigured,
  getUserId,
  getRecentMediaTweets,
  imageUrlToDataUrl,
} from "@/lib/xapi";
import { extractBuybackTable, matchKey } from "@/lib/buybacktable";
import { shortId } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Auto-ingest buyback tables from monitored X accounts.
 *
 * For each enabled MonitoredShop:
 *   1. resolve user id (cached implicitly by X)
 *   2. fetch tweets newer than lastTweetId (since_id watermark — no re-OCR)
 *   3. for each image in each new tweet → Claude Vision OCR → CompetitorPrice
 *   4. advance lastTweetId
 *
 * Cost control: only NEW tweets, capped images per run. Protected by
 * CRON_SECRET bearer. Schedule via Railway Cron (e.g. every 6h).
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isXConfigured()) {
    return NextResponse.json({ error: "X_BEARER_TOKEN not set" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const maxTweetsPerShop = Number(searchParams.get("maxTweets") || 5);
  const maxImagesPerShop = Number(searchParams.get("maxImages") || 4);

  const shops = await prisma.monitoredShop.findMany({ where: { enabled: true } });
  const summary: Array<{ handle: string; tweets: number; rows: number; note?: string }> = [];

  for (const shop of shops) {
    let rowsTotal = 0;
    let tweetsProcessed = 0;
    let note = "";
    try {
      const userId = await getUserId(shop.handle);
      if (!userId) {
        note = "user not found";
        summary.push({ handle: shop.handle, tweets: 0, rows: 0, note });
        continue;
      }

      const { tweets, newestId } = await getRecentMediaTweets(
        userId,
        shop.lastTweetId,
        maxTweetsPerShop,
      );

      let imageBudget = maxImagesPerShop;
      for (const tw of tweets) {
        if (imageBudget <= 0) break;
        for (const imgUrl of tw.imageUrls) {
          if (imageBudget <= 0) break;
          imageBudget--;
          const dataUrl = await imageUrlToDataUrl(imgUrl);
          if (!dataUrl) continue;
          let extracted;
          try {
            extracted = await extractBuybackTable(dataUrl);
          } catch {
            continue;
          }
          if (extracted.rows.length === 0) continue;
          const ingestId = shortId() + shortId();
          await prisma.competitorPrice.createMany({
            data: extracted.rows.map((r) => ({
              shop: shop.shopName,
              cardName: r.cardName,
              setCode: r.setCode,
              priceJpy: r.priceJpy,
              conditionNote: r.conditionNote,
              matchKey: matchKey(r.cardName, r.setCode),
              sourceNote: `@${shop.handle}`,
              source: "twitter",
              tweetUrl: tw.tweetUrl,
              ingestId,
            })),
          });
          rowsTotal += extracted.rows.length;
        }
        tweetsProcessed++;
      }

      await prisma.monitoredShop.update({
        where: { id: shop.id },
        data: {
          lastTweetId: newestId || shop.lastTweetId,
          lastRunAt: new Date(),
          lastRunNote: `${tweetsProcessed} tweets, ${rowsTotal} rows`,
        },
      });
      note = `${tweetsProcessed} tweets, ${rowsTotal} rows`;
    } catch (err) {
      note = err instanceof Error ? err.message : String(err);
    }
    summary.push({ handle: shop.handle, tweets: tweetsProcessed, rows: rowsTotal, note });
  }

  await logAudit({
    action: "TWITTER_INGEST",
    entityType: "Settings",
    entityId: "cron",
    actor: "cron",
    payload: { summary },
  });

  return NextResponse.json({ ok: true, shops: shops.length, summary });
}

export async function GET(req: Request) {
  return POST(req);
}
