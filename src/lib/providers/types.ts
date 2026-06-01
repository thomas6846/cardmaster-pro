/**
 * Market price provider interface — 買取チェッカー-style multi-source aggregation.
 *
 * Each provider knows how to look up ONE source (a shop, marketplace, or API)
 * and return that source's price quote(s) for a card in a normalised shape.
 * The aggregator (./index.ts) runs every enabled provider in parallel and
 * combines the results into a median / range + per-source breakdown.
 *
 * To add a new shop: write a module exporting a `MarketProvider`, register it
 * in ./index.ts. That's the whole extension surface.
 */

export type PriceKind = "buyback" | "sell" | "listing" | "sold";

export interface ProviderQuote {
  // Which source produced this — shown in the breakdown list.
  sourceId: string;
  sourceLabel: string;
  // buyback = what a shop pays; sell = retail; listing = asking; sold = closed.
  kind: PriceKind;
  priceJpy: number | null;
  priceHkd: number | null;
  // How the quote matched the query: "setCode" = exact collector-number hit
  // (high confidence, same card); "name" = looser name-contains (may be a
  // different variant). The aggregator prefers setCode matches when present.
  matchType?: "setCode" | "name";
  // e.g. "シュリンク無し", "未開封BOX", "PSA 10", or our S/A/B/C/D.
  conditionNote?: string;
  title?: string;
  url?: string;
  // How fresh — providers that cache or report "N days ago" fill this.
  asOf?: string;
}

export interface ProviderQuery {
  name: string;
  setCode?: string;
  language?: string;
  condition?: string;
}

export interface MarketProvider {
  id: string;
  label: string;
  // Whether this provider is configured (e.g. has its env token). The
  // aggregator skips providers that aren't enabled rather than erroring.
  isEnabled(): boolean;
  // Look up the card. Should never throw — return [] on failure. The
  // aggregator wraps in try/catch anyway but providers own their timeouts.
  fetch(query: ProviderQuery): Promise<ProviderQuote[]>;
}

/**
 * Normalise a setCode to a comparable join key. Japanese shops use the bare
 * collector number ("349/190", "116/080") while the AI / Pokémon TCG API adds
 * a set prefix ("SV4a-349/190", "M5-114/081"). We key on the "NNN/NNN"
 * collector-number portion when present, else fall back to a full strip — so
 * "SV4a-349/190" and "349/190" both become "349190" and match.
 */
export function normSetCode(s: string | null | undefined): string {
  if (!s) return "";
  const m = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return m[1] + m[2];
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const JPY_TO_HKD = Number(process.env.JPY_TO_HKD || 0.0505);
export const USD_TO_HKD = Number(process.env.USD_TO_HKD || 7.8);

export function jpyToHkd(jpy: number | null | undefined): number | null {
  if (!jpy || jpy <= 0) return null;
  return Math.round(jpy * JPY_TO_HKD);
}

export function toHkd(
  value: number | string | null | undefined,
  currency: string,
): number | null {
  const v = Number(value);
  if (!v || v <= 0) return null;
  const c = currency.toUpperCase();
  if (c === "HKD") return Math.round(v);
  if (c === "JPY") return Math.round(v * JPY_TO_HKD);
  if (c === "USD") return Math.round(v * USD_TO_HKD);
  return null;
}
