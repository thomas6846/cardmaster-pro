import { prisma } from "./prisma";
import type { MarketLookup } from "./types";

const JPY_TO_HKD = parseFloat(process.env.JPY_TO_HKD_RATE || "0.0505");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * SNKRDUNK is CloudFront-protected + geo-locked. We proxy through ScraperAPI
 * (JS rendering + JP IP rotation) and cache aggressively to keep credit usage
 * sane. On any failure we fall back to a deterministic mock so the UI never
 * blocks on the integration being down.
 *
 * URL strategy: SNKRDUNK's search uses Japanese path. We hit the search page,
 * let ScraperAPI render it, then extract the first result's price from
 * `__NEXT_DATA__` or visible markup.
 */
export async function lookupMarketPrice(query: {
  name: string;
  setCode?: string;
}): Promise<MarketLookup> {
  const queryKey = normaliseKey(query);

  // Cache hit?
  const cached = await prisma.snkrdunkPriceCache.findUnique({
    where: { queryKey },
  });
  if (cached && Date.now() - cached.scrapedAt.getTime() < CACHE_TTL_MS) {
    return {
      marketPrice: cached.priceHkd,
      currency: "HKD",
      source: "SNKRDUNK (cached)",
      rawPrice: cached.priceJpy,
      rawCurrency: "JPY",
      sampleSize: cached.sampleSize ?? undefined,
      reference: cached.reference ?? undefined,
    };
  }

  if (process.env.SCRAPERAPI_KEY) {
    try {
      const scraped = await scrapeViaProxy(query);
      await prisma.snkrdunkPriceCache.upsert({
        where: { queryKey },
        create: {
          queryKey,
          priceJpy: scraped.rawPrice ?? 0,
          priceHkd: scraped.marketPrice,
          sampleSize: scraped.sampleSize,
          reference: scraped.reference,
        },
        update: {
          priceJpy: scraped.rawPrice ?? 0,
          priceHkd: scraped.marketPrice,
          sampleSize: scraped.sampleSize,
          reference: scraped.reference,
          scrapedAt: new Date(),
        },
      });
      return scraped;
    } catch (err) {
      console.warn("[snkrdunk] scrape failed", err);
      // Stale cache > mock if we have it.
      if (cached) {
        return {
          marketPrice: cached.priceHkd,
          currency: "HKD",
          source: "SNKRDUNK (stale)",
          rawPrice: cached.priceJpy,
          rawCurrency: "JPY",
          sampleSize: cached.sampleSize ?? undefined,
          reference: cached.reference ?? undefined,
        };
      }
    }
  }
  return mockLookup(query);
}

function normaliseKey(q: { name: string; setCode?: string }) {
  return `${q.name}|${q.setCode || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeViaProxy(query: {
  name: string;
  setCode?: string;
}): Promise<MarketLookup> {
  const searchTerm = query.setCode || query.name;
  const target = `https://snkrdunk.com/search?q=${encodeURIComponent(searchTerm)}`;
  const proxyUrl = new URL("https://api.scraperapi.com/");
  proxyUrl.searchParams.set("api_key", process.env.SCRAPERAPI_KEY!);
  proxyUrl.searchParams.set("url", target);
  proxyUrl.searchParams.set("country_code", process.env.SCRAPERAPI_COUNTRY || "jp");
  proxyUrl.searchParams.set("render", "true");
  proxyUrl.searchParams.set("device_type", "desktop");

  const res = await fetch(proxyUrl.toString(), {
    cache: "no-store",
    // ScraperAPI can take 30-60s for JS render. We give 45s.
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`ScraperAPI ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const html = await res.text();
  const parsed = parsePrice(html);
  if (!parsed) {
    throw new Error("Could not locate price in HTML response");
  }

  const hkd = Math.round(parsed.jpy * JPY_TO_HKD);
  return {
    marketPrice: hkd,
    currency: "HKD",
    source: "SNKRDUNK",
    rawPrice: parsed.jpy,
    rawCurrency: "JPY",
    sampleSize: parsed.tradeCount,
    reference: parsed.url || target,
  };
}

/**
 * Best-effort price extraction. SNKRDUNK is Next.js, so we first try the
 * embedded __NEXT_DATA__ JSON which is the most stable surface. If that fails
 * we fall back to scraping visible price text near common selectors.
 */
function parsePrice(
  html: string,
): { jpy: number; tradeCount?: number; url?: string } | null {
  // Strategy 1: __NEXT_DATA__
  const nextMatch = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (nextMatch) {
    try {
      const data = JSON.parse(nextMatch[1]);
      const found = walkForPrice(data);
      if (found) return found;
    } catch {
      /* fall through */
    }
  }

  // Strategy 2: visible markup — search the page for ¥123,456 patterns
  // near "最終取引価格" (last sale price) / "平均取引価格" (avg trade price).
  const priceNearLastSale = html.match(
    /最終取引価格[\s\S]{0,200}?¥\s*([\d,]+)/,
  );
  if (priceNearLastSale) {
    const jpy = Number(priceNearLastSale[1].replace(/,/g, ""));
    if (jpy > 0) return { jpy };
  }
  const priceFallback = html.match(/¥\s*([\d,]+)/);
  if (priceFallback) {
    const jpy = Number(priceFallback[1].replace(/,/g, ""));
    if (jpy > 0) return { jpy };
  }
  return null;
}

// Recursive search for "lastSalePrice" / "lastTradePrice" / "price" fields.
function walkForPrice(
  obj: unknown,
): { jpy: number; tradeCount?: number; url?: string } | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const priceKeys = ["lastSalePrice", "lastTradePrice", "marketPrice", "price"];
  for (const k of priceKeys) {
    const v = o[k];
    if (typeof v === "number" && v > 0) {
      return {
        jpy: v,
        tradeCount:
          typeof o.tradeCount === "number" ? o.tradeCount : undefined,
        url: typeof o.url === "string" ? o.url : undefined,
      };
    }
  }
  for (const v of Object.values(o)) {
    const r = walkForPrice(v);
    if (r) return r;
  }
  return null;
}

// Deterministic stub for offline/dev so demos always show a number.
function mockLookup(query: { name: string; setCode?: string }): MarketLookup {
  const seedSrc = `${query.name}|${query.setCode || ""}`.toLowerCase();
  let h = 0;
  for (let i = 0; i < seedSrc.length; i++) {
    h = (h * 31 + seedSrc.charCodeAt(i)) >>> 0;
  }
  const jpyTiers = [500, 1200, 2500, 4800, 8800, 15000, 28000, 55000, 95000];
  const rawJpy = jpyTiers[h % jpyTiers.length];
  const hkd = Math.round(rawJpy * JPY_TO_HKD);
  return {
    marketPrice: hkd,
    currency: "HKD",
    source: "MOCK_SNKRDUNK",
    rawPrice: rawJpy,
    rawCurrency: "JPY",
    sampleSize: 5 + (h % 80),
    lastSoldAt: new Date().toISOString(),
  };
}
