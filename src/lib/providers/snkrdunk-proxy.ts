import type { MarketProvider, ProviderQuery, ProviderQuote } from "./types";
import { toHkd } from "./types";

/**
 * Generic external-proxy provider. Points at SNKRDUNK_PROVIDER_URL — your own
 * SNKRDUNK scraper / paid proxy / kaitori aggregator endpoint. Expected to
 * return `{ items: [{ title, price, currency, condition, url, shop }] }`.
 *
 * This is the slot to plug in a real buyback-price source (a scraper you host
 * for one of the JP shops, or a paid proxy hitting SNKRDUNK directly).
 */

const TIMEOUT_MS = 10_000;

export const snkrdunkProxyProvider: MarketProvider = {
  id: "snkrdunk-proxy",
  label: "SNKRDUNK / Proxy",
  isEnabled: () => Boolean(process.env.SNKRDUNK_PROVIDER_URL),
  async fetch(query: ProviderQuery): Promise<ProviderQuote[]> {
    if (!process.env.SNKRDUNK_PROVIDER_URL) return [];

    const url = new URL(process.env.SNKRDUNK_PROVIDER_URL);
    url.searchParams.set("q", query.setCode || query.name);
    if (query.condition) url.searchParams.set("condition", query.condition);
    url.searchParams.set("limit", "10");

    try {
      const res = await fetch(url.toString(), {
        headers: process.env.SNKRDUNK_PROVIDER_TOKEN
          ? { Authorization: `Bearer ${process.env.SNKRDUNK_PROVIDER_TOKEN}` }
          : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        items?: Array<{
          title?: string;
          price?: number | string;
          currency?: string;
          condition?: string;
          url?: string;
          shop?: string;
          asOf?: string;
        }>;
      };
      return (data.items || [])
        .map((it) => ({
          sourceId: "snkrdunk-proxy",
          sourceLabel: it.shop || "SNKRDUNK",
          kind: "buyback" as const,
          priceJpy:
            (it.currency || "JPY").toUpperCase() === "JPY"
              ? Number(it.price) || null
              : null,
          priceHkd: toHkd(it.price, it.currency || "JPY"),
          conditionNote: it.condition,
          title: it.title,
          url: it.url,
          asOf: it.asOf,
        }))
        .filter((q) => q.priceHkd && q.priceHkd > 0);
    } catch (err) {
      console.warn("[snkrdunk-proxy provider]", err);
      return [];
    }
  },
};
