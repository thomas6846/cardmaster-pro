import type { MarketProvider, ProviderQuery, ProviderQuote } from "./types";
import { yuyuteiProvider } from "./yuyutei";
import { ebayProvider } from "./ebay";
import { snkrdunkProxyProvider } from "./snkrdunk-proxy";

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
  yuyuteiProvider,
  snkrdunkProxyProvider,
  ebayProvider,
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

  const quotes: ProviderQuote[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") quotes.push(...r.value);
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

export type { ProviderQuote, ProviderQuery } from "./types";
