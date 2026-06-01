import type { MarketProvider, ProviderQuery, ProviderQuote } from "./types";
import { yuyuteiProvider } from "./yuyutei";
import { ebayProvider } from "./ebay";
import { snkrdunkProxyProvider } from "./snkrdunk-proxy";
import { competitorProvider } from "./competitor";
import { torecabankWebProvider } from "./torecabank-web";

/**
 * Market aggregator — the 買取チェッカー-style engine.
 *
 * Runs every ENABLED provider in parallel, collects all quotes, and computes
 * a combined reference: median / lowest / highest across sources, plus the
 * full per-source breakdown so the UI can list each shop like the app does.
 *
 * Add a shop = append its provider to PROVIDERS below.
 */

const PROVIDERS: MarketProvider[] = [
  torecabankWebProvider, // トレカバンク buyback catalogue (direct web scrape)
  competitorProvider, // 同行收購表 (Claude Vision OCR of rival 買取表 images)
  yuyuteiProvider, // 遊々亭 retail
  snkrdunkProxyProvider, // your own SNKRDUNK/buyback proxy
  ebayProvider, // eBay listings (EN cards)
];

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export interface AggregateResult {
  query: ProviderQuery;
  // Per-source quotes, sorted by HKD price ascending (cheapest first).
  quotes: ProviderQuote[];
  // Sources that ran (enabled) vs skipped (not configured).
  sourcesQueried: string[];
  sourcesSkipped: string[];
  // Combined reference across all quotes with a valid HKD price.
  medianHkd: number | null;
  lowestHkd: number | null;
  highestHkd: number | null;
  sampleSize: number;
}

export async function aggregateMarket(
  query: ProviderQuery,
): Promise<AggregateResult> {
  const enabled = PROVIDERS.filter((p) => p.isEnabled());
  const skipped = PROVIDERS.filter((p) => !p.isEnabled()).map((p) => p.label);

  const settled = await Promise.allSettled(
    enabled.map((p) => p.fetch(query)),
  );

  let quotes: ProviderQuote[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") quotes.push(...r.value);
  }

  // Precision filter: if a setCode was queried AND we got any setCode-exact
  // matches, drop the looser name-matches — they're often a DIFFERENT variant
  // of the same character and blow out the range (e.g. リザードン vs the exact
  // リザードンex SAR). Keeps the panel + median honest.
  if (query.setCode) {
    const exact = quotes.filter((q) => q.matchType === "setCode");
    if (exact.length > 0) quotes = exact;
  }

  const prices = quotes
    .map((q) => q.priceHkd)
    .filter((p): p is number => Number(p) > 0);

  quotes.sort((a, b) => (a.priceHkd ?? Infinity) - (b.priceHkd ?? Infinity));

  return {
    query,
    quotes,
    sourcesQueried: enabled.map((p) => p.label),
    sourcesSkipped: skipped,
    medianHkd: median(prices),
    lowestHkd: prices.length ? Math.min(...prices) : null,
    highestHkd: prices.length ? Math.max(...prices) : null,
    sampleSize: prices.length,
  };
}

export interface MarketBasis {
  // Retail-equivalent HKD price to feed the pricing engine's marketPrice slot.
  // For buyback-sourced data we up-convert by /baseMargin so the engine's
  // ×baseMargin gives back the real buyback figure (no double discount).
  marketPriceHkd: number | null;
  // What the basis came from, for display + transparency.
  basis: "competitor-buyback" | "retail" | "none";
  source: string;
  rawHkd: number | null; // the actual median before any conversion
}

/**
 * Derive the single market price the pricing engine should use, from the
 * aggregated quotes. Priority:
 *   1. Competitor BUYBACK median (what rival shops actually pay) — most direct.
 *      Returned as retail-equivalent (median / baseMargin) so the engine's
 *      ×baseMargin reproduces the real buyback number.
 *   2. Retail (yuyu-tei) median — used as-is (engine applies baseMargin).
 *   3. none — caller falls back to its own mock.
 */
export function deriveMarketBasis(
  result: AggregateResult,
  baseMargin: number,
): MarketBasis {
  const buybacks = result.quotes
    .filter((q) => q.kind === "buyback" && Number(q.priceHkd) > 0)
    .map((q) => q.priceHkd as number);
  if (buybacks.length > 0) {
    const m = median(buybacks)!;
    return {
      marketPriceHkd: Math.round(m / (baseMargin || 0.65)),
      basis: "competitor-buyback",
      source: `同行收購中位 (${buybacks.length})`,
      rawHkd: m,
    };
  }
  const retails = result.quotes
    .filter((q) => q.kind === "sell" && Number(q.priceHkd) > 0)
    .map((q) => q.priceHkd as number);
  if (retails.length > 0) {
    const m = median(retails)!;
    return { marketPriceHkd: m, basis: "retail", source: "遊々亭 零售", rawHkd: m };
  }
  return { marketPriceHkd: null, basis: "none", source: "", rawHkd: null };
}

export type { ProviderQuote, ProviderQuery } from "./types";
