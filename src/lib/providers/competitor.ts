import type { MarketProvider, ProviderQuery, ProviderQuote } from "./types";
import { jpyToHkd } from "./types";
import { prisma } from "../prisma";
import { matchKey } from "../buybacktable";

/**
 * Competitor buyback prices — sourced from rival-shop 買取表 images that
 * staff OCR'd via /api/buyback-table (Claude Vision). This is the closest
 * thing to 買取チェッカー's per-shop buyback data, ingested manually (or via
 * X API later) and stored in CompetitorPrice.
 *
 * Matches the queried card by exact matchKey first, then a name-contains
 * fallback. Returns the most recent capture per shop (dedupe).
 */
export const competitorProvider: MarketProvider = {
  id: "competitor",
  label: "同行收購表",
  isEnabled: () => true,
  async fetch(query: ProviderQuery): Promise<ProviderQuote[]> {
    try {
      const key = matchKey(query.name, query.setCode);
      const codeKey = query.setCode
        ? matchKey(query.name, query.setCode)
        : null;

      // Exact matchKey OR name contains query OR setCode contains.
      const rows = await prisma.competitorPrice.findMany({
        where: {
          OR: [
            { matchKey: key },
            ...(codeKey ? [{ matchKey: codeKey }] : []),
            { cardName: { contains: query.name } },
            ...(query.setCode ? [{ setCode: query.setCode }] : []),
          ],
        },
        orderBy: { capturedAt: "desc" },
        take: 40,
      });

      // Keep the freshest row per (shop + conditionNote).
      const seen = new Set<string>();
      const quotes: ProviderQuote[] = [];
      for (const r of rows) {
        const dedupe = `${r.shop}|${r.conditionNote || ""}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const ageDays = Math.floor(
          (Date.now() - r.capturedAt.getTime()) / 86_400_000,
        );
        quotes.push({
          sourceId: "competitor",
          sourceLabel: r.shop,
          kind: "buyback",
          priceJpy: r.priceJpy,
          priceHkd: jpyToHkd(r.priceJpy),
          conditionNote: r.conditionNote || undefined,
          title: r.cardName,
          asOf: ageDays > 0 ? `${ageDays}日前` : undefined,
        });
        if (quotes.length >= 15) break;
      }
      return quotes;
    } catch (err) {
      console.warn("[competitor provider]", err);
      return [];
    }
  },
};
