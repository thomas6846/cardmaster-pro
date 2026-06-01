/**
 * Market reference module — eBay Browse + SNKRDUNK proxy.
 *
 * Ported from staff-supplied Express prototype into Next.js / TypeScript.
 * Pulls active listings (NOT confirmed sold) from external marketplaces and
 * computes a "median of lowest 5" reference price as a sanity check against
 * our own pricing engine.
 *
 * This runs PARALLEL to the existing pricing flow — it does NOT replace the
 * authoritative `quoteCard()` engine. UI shows both so staff sees gap.
 *
 * Required env vars (any missing → that source skipped silently):
 *   EBAY_BEARER_TOKEN          eBay Browse API OAuth token
 *   EBAY_MARKETPLACE_ID        e.g. EBAY_US (default)
 *   SNKRDUNK_PROVIDER_URL      Your own SNKRDUNK proxy endpoint
 *   SNKRDUNK_PROVIDER_TOKEN    Bearer token for above (optional)
 *   USD_TO_HKD                 FX rate, default 7.8
 *   JPY_TO_HKD                 FX rate, default 0.05
 */

import type { Condition } from "./types";

type InternalCondition =
  | "MINT"
  | "NEAR_MINT"
  | "LIGHT_PLAYED"
  | "MODERATE_PLAYED";

interface ConditionSettings {
  internalCondition: InternalCondition;
  ebayCondition: string;
  snkrdunkCondition: string;
  multiplier: number;
}

const INTERNAL_CONDITION: Record<InternalCondition, Omit<ConditionSettings, "internalCondition">> = {
  MINT:            { ebayCondition: "MINT",            snkrdunkCondition: "A", multiplier: 0.75 },
  NEAR_MINT:       { ebayCondition: "NEAR_MINT",       snkrdunkCondition: "B", multiplier: 0.70 },
  LIGHT_PLAYED:    { ebayCondition: "LIGHT_PLAYED",    snkrdunkCondition: "C", multiplier: 0.60 },
  MODERATE_PLAYED: { ebayCondition: "MODERATE_PLAYED", snkrdunkCondition: "D", multiplier: 0.50 },
};

// Map our internal S/A/B/C/D scale to the external module's 4-tier scale.
// S (PSA 10 mint) and A (NM) both treated as MINT externally; D collapses to
// MODERATE_PLAYED (we don't expect to source PSA 1-3 cards regularly).
const SAB_TO_INTERNAL: Record<Condition, InternalCondition> = {
  S: "MINT",
  A: "MINT",
  B: "NEAR_MINT",
  C: "LIGHT_PLAYED",
  D: "MODERATE_PLAYED",
};

function normalizeCondition(condition: string): InternalCondition | null {
  if (!condition) return null;
  // Allow direct S/A/B/C/D from our domain.
  if (condition.length === 1 && condition in SAB_TO_INTERNAL) {
    return SAB_TO_INTERNAL[condition as Condition];
  }
  const value = condition.trim().toUpperCase().replace(/\s+/g, "_");
  const mapping: Record<string, InternalCondition> = {
    MINT: "MINT", M: "MINT",
    NEAR_MINT: "NEAR_MINT", NEARMINT: "NEAR_MINT", NM: "NEAR_MINT",
    LIGHT_PLAYED: "LIGHT_PLAYED", LIGHTLY_PLAYED: "LIGHT_PLAYED", LP: "LIGHT_PLAYED",
    MODERATE_PLAYED: "MODERATE_PLAYED",
    MODERATED_PLAYED: "MODERATE_PLAYED",
    MODERATELY_PLAYED: "MODERATE_PLAYED",
    MP: "MODERATE_PLAYED",
  };
  return mapping[value] || null;
}

function getConditionSettings(condition: string): ConditionSettings | null {
  const internalCondition = normalizeCondition(condition);
  if (!internalCondition) return null;
  return { internalCondition, ...INTERNAL_CONDITION[internalCondition] };
}

interface QueryInput {
  cardName?: string;
  cardCode?: string;
  setName?: string;
  language?: string;
  extraKeywords?: string;
}

