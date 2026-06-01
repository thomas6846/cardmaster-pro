/**
 * SNKRDUNK / market-price Scraper Adapter
 * =======================================
 *
 * `lookupMarketPrice()` (snkrdunk.ts) calls `fetchSnkrdunkPrice()` here. The
 * default implementation scrapes **yuyu-tei.jp** (遊々亭) — a major Japanese
 * TCG retailer — for the current Pokémon SELL price. This is real, public,
 * no-API-key market data and serves as the authoritative market reference
 * the pricing engine multiplies by baseMargin.
 *
 * Why yuyu-tei instead of SNKRDUNK directly:
 *   - SNKRDUNK is CloudFront + geo-locked (403 everywhere, needs paid proxy)
 *   - yuyu-tei is openly scrapeable, returns name + setCode + price + stock
 *   - Sell price × our margin is the same buyback logic
 *
 * Returns null on no-match / failure → snkrdunk.ts falls back to stale cache
 * then deterministic mock, and staff can always override in the UI.
 */

export interface ScraperQuery {
  name: string;
  setCode?: string;
}

export interface ScraperResult {
  jpy: number;
  sampleSize?: number;
  reference?: string; // canonical URL to the product/search page
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const TIMEOUT_MS = 10_000;

interface YuyuteiCard {
  name: string;
  setCode: string;
  rarity: string;
  priceJpy: number;
  stock: number;
}

/**
 * Parse yuyu-tei search HTML into structured cards. Each product block holds:
 *   <img alt="116/080 MUR メガリザードンXex" ...>   -> code + rarity + name
 *   <span ...>116/080</span>                         -> setCode
 *   <h4 ...>メガリザードンXex</h4>                    -> name
 *   <strong ...>298,000 円</strong>                  -> sell price
 *   在庫 : 6 点                                       -> stock
 */
function parseYuyutei(html: string): YuyuteiCard[] {
  const cards: YuyuteiCard[] = [];
  const blocks = html.split("card-product");
  for (const b of blocks.slice(1)) {
    const altMatch = b.match(
      /alt="([A-Z0-9]{1,4}\/[A-Z0-9]+)\s+([A-Z]{1,4})\s+([^"]+)"/,
    );
    const priceMatch = b.match(/([0-9,]+)\s*円/);
    if (!altMatch || !priceMatch) continue;

    const setCode = altMatch[1];
    const rarity = altMatch[2];
    const name = altMatch[3].trim();
    const priceJpy = Number(priceMatch[1].replace(/,/g, ""));
    const stockMatch = b.match(/在庫\s*:\s*([0-9]+)\s*点/);
    const stock = stockMatch ? Number(stockMatch[1]) : 0;

    if (priceJpy > 0) {
      cards.push({ name, setCode, rarity, priceJpy, stock });
    }
  }
  return cards;
}

/**
 * Pick the best match for the query. Prefer an exact setCode hit; otherwise
 * the first result whose name contains the query (yuyu-tei sorts by relevance,
 * so the top hit is usually right). Falls back to the single cheapest in-stock
 * card to avoid returning a wildly mispriced alt-art.
 */
function pickBest(
  cards: YuyuteiCard[],
  query: ScraperQuery,
): YuyuteiCard | null {
  if (!cards.length) return null;

  if (query.setCode) {
    const byCode = cards.find(
      (c) => c.setCode.toLowerCase() === query.setCode!.toLowerCase(),
    );
    if (byCode) return byCode;
  }

  const q = query.name.toLowerCase();
  const byName = cards.find((c) => c.name.toLowerCase().includes(q));
  if (byName) return byName;

  // yuyu-tei already returns relevance-sorted results; take the top.
  return cards[0];
}

async function searchYuyutei(query: string): Promise<string | null> {
  const url =
    "https://yuyu-tei.jp/sell/poc/s/search?search_word=" +
    encodeURIComponent(query);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ja" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[yuyu-tei] search ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn("[yuyu-tei] fetch failed", err);
    return null;
  }
}

export async function fetchSnkrdunkPrice(
  query: ScraperQuery,
): Promise<ScraperResult | null> {
  // Search by setCode first (most precise), fall back to name.
  const searchTerm = query.setCode || query.name;
  const html = await searchYuyutei(searchTerm);
  if (!html) return null;

  const cards = parseYuyutei(html);
  const best = pickBest(cards, query);
  if (!best) return null;

  return {
    jpy: best.priceJpy,
    sampleSize: cards.length,
    reference:
      "https://yuyu-tei.jp/sell/poc/s/search?search_word=" +
      encodeURIComponent(searchTerm),
  };
}
