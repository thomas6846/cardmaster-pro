import type { InventoryLookup } from "./types";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

function isConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_SHOP && process.env.SHOPIFY_ADMIN_TOKEN);
}

function endpoint(path: string): string {
  const shop = process.env.SHOPIFY_SHOP!.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${shop}/admin/api/${API_VERSION}/${path.replace(/^\//, "")}`;
}

async function shopifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(endpoint(path), {
    ...init,
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN!,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * Look up inventory for a SKU. Returns count=0 with no IDs when Shopify isn't
 * configured — the pricing engine will treat that as "low stock" naturally.
 */
export async function getInventoryBySku(sku: string): Promise<InventoryLookup> {
  if (!isConfigured()) {
    return { count: 0, sku };
  }
  try {
    const variants = await shopifyFetch<{
      variants: Array<{
        id: number;
        product_id: number;
        sku: string;
        inventory_item_id: number;
        inventory_quantity: number;
      }>;
    }>(`variants.json?sku=${encodeURIComponent(sku)}`);

    const variant = variants.variants?.[0];
    if (!variant) return { count: 0, sku };

    return {
      count: variant.inventory_quantity,
      sku: variant.sku,
      variantId: String(variant.id),
      productId: String(variant.product_id),
    };
  } catch (err) {
    console.warn("[shopify] inventory lookup failed", err);
    return { count: 0, sku };
  }
}

interface SyncCardInput {
  sku: string;
  variantId?: string | null;
  inventoryItemId?: string | null;
  costPerItem: number;
  buyQuantity: number;
}

interface SyncResult {
  sku: string;
  ok: boolean;
  error?: string;
  newQuantity?: number;
  costUpdated?: boolean;
}

/**
 * After a transaction settles, push each card back to Shopify:
 *   1. Increment inventory_levels at the chosen location by buyQuantity
 *   2. Update inventory_items.cost = costPerItem
 *
 * The location can be passed per-call (preferred for multi-store deployments),
 * else falls back to SHOPIFY_LOCATION_ID env var.
 */
export async function syncPurchaseToShopify(
  cards: SyncCardInput[],
  opts: { locationId?: string | null } = {},
): Promise<SyncResult[]> {
  if (!isConfigured()) {
    return cards.map((c) => ({
      sku: c.sku,
      ok: false,
      error: "Shopify not configured",
    }));
  }

  const locationId = opts.locationId || process.env.SHOPIFY_LOCATION_ID;
  const results: SyncResult[] = [];

  for (const card of cards) {
    try {
      let inventoryItemId = card.inventoryItemId;
      let variantId = card.variantId;

      if (!inventoryItemId) {
        const variants = await shopifyFetch<{
          variants: Array<{ id: number; inventory_item_id: number }>;
        }>(`variants.json?sku=${encodeURIComponent(card.sku)}`);
        const v = variants.variants?.[0];
        if (!v) {
          results.push({ sku: card.sku, ok: false, error: "SKU not found" });
          continue;
        }
        inventoryItemId = String(v.inventory_item_id);
        variantId = String(v.id);
      }

      let newQty: number | undefined;
      if (locationId) {
        const adj = await shopifyFetch<{
          inventory_level: { available: number };
        }>(`inventory_levels/adjust.json`, {
          method: "POST",
          body: JSON.stringify({
            location_id: Number(locationId),
            inventory_item_id: Number(inventoryItemId),
            available_adjustment: card.buyQuantity,
          }),
        });
        newQty = adj.inventory_level?.available;
      }

      await shopifyFetch(`inventory_items/${inventoryItemId}.json`, {
        method: "PUT",
        body: JSON.stringify({
          inventory_item: {
            id: Number(inventoryItemId),
            cost: card.costPerItem.toFixed(2),
          },
        }),
      });

      results.push({
        sku: card.sku,
        ok: true,
        newQuantity: newQty,
        costUpdated: true,
      });
    } catch (err) {
      results.push({
        sku: card.sku,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