function buildSearchQuery(input: QueryInput): string {
  return [
    input.cardName,
    input.cardCode,
    input.setName,
    input.language,
    input.extraKeywords,
    "Pokemon card",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function roundHKD(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value);
}

function convertToHKD(price: number | string | undefined, currency?: string): number | null {
  const value = Number(price);
  if (!value || value <= 0) return null;
  const code = String(currency || "HKD").toUpperCase();
  const rates: Record<string, number> = {
    HKD: 1,
    USD: Number(process.env.USD_TO_HKD || 7.8),
    JPY: Number(process.env.JPY_TO_HKD || 0.05),
  };
  const rate = rates[code];
  if (!rate) return null;
  return value * rate;
}

export interface MarketReferenceItem {
  source: "eBay" | "SNKRDUNK";
  type: string;
  platformConditionUsed: string;
  title: string;
  price: number;
  currency: string;
  priceHKD: number | null;
  listingCondition: string | null;
  itemUrl: string | null;
  imageUrl: string | null;
  seller: string | null;
}

function removeDuplicateReferences(items: MarketReferenceItem[]): MarketReferenceItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source}-${item.title}-${item.price}-${item.currency}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLikelyRelevantListing(item: MarketReferenceItem, input: QueryInput): boolean {
  const title = item.title.toLowerCase();
  const cardName = (input.cardName || "").toLowerCase();
  const cardCode = (input.cardCode || "").toLowerCase();
  const setName = (input.setName || "").toLowerCase();
  const language = (input.language || "").toLowerCase();

  const cardNameFirst = cardName.split(" ")[0];
  const setNameFirst = setName.split(" ")[0];

  const hasName = cardNameFirst ? title.includes(cardNameFirst) : false;
  const hasCode = cardCode ? title.includes(cardCode) : false;
  const hasSet = setNameFirst ? title.includes(setNameFirst) : false;
  const hasLang = language ? title.includes(language) : true;

  return (hasName || hasCode || hasSet) && hasLang;
}

interface FetchOpts {
  query: string;
  conditionSettings: ConditionSettings;
  limit?: number;
}

const TIMEOUT_MS = 8_000;

async function getEbayListings({
  query,
  conditionSettings,
  limit = 10,
}: FetchOpts): Promise<MarketReferenceItem[]> {
  if (!process.env.EBAY_BEARER_TOKEN) return [];

  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "price");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.EBAY_BEARER_TOKEN}`,
      "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`eBay ${res.status}`);

  const data = (await res.json()) as {
    itemSummaries?: Array<{
      title?: string;
      price?: { value?: string; currency?: string };
      condition?: string;
      itemWebUrl?: string;
      image?: { imageUrl?: string };
      seller?: { username?: string };
    }>;
  };
  const items = data.itemSummaries || [];

  return items.map((item) => ({
    source: "eBay" as const,
    type: "active_listing",
    platformConditionUsed: conditionSettings.ebayCondition,
    title: item.title || "",
    price: Number(item.price?.value || 0),
    currency: item.price?.currency || "USD",
    priceHKD: roundHKD(convertToHKD(item.price?.value, item.price?.currency || "USD")),
    listingCondition: item.condition || null,
    itemUrl: item.itemWebUrl || null,
    imageUrl: item.image?.imageUrl || null,
    seller: item.seller?.username || null,
  }));
}

async function getSnkrdunkListings({
  query,
  conditionSettings,
  limit = 10,
}: FetchOpts): Promise<MarketReferenceItem[]> {
  if (!process.env.SNKRDUNK_PROVIDER_URL) return [];

  const url = new URL(process.env.SNKRDUNK_PROVIDER_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("condition", conditionSettings.snkrdunkCondition);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: {
      ...(process.env.SNKRDUNK_PROVIDER_TOKEN
        ? { Authorization: `Bearer ${process.env.SNKRDUNK_PROVIDER_TOKEN}` }
        : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SNKRDUNK proxy ${res.status}`);

  const data = (await res.json()) as {
    items?: Array<{
      title?: string;
      price?: number | string;
      currency?: string;
      condition?: string;
      type?: string;
      url?: string;
      imageUrl?: string;
      seller?: string;
    }>;
  };
  const items = data.items || [];

  return items.map((item) => ({
    source: "SNKRDUNK" as const,
    type: item.type || "active_listing",
    platformConditionUsed: conditionSettings.snkrdunkCondition,
    title: item.title || "",
    price: Number(item.price || 0),
    currency: item.currency || "JPY",
    priceHKD: roundHKD(convertToHKD(item.price, item.currency || "JPY")),
    listingCondition: item.condition || conditionSettings.snkrdunkCondition,
    itemUrl: item.url || null,
    imageUrl: item.imageUrl || null,
    seller: item.seller || null,
  }));
}

