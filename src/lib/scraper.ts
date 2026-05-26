/**
 * SNKRDUNK Scraper Adapter
 * =========================
 *
 * 呢度係你自己寫嘅 scraper 嘅入口。`lookupMarketPrice()` (snkrdunk.ts) 會
 * call `fetchSnkrdunkPrice()`，攞到結果就會 cache 6 個鐘 + 計入報價公式。
 *
 * 預設返 `null`，等於「冇 scraper」—— snkrdunk.ts 會 fallback 去
 * deterministic mock，員工亦可以喺 UI 手動 override 市價。
 *
 * 你寫好 scraper 之後，喺 `fetchSnkrdunkPrice` 入面實作返：
 *   - 用 `query.setCode` 或 `query.name` 揾 SNKRDUNK 對應產品頁
 *   - 抽返「最終取引價格」(JPY)
 *   - return `{ jpy, sampleSize?, reference? }`
 *   - 失敗 throw / return null —— 系統會自動降級
 *
 * 注意：fetch 失敗 throw 之後會被 snkrdunk.ts 捕，stale cache 仍可頂住
 * 一陣，再唔得就 mock，唔會 block 員工流程。
 */

export interface ScraperQuery {
  name: string;
  setCode?: string;
}

export interface ScraperResult {
  jpy: number;
  sampleSize?: number;
  reference?: string; // canonical URL to the product page, shown to staff
}

export async function fetchSnkrdunkPrice(
  _query: ScraperQuery,
): Promise<ScraperResult | null> {
  // TODO: 你嘅 scraper 寫呢度。
  //
  // 例如：
  //   const url = `https://snkrdunk.com/products/${slugify(_query.setCode || _query.name)}`;
  //   const html = await fetch(url, { headers: { ... } }).then(r => r.text());
  //   const m = html.match(/最終取引価格[\s\S]{0,200}?¥\s*([\d,]+)/);
  //   if (!m) return null;
  //   return { jpy: Number(m[1].replace(/,/g, "")), reference: url };
  return null;
}
