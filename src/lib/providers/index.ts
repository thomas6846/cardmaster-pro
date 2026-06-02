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

  const quotes: ProviderQuote[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") quotes.push(...r.value);
  }

  // Sort setCode-exact matches first (high confidence = the exact card), then
  // by price. Name matches (same-name rough references — common for Twitter
  // rows with no collector number) follow, visually distinct via matchType.
  quotes.sort((a, b) => {
    const am = a.matchType === "setCode" ? 0 : 1;
    const bm = b.matchType === "setCode" ? 0 : 1;
    if (am !== bm) return am - bm;
    return (a.priceHkd ?? Infinity) - (b.priceHkd ?? Infinity);
  });

  // Median/range come from the setCode-exact subset when it exists (precise),
  // else from all matches (rough same-name reference). Stops a couple of
  // exact hits being diluted by noisy name matches, while still showing a
  // number when only name matches are available.
  const exactPrices = quotes
    .filter((q) => q.matchType === "setCode" && Number(q.priceHkd) > 0)
    .map((q) => q.priceHkd as number);
  const allPrices = quotes
    .map((q) => q.priceHkd)
    .filter((p): p is number => Number(p) > 0);
  const basis = exactPrices.length > 0 ? exactPrices : allPrices;

  return {
    query,
    quotes,
    sourcesQueried: enabled.map((p) => p.label),
    sourcesSkipped: skipped,
    medianHkd: median(basis),
    lowestHkd: basis.length ? Math.min(...basis) : null,
    highestHkd: basis.length ? Math.max(...basis) : null,
    sampleSize: allPrices.length,
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
  const q = result.quotes;
  const pick = (kind: string, exactOnly: boolean) =>
    q
      .filter(
        (x) =>
          x.kind === kind &&
          Number(x.priceHkd) > 0 &&
          (!exactOnly || x.matchType === "setCode"),
      )
      .map((x) => x.priceHkd as number);

  // Priority: exact buyback > exact retail > name buyback > name retail.
  // Buyback bases skip ×baseMargin (it's already a buyback figure) by
  // up-converting; retail bases stay raw so the engine applies the margin.
  const exactBuy = pick("buyback", true);
  if (exactBuy.length) {
    const m = median(exactBuy)!;
    return {
      marketPriceHkd: Math.round(m / (baseMargin || 0.65)),
      basis: "competitor-buyback",
      source: `同行收購中位·編號 (${exactBuy.length})`,
      rawHkd: m,
    };
  }
  const exactSell = pick("sell", true);
  if (exactSell.length) {
    const m = median(exactSell)!;
    return { marketPriceHkd: m, basis: "retail", source: "遊々亭 零售·編號", rawHkd: m };
  }
  const nameBuy = pick("buyback", false);
  if (nameBuy.length) {
    const m = median(nameBuy)!;
    return {
      marketPriceHkd: Math.round(m / (baseMargin || 0.65)),
      basis: "competitor-buyback",
      source: `同行收購中位·同名 (${nameBuy.length})`,
      rawHkd: m,
    };
  }
  const nameSell = pick("sell", false);
  if (nameSell.length) {
    const m = median(nameSell)!;
    return { marketPriceHkd: m, basis: "retail", source: "遊々亭 零售·同名", rawHkd: m };
  }
  return { marketPriceHkd: null, basis: "none", source: "", rawHkd: null };
}

export type { ProviderQuote, ProviderQuery } from "./types";
