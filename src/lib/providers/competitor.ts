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
      // Core Japanese/first token of the AI name — competitor rows store short
      // Japanese names, so matching the full "ピカチュウ (Pikachu) - Munch's..."
      // never works; match the core token instead.
      const jp = query.name.match(/^[぀-ヿ一-鿿ｦ-ﾟ]+/);
      const core =
        jp && jp[0].length >= 2 ? jp[0] : query.name.split(/[\s(（]/)[0] || query.name;

      const rows = await prisma.competitorPrice.findMany({
        where: {
          OR: [
            { matchKey: matchKey(query.name, query.setCode) },
            { cardName: { contains: core } },
            ...(query.setCode ? [{ setCode: query.setCode }] : []),
          ],
        },
        orderBy: { capturedAt: "desc" },
        take: 60,
      });

      // Secondary in-memory filter: also accept rows whose setCode matches once
      // both sides are stripped of slashes/spaces (e.g. "288/SM-P" == "SM-P288").
      const wantCode = query.setCode
        ? query.setCode.toLowerCase().replace(/[^a-z0-9]/g, "")
        : null;
      const filtered = rows.filter((r) => {
        if (r.cardName.includes(core)) return true;
        if (wantCode && r.setCode) {
          return r.setCode.toLowerCase().replace(/[^a-z0-9]/g, "") === wantCode;
        }
        return r.matchKey === matchKey(query.name, query.setCode);
      });
      const useRows = filtered.length > 0 ? filtered : rows;

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
