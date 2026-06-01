import type { MarketProvider, ProviderQuery, ProviderQuote } from "./types";
import { jpyToHkd } from "./types";

/**
 * トレカバンク (torecabank) — direct buyback-list website scrape.
 *
 * store.torecabank.com/kaitori_list embeds its ENTIRE buyback catalogue as an
 * inline `const allProducts = [...]` JSON array (name, setCode, condition,
 * buy_price). No JS execution, no OCR, no X-API cost — and it's the whole
 * catalogue, not just whatever was in a tweet. Far better than Twitter for
 * this shop.
 *
 * The catalogue is cached in-process for 1h so repeated card scans don't
 * re-download 200KB each time.
 */

const URL = "https://store.torecabank.com/kaitori_list";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 60 * 60 * 1000;

interface TBProduct {
  name: string;
  setCode: string;
  rarity: string;
  condition: string;
  buyPrice: number;
}

let cache: { at: number; products: TBProduct[] } | null = null;

function normCode(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function coreName(name: string): string {
  // strip a leading "(PSA10)" / condition prefix, then take Japanese run
  const stripped = name.replace(/^\([^)]*\)\s*/, "");
  const jp = stripped.match(/[぀-ヿ一-鿿ｦ-ﾟ]+/);
  return (jp ? jp[0] : stripped.split(/[\s[【(（]/)[0] || stripped).toLowerCase();
}

async function loadCatalogue(): Promise<TBProduct[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.products;
  try {
    const res = await fetch(URL, {
      headers: { "User-Agent": UA, "Accept-Language": "ja" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return cache?.products || [];
    const html = await res.text();
    const i = html.indexOf("const allProducts =");
    if (i < 0) return cache?.products || [];
    const j = html.indexOf("];", i);
    const raw = html.slice(i + "const allProducts =".length, j + 1);
    const arr = JSON.parse(raw) as Array<{
      product_master_name?: string;
      product_master_key1?: string;
      product_master_key2?: string;
      product_type_name?: string;
      buy_price?: string;
    }>;
    const products: TBProduct[] = arr
      .map((p) => ({
        name: p.product_master_name || "",
        setCode: p.product_master_key2 || "",
        rarity: p.product_master_key1 || "",
        condition: p.product_type_name || "",
        buyPrice: Number(p.buy_price) || 0,
      }))
      .filter((p) => p.buyPrice > 0 && p.name);
    cache = { at: Date.now(), products };
    return products;
  } catch (err) {
    console.warn("[torecabank-web]", err);
    return cache?.products || [];
  }
}

export const torecabankWebProvider: MarketProvider = {
  id: "torecabank-web",
  label: "トレカバンク (web)",
  isEnabled: () => true,
  async fetch(query: ProviderQuery): Promise<ProviderQuote[]> {
    const products = await loadCatalogue();
    if (!products.length) return [];

    const wantCode = query.setCode ? normCode(query.setCode) : null;
    const core = coreName(query.name);

    // Prefer setCode matches; else name-core matches. Return up to 3 (e.g. raw
    // + PSA grades) so staff sees the condition spread.
    let matchType: "setCode" | "name" = "setCode";
    let hits = wantCode
      ? products.filter((p) => normCode(p.setCode) === wantCode)
      : [];
    if (hits.length === 0 && core.length >= 2) {
      matchType = "name";
      hits = products.filter((p) => p.name.toLowerCase().includes(core));
    }
    return hits.slice(0, 3).map((p) => ({
      sourceId: "torecabank-web",
      sourceLabel: "トレカバンク",
      kind: "buyback" as const,
      matchType,
      priceJpy: p.buyPrice,
      priceHkd: jpyToHkd(p.buyPrice),
      conditionNote: p.condition || p.rarity,
      title: `${p.name} ${p.setCode}`,
      url: URL,
    }));
  },
};
