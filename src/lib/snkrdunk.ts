import { prisma } from "./prisma";
import { fetchSnkrdunkPrice } from "./scraper";
import type { MarketLookup } from "./types";

const JPY_TO_HKD = parseFloat(process.env.JPY_TO_HKD_RATE || "0.0505");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Market price lookup pipeline:
 *
 *   1. Fresh cache hit (≤6 hr)        → return cached
 *   2. Custom scraper (see scraper.ts) → cache + return
 *   3. Stale cache (any age)          → return stale
 *   4. Deterministic mock             → return placeholder
 *
 * Staff can always override the result via the editable price input on the
 * scan UI; their override is saved as `SNKRDUNK (manual)` and skips the
 * lookup entirely on subsequent renders.
 */
export async function lookupMarketPrice(query: {
  name: string;
  setCode?: string;
}): Promise<MarketLookup> {
  const queryKey = normaliseKey(query);

  const cached = await prisma.snkrdunkPriceCache.findUnique({
    where: { queryKey },
  });
  if (cached && Date.now() - cached.scrapedAt.getTime() < CACHE_TTL_MS) {
    return cachedToLookup(cached, "SNKRDUNK (cached)");
  }

  try {
    const scraped = await fetchSnkrdunkPrice(query);
    if (scraped) {
      const hkd = Math.round(scraped.jpy * JPY_TO_HKD);
      await prisma.snkrdunkPriceCache.upsert({
        where: { queryKey },
        create: {
          queryKey,
          priceJpy: scraped.jpy,
          priceHkd: hkd,
          sampleSize: scraped.sampleSize,
          reference: scraped.reference,
        },
        update: {
          priceJpy: scraped.jpy,
          priceHkd: hkd,
          sampleSize: scraped.sampleSize,
          reference: scraped.reference,
          scrapedAt: new Date(),
        },
      });
      return {
        marketPrice: hkd,
        currency: "HKD",
        source: "SNKRDUNK",
        rawPrice: scraped.jpy,
        rawCurrency: "JPY",
        sampleSize: scraped.sampleSize,
        reference: scraped.reference,
      };
    }
  } catch (err) {
    console.warn("[snkrdunk] custom scraper threw", err);
  }

  if (cached) {
    return cachedToLookup(cached, "SNKRDUNK (stale)");
  }
  return mockLookup(query);
}

function normaliseKey(q: { name: string; setCode?: string }) {
  return `${q.name}|${q.setCode || ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cachedToLookup(
  cached: {
    priceHkd: number;
    priceJpy: number;
    sampleSize: number | null;
    reference: string | null;
  },
  source: string,
): MarketLookup {
  return {
    marketPrice: cached.priceHkd,
    currency: "HKD",
    source,
    rawPrice: cached.priceJpy,
    rawCurrency: "JPY",
    sampleSize: cached.sampleSize ?? undefined,
    reference: cached.reference ?? undefined,
  };
}

// Deterministic stub: stable per-card seed so demos / no-scraper installs
// still show a believable price the staff can override.
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