export interface MarketReferencePricing {
  marketReferenceHKD: number | null;
  lowestReferenceHKD: number | null;
  highestReferenceHKD: number | null;
  conditionRate: number;
  suggestedBuybackPriceHKD: number | null;
  pricingMethod: string;
}

function calculateSuggestedBuybackPrice({
  references,
  conditionSettings,
}: {
  references: MarketReferenceItem[];
  conditionSettings: ConditionSettings;
}): MarketReferencePricing {
  const validPrices = references
    .map((r) => r.priceHKD)
    .filter((p): p is number => Number(p) > 0)
    .sort((a, b) => a - b);

  if (!validPrices.length) {
    return {
      marketReferenceHKD: null,
      lowestReferenceHKD: null,
      highestReferenceHKD: null,
      conditionRate: conditionSettings.multiplier,
      suggestedBuybackPriceHKD: null,
      pricingMethod: "No valid market reference found.",
    };
  }

  // Active listings are inflated asking prices — use the bottom slice to
  // avoid overpaying. Median of lowest 5 is the user's heuristic.
  const lowestFive = validPrices.slice(0, 5);
  const marketRef = median(lowestFive) || 0;
  const suggested = marketRef * conditionSettings.multiplier;

  return {
    marketReferenceHKD: roundHKD(marketRef),
    lowestReferenceHKD: roundHKD(Math.min(...lowestFive)),
    highestReferenceHKD: roundHKD(Math.max(...lowestFive)),
    conditionRate: conditionSettings.multiplier,
    suggestedBuybackPriceHKD: roundHKD(suggested),
    pricingMethod: "Median of lowest 5 relevant active listings × condition multiplier.",
  };
}

export interface MarketReferenceInput {
  cardName?: string;
  cardCode?: string;
  setName?: string;
  language?: string;
  condition: string;
  cardImageUrl?: string;
  extraKeywords?: string;
  limit?: number;
  returnLimit?: number;
}

export interface MarketReferenceResult {
  success: boolean;
  card: {
    cardName: string | null;
    cardCode: string | null;
    setName: string | null;
    language: string | null;
    imageUrl: string | null;
  };
  condition: {
    internal: InternalCondition;
    ebay: string;
    snkrdunk: string;
  };
  searchQuery: string;
  references: MarketReferenceItem[];
  pricing: MarketReferencePricing;
  warning: string;
}

export async function getMarketReferenceForBuyback(
  input: MarketReferenceInput,
): Promise<MarketReferenceResult> {
  const conditionSettings = getConditionSettings(input.condition);
  if (!conditionSettings) {
    throw new Error(
      "Invalid condition. Use S, A, B, C, D or MINT, NEAR_MINT, LIGHT_PLAYED, MODERATE_PLAYED.",
    );
  }
  if (!input.cardName && !input.cardCode) {
    throw new Error("cardName or cardCode is required.");
  }

  const query = buildSearchQuery(input);

  const [ebay, snkrdunk] = await Promise.all([
    getEbayListings({
      query,
      conditionSettings,
      limit: input.limit || 10,
    }).catch((err) => {
      console.warn("[marketref] eBay failed:", err.message);
      return [] as MarketReferenceItem[];
    }),
    getSnkrdunkListings({
      query,
      conditionSettings,
      limit: input.limit || 10,
    }).catch((err) => {
      console.warn("[marketref] SNKRDUNK failed:", err.message);
      return [] as MarketReferenceItem[];
    }),
  ]);

  const combined = removeDuplicateReferences([...ebay, ...snkrdunk])
    .filter((item) => Number(item.priceHKD) > 0)
    .filter((item) => isLikelyRelevantListing(item, input))
    .sort((a, b) => Number(a.priceHKD) - Number(b.priceHKD))
    .slice(0, input.returnLimit || 10);

  const pricing = calculateSuggestedBuybackPrice({
    references: combined,
    conditionSettings,
  });

  return {
    success: true,
    card: {
      cardName: input.cardName || null,
      cardCode: input.cardCode || null,
      setName: input.setName || null,
      language: input.language || null,
      imageUrl: input.cardImageUrl || null,
    },
    condition: {
      internal: conditionSettings.internalCondition,
      ebay: conditionSettings.ebayCondition,
      snkrdunk: conditionSettings.snkrdunkCondition,
    },
    searchQuery: query,
    references: combined,
    pricing,
    warning:
      "Market references are based on accessible active listings, not confirmed sold prices.",
  };
}
