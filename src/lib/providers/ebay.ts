import type { MarketProvider, ProviderQuery, ProviderQuote } from "./types";
import { toHkd } from "./types";

/**
 * eBay Browse API — active listings (asking prices), good for EN/Western cards.
 * Needs EBAY_BEARER_TOKEN. Returns up to 10 cheapest relevant listings.
 */

const TIMEOUT_MS = 8_000;

export const ebayProvider: MarketProvider = {
  id: "ebay",
  label: "eBay",
  isEnabled: () => Boolean(process.env.EBAY_BEARER_TOKEN),
  async fetch(query: ProviderQuery): Promise<ProviderQuote[]> {
    if (!process.env.EBAY_BEARER_TOKEN) return [];

    const q = [query.name, query.setCode, "Pokemon card"]
      .filter(Boolean)
      .join(" ");
    const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "10");
    url.searchParams.set("sort", "price");

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${process.env.EBAY_BEARER_TOKEN}`,
          "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        itemSummaries?: Array<{
          title?: string;
          price?: { value?: string; currency?: string };
          condition?: string;
          itemWebUrl?: string;
        }>;
      };
      const items = data.itemSummaries || [];
      const nameFirst = query.name.toLowerCase().split(" ")[0];

      return items
        .filter((it) =>
          nameFirst ? (it.title || "").toLowerCase().includes(nameFirst) : true,
        )
        .slice(0, 5)
        .map((it) => ({
          sourceId: "ebay",
          sourceLabel: "eBay",
          kind: "listing" as const,
          priceJpy: null,
          priceHkd: toHkd(it.price?.value, it.price?.currency || "USD"),
          conditionNote: it.condition || undefined,
          title: it.title || undefined,
          url: it.itemWebUrl || undefined,
        }))
        .filter((q) => q.priceHkd && q.priceHkd > 0);
    } catch (err) {
      console.warn("[ebay provider]", err);
      return [];
    }
  },
};
