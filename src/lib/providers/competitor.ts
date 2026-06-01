import type { MarketProvider, ProviderQuery, ProviderQuote } from "./types";
import { jpyToHkd, normSetCode } from "./types";
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
      // Core Japanese/first token of the AI name — competitor rows store short
      // Japanese names, so matching the full "ピカチュウ (Pikachu) - Munch's..."
      // never works; match the core token instead.
      const jp = query.name.match(/^[぀-ヿ一-鿿ｦ-ﾟ]+/);
      const core =
        jp && jp[0].length >= 2 ? jp[0] : query.name.split(/[\s(（]/)[0] || query.name;

      const wantCode = query.setCode ? normSetCode(query.setCode) : null;

      // Pull a candidate set, then filter precisely. When a setCode is known we
      // keep ONLY collector-number-exact rows (character names collide across
      // many variants); name match is the fallback only when no setCode.
      const rows = await prisma.competitorPrice.findMany({
        where: {
          OR: [
            { matchKey: matchKey(query.name, query.setCode) },
            { cardName: { contains: core } },
          ],
        },
        orderBy: { capturedAt: "desc" },
        take: 80,
      });

      const useRows = wantCode
        ? rows.filter((r) => r.setCode && normSetCode(r.setCode) === wantCode)
        : rows.filter((r) => r.cardName.includes(core));

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
