import type { MarketProvider, ProviderQuery, ProviderQuote } from "./types";
import { jpyToHkd, normSetCode, coreCardName } from "./types";
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
      // Twitter price-list images rarely carry a collector number, so the
      // competitor rows mostly have no setCode. We therefore match on the
      // card-type-qualified name ("リザードンex", not bare "リザードン") and tag
      // each quote: setCode-exact (high confidence) vs name (rough same-name
      // reference). The aggregator prefers setCode matches but keeps name ones
      // when no exact match exists anywhere.
      const core = coreCardName(query.name);
      const wantCode = query.setCode ? normSetCode(query.setCode) : null;

      const rows = await prisma.competitorPrice.findMany({
        where: {
          OR: [
            { matchKey: matchKey(query.name, query.setCode) },
            { cardName: { contains: core } },
          ],
        },
        orderBy: { capturedAt: "desc" },
        take: 120,
      });

      // Keep rows that either setCode-match OR name-contain the qualified core.
      const useRows = rows.filter((r) => {
        if (wantCode && r.setCode && normSetCode(r.setCode) === wantCode)
          return true;
        return core.length >= 2 && r.cardName.includes(core);
      });

      // Keep the freshest row per (shop + conditionNote).
      const seen = new Set<string>();
      const quotes: ProviderQuote[] = [];
      for (const r of useRows) {
        const dedupe = `${r.shop}|${r.conditionNote || ""}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const ageDays = Math.floor(
          (Date.now() - r.capturedAt.getTime()) / 86_400_000,
        );
        const isSetCodeMatch = Boolean(
          wantCode && r.setCode && normSetCode(r.setCode) === wantCode,
        );
        quotes.push({
          sourceId: "competitor",
          sourceLabel: r.shop,
          kind: "buyback",
          matchType: isSetCodeMatch ? "setCode" : "name",
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
