import type { MarketProvider, ProviderQuery, ProviderQuote } from "./types";
import { jpyToHkd } from "./types";

/**
 * yuyu-tei (遊々亭) — major JP Pokémon retailer. Openly scrapeable, no key.
 * Returns SELL price (retail). One clean number per matched card.
 */

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

function parse(html: string): YuyuteiCard[] {
  const cards: YuyuteiCard[] = [];
  for (const b of html.split("card-product").slice(1)) {
    const alt = b.match(/alt="([A-Z0-9]{1,4}\/[A-Z0-9]+)\s+([A-Z]{1,4})\s+([^"]+)"/);
    const price = b.match(/([0-9,]+)\s*円/);
    if (!alt || !price) continue;
    const priceJpy = Number(price[1].replace(/,/g, ""));
    if (priceJpy <= 0) continue;
    const stock = b.match(/在庫\s*:\s*([0-9]+)\s*点/);
    cards.push({
      setCode: alt[1],
      rarity: alt[2],
      name: alt[3].trim(),
      priceJpy,
      stock: stock ? Number(stock[1]) : 0,
    });
  }
  return cards;
}

function normCode(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Pull the leading Japanese (kana/kanji) run from an AI name like
// "ピカチュウ (Pikachu) - Munch's Scream Promo" -> "ピカチュウ". Falls back to
// the first whitespace token. Used as the yuyu-tei search term.
function coreName(name: string): string {
  const jp = name.match(/^[぀-ヿ一-鿿ｦ-ﾟ]+/);
  if (jp && jp[0].length >= 2) return jp[0];
  return name.split(/[\s(（]/)[0] || name;
}

function pickBest(cards: YuyuteiCard[], q: ProviderQuery): YuyuteiCard | null {
  if (!cards.length) return null;
  if (q.setCode) {
    const target = normCode(q.setCode);
    const byCode = cards.find((c) => normCode(c.setCode) === target);
    if (byCode) return byCode;
  }
  const core = coreName(q.name).toLowerCase();
  return cards.find((c) => c.name.toLowerCase().includes(core)) || cards[0];
}

export const yuyuteiProvider: MarketProvider = {
  id: "yuyu-tei",
  label: "遊々亭 (yuyu-tei)",
  isEnabled: () => true, // always on — no credentials needed
  async fetch(query: ProviderQuery): Promise<ProviderQuote[]> {
    async function search(term: string): Promise<YuyuteiCard[]> {
      const res = await fetch(
        "https://yuyu-tei.jp/sell/poc/s/search?search_word=" +
          encodeURIComponent(term),
        {
          headers: { "User-Agent": UA, "Accept-Language": "ja" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        },
      );
      if (!res.ok) return [];
      return parse(await res.text());
    }

    try {
      // 1. Search by setCode (precise). 2. If nothing parsed, search by the
      // card's core Japanese name — yuyu-tei often can't resolve raw setCodes.
      let cards = query.setCode ? await search(query.setCode) : [];
      const nameTerm = coreName(query.name);
      if (cards.length === 0 && nameTerm) {
        cards = await search(nameTerm);
      }
      const best = pickBest(cards, query);
      if (!best) return [];
      const isSetCodeMatch = Boolean(
        query.setCode &&
          best.setCode.toLowerCase().replace(/[^a-z0-9]/g, "") ===
            query.setCode.toLowerCase().replace(/[^a-z0-9]/g, ""),
      );
      return [
        {
          sourceId: "yuyu-tei",
          sourceLabel: "遊々亭",
          kind: "sell",
          matchType: isSetCodeMatch ? "setCode" : "name",
          priceJpy: best.priceJpy,
          priceHkd: jpyToHkd(best.priceJpy),
          conditionNote: best.rarity,
          title: `${best.name} ${best.setCode}`,
          url:
            "https://yuyu-tei.jp/sell/poc/s/search?search_word=" +
            encodeURIComponent(query.setCode || nameTerm),
        },
      ];
    } catch (err) {
      console.warn("[yuyu-tei provider]", err);
      return [];
    }
  },
};
