import type {
  Condition,
  PricingInputs,
  PricingResult,
  SettingsConfig,
} from "./types";
import { getSettings } from "./settings";

const CONDITION_DESCRIPTIONS: Record<Condition, string> = {
  S: "Mint / 全新未拆",
  A: "Near Mint / 接近完美",
  B: "Excellent / 輕微瑕疵",
  C: "Good / 明顯使用痕跡",
  D: "Played / 重度磨損",
};

export function describeCondition(c: Condition): string {
  return CONDITION_DESCRIPTIONS[c];
}

export function conditionWeight(
  condition: Condition,
  cfg: Pick<
    SettingsConfig,
    "conditionS" | "conditionA" | "conditionB" | "conditionC" | "conditionD"
  >,
): number {
  switch (condition) {
    case "S":
      return cfg.conditionS;
    case "A":
      return cfg.conditionA;
    case "B":
      return cfg.conditionB;
    case "C":
      return cfg.conditionC;
    case "D":
      return cfg.conditionD;
    default:
      return cfg.conditionA;
  }
}

export function inventoryWeight(
  count: number,
  cfg: Pick<
    SettingsConfig,
    "highStockFactor" | "lowStockFactor" | "highStockThresh" | "lowStockThresh"
  >,
): number {
  if (count >= cfg.highStockThresh) return cfg.highStockFactor;
  if (count <= cfg.lowStockThresh) return cfg.lowStockFactor;
  return 1.0;
}

/**
 * Budget factor squeezes our offer as the daily wallet runs dry. Curve:
 *   remaining >= 50% of total → 1.0  (normal)
 *   remaining 20%–50%         → linear 1.0 → 0.9
 *   remaining <20%            → linear 0.9 → 0.7
 *   remaining = 0             → 0.7  (still buy, but cheaply)
 */
export function budgetFactor(remaining: number, total: number): number {
  if (total <= 0) return 1.0;
  const ratio = Math.max(0, remaining / total);
  if (ratio >= 0.5) return 1.0;
  if (ratio >= 0.2) {
    return 0.9 + ((ratio - 0.2) / 0.3) * 0.1;
  }
  return 0.7 + (ratio / 0.2) * 0.2;
}

/**
 * Core engine: FinalPrice = MarketPrice * baseMargin * ConditionWeight * InventoryWeight * BudgetFactor
 *
 * `baseMargin` is the retail-to-buy spread (e.g. 0.65 means we offer 65% of market
 * before adjustments). The four multiplicative factors tune from there.
 */
export function calculateQuote(
  inputs: PricingInputs,
  cfg: SettingsConfig,
): PricingResult {
  const cw = conditionWeight(inputs.condition, cfg);
  const iw = inventoryWeight(inputs.inventoryCount, cfg);
  const bf = budgetFactor(inputs.budgetRemaining, inputs.budgetTotal);
  const base = inputs.marketPrice * cfg.baseMargin;
  const final = Math.round(base * cw * iw * bf);

  const breakdown =
    `Market ${inputs.marketPrice.toFixed(0)} × Margin ${cfg.baseMargin} ` +
    `× Cond(${inputs.condition}) ${cw} ` +
    `× Inv(${inputs.inventoryCount}) ${iw.toFixed(2)} ` +
    `× Budget ${bf.toFixed(2)} = ${final}`;

  return {
    finalPrice: final,
    conditionWeight: cw,
    inventoryWeight: iw,
    budgetFactor: bf,
    baseMargin: cfg.baseMargin,
    breakdown,
  };
}

export async function quoteCard(opts: {
  marketPrice: number;
  condition: Condition;
  inventoryCount: number;
}): Promise<PricingResult> {
  const cfg = await getSettings();
  const remaining = Math.max(0, cfg.budgetTotal - cfg.budgetUsed);
  return calculateQuote(
    {
      marketPrice: opts.marketPrice,
      condition: opts.condition,
      inventoryCount: opts.inventoryCount,
      budgetRemaining: remaining,
      budgetTotal: cfg.budgetTotal,
    },
    cfg,
  );
}
