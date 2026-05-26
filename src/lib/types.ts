export type Condition = "S" | "A" | "B" | "C" | "D";

export type Rarity =
  | "C"
  | "U"
  | "R"
  | "RR"
  | "RRR"
  | "SR"
  | "SAR"
  | "SSR"
  | "UR"
  | "HR"
  | "SEC"
  | "PROMO"
  | "UNKNOWN";

export type CardStatus =
  | "pending"
  | "quoted"
  | "approved"
  | "rejected"
  | "sold"
  | "dropped";

export type TransactionStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "settled"
  | "cancelled";

export interface RecognizedCard {
  name: string;
  setCode?: string;
  rarity?: Rarity;
  language?: "JP" | "EN" | "CN" | "KR" | "Other";
  confidence: number;
  notes?: string;
  raw: string;
}

export interface MarketLookup {
  marketPrice: number;
  currency: "HKD";
  source: string;
  rawPrice?: number;
  rawCurrency?: string;
  sampleSize?: number;
  lastSoldAt?: string;
  reference?: string;
}

export interface InventoryLookup {
  count: number;
  sku?: string;
  variantId?: string;
  productId?: string;
  costPerItem?: number;
}

export interface PricingInputs {
  marketPrice: number;
  condition: Condition;
  inventoryCount: number;
  budgetRemaining: number;
  budgetTotal: number;
}

export interface PricingResult {
  finalPrice: number;
  conditionWeight: number;
  inventoryWeight: number;
  budgetFactor: number;
  baseMargin: number;
  breakdown: string;
}

export interface SettingsConfig {
  budgetTotal: number;
  budgetUsed: number;
  conditionS: number;
  conditionA: number;
  conditionB: number;
  conditionC: number;
  conditionD: number;
  baseMargin: number;
  highStockFactor: number;
  lowStockFactor: number;
  highStockThresh: number;
  lowStockThresh: number;
}
