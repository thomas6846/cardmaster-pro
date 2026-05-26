import { prisma } from "./prisma";
import type { InventoryLookup } from "./types";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

interface ShopifyCreds {
  shop: string;
  token: string;
}

async function getCreds(): Promise<ShopifyCreds | null> {
  const settings = await prisma.settings.findUnique({ where: { key: "config" } });
  const shop = settings?.shopifyShop || process.env.SHOPIFY_SHOP;
  const token =
    settings?.shopifyAccessToken || process.env.SHOPIFY_ADMIN_TOKEN;
  if (!shop || !token) return null;
  return {
    shop: shop.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    token,
  };
}

async function shopifyFetch<T>(
  creds: ShopifyCreds,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `https://${creds.shop}/admin/api/${API_VERSION}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": creds.token,
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

async function shopifyGraphQL<T>(
  creds: ShopifyCreds,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const url = `https://${creds.shop}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": creds.token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify GraphQL ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
  }
  return json.data as T;
}

export async function getInventoryBySku(sku: string): Promise<InventoryLookup> {
  const creds = await getCreds();
  if (!creds) {
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
    }>(creds, `variants.json?sku=${encodeURIComponent(sku)}`);

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

interface ResolvedVariant {
  variantId: string;
  inventoryItemId: string;
  productId: string;
  matchedBy: "sku" | "name" | "created";
}

// SKU lookup via REST. Returns null if no variant exists.
async function findVariantBySku(
  creds: ShopifyCreds,
  sku: string,
): Promise<ResolvedVariant | null> {
  const data = await shopifyFetch<{
    variants: Array<{ id: number; product_id: number; inventory_item_id: number }>;
  }>(creds, `variants.json?sku=${encodeURIComponent(sku)}`);
  const v = data.variants?.[0];
  if (!v) return null;
  return {
    variantId: String(v.id),
    productId: String(v.product_id),
    inventoryItemId: String(v.inventory_item_id),
    matchedBy: "sku",
  };
}

function normaliseTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s　]+/g, " ")
    .replace(/[^a-z0-9 一-鿿]/gi, "")
    .trim();
}

// Fuzzy-ish title match via GraphQL. We pull top 5, then pick the first whose
// normalised title equals the card's normalised name. Avoids returning random
// near-matches.
async function findVariantByName(
  creds: ShopifyCreds,
  name: string,
): Promise<ResolvedVariant | null> {
  const target = normaliseTitle(name);
  if (target.length < 3) return null;

  const q = `title:${JSON.stringify(name).slice(1, -1)}*`;
  const data = await shopifyGraphQL<{
    products: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          variants: {
            edges: Array<{
              node: { id: string; sku: string | null; inventoryItem: { id: string } };
            }>;
          };
        };
      }>;
    };
  }>(
    creds,
    `query findProducts($query: String!) {
       products(first: 5, query: $query) {
         edges {
           node {
             id
             title
             variants(first: 1) {
               edges { node { id sku inventoryItem { id } } }
             }
           }
         }
       }
     }`,
    { query: q },
  );

  for (const edge of data.products.edges) {
    if (normaliseTitle(edge.node.title) === target) {
      const v = edge.node.variants.edges[0]?.node;
      if (!v) continue;
      return {
        productId: edge.node.id.split("/").pop() as string,
        variantId: v.id.split("/").pop() as string,
        inventoryItemId: v.inventoryItem.id.split("/").pop() as string,
        matchedBy: "name",
      };
    }
  }
  return null;
}

// Auto-create a draft product so staff can later set the retail price + photos.
// The first variant carries SKU (setCode if available, else a generated one) +
// cost (our buyback price) so margin reports work.
async function createProductForCard(
  creds: ShopifyCreds,
  card: { sku: string | null; name: string; rarity?: string | null; language?: string | null; costPerItem: number },
): Promise<ResolvedVariant> {
  const sku =
    card.sku && card.sku.length > 0
      ? card.sku
      : `CMP-${normaliseTitle(card.name).slice(0, 20).replace(/\s+/g, "-")}-${Date.now().toString(36)}`;

  const tags = [
    "cardmaster-pro",
    "auto-created",
    card.rarity ? `rarity:${card.rarity}` : null,
    card.language ? `lang:${card.language}` : null,
  ]
    .filter(Boolean)
    .join(",");

  const created = await shopifyFetch<{
    product: {
      id: number;
      variants: Array<{ id: number; inventory_item_id: number }>;
    };
  }>(creds, `products.json`, {
    method: "POST",
    body: JSON.stringify({
      product: {
        title: card.name,
        status: "draft",
        product_type: "Trading Card",
        vendor: "CardMaster Pro",
        tags,
        variants: [
          {
            sku,
            price: "0.00",
            inventory_management: "shopify",
            inventory_policy: "deny",
            cost: card.costPerItem.toFixed(2),
          },
        ],
      },
    }),
  });

  const v = created.product.variants[0];
  return {
    productId: String(created.product.id),
    variantId: String(v.id),
    inventoryItemId: String(v.inventory_item_id),
    matchedBy: "created",
  };
}

// Newly-created inventory items aren't yet tracked at the chosen location.
// Need to call /inventory_levels/connect before /adjust will succeed.
async function ensureInventoryAtLocation(
  creds: ShopifyCreds,
  inventoryItemId: string,
  locationId: string,
): Promise<void> {
  try {
    await shopifyFetch(creds, `inventory_levels/connect.json`, {
      method: "POST",
      body: JSON.stringify({
        location_id: Number(locationId),
        inventory_item_id: Number(inventoryItemId),
      }),
    });
  } catch (err) {
    // 422 "already exists" is fine; rethrow others
    if (
      err instanceof Error &&
      !/already/i.test(err.message) &&
      !/422/.test(err.message)
    ) {
      throw err;
    }
  }
}

interface SyncCardInput {
  // setCode if AI recognised one — else null and we lean on the name.
  sku: string | null;
  name: string;
  rarity?: string | null;
  language?: string | null;
  costPerItem: number;
  buyQuantity: number;
}

interface SyncResult {
  sku: string | null;
  name: string;
  ok: boolean;
  error?: string;
  newQuantity?: number;
  costUpdated?: boolean;
  matchedBy?: "sku" | "name" | "created";
  productId?: string;
  variantId?: string;
}

/**
 * Settle-time Shopify sync. For each card:
 *   1. Look up an existing variant by SKU (setCode).
 *   2. Fall back to fuzzy product-title match on the card name.
 *   3. If still nothing, auto-create a draft product + variant.
 *   4. Connect inventory to the chosen store location if needed.
 *   5. Increment inventory by buyQuantity.
 *   6. Update inventory_items.cost so margin reports reflect what we paid.
 *
 * Pass `locationId` per call (multi-store) — else falls back to env var.
 */
export async function syncPurchaseToShopify(
  cards: SyncCardInput[],
  opts: { locationId?: string | null } = {},
): Promise<SyncResult[]> {
  const creds = await getCreds();
  if (!creds) {
    return cards.map((c) => ({
      sku: c.sku,
      name: c.name,
      ok: false,
      error: "Shopify not configured",
    }));
  }

  const locationId = opts.locationId || process.env.SHOPIFY_LOCATION_ID;
  const results: SyncResult[] = [];

  for (const card of cards) {
    try {
      let resolved: ResolvedVariant | null = null;

      if (card.sku) {
        resolved = await findVariantBySku(creds, card.sku);
      }
      if (!resolved) {
        resolved = await findVariantByName(creds, card.name);
      }
      if (!resolved) {
        resolved = await createProductForCard(creds, {
          sku: card.sku,
          name: card.name,
          rarity: card.rarity,
          language: card.language,
          costPerItem: card.costPerItem,
        });
      }

      let newQty: number | undefined;
      if (locationId) {
        if (resolved.matchedBy === "created") {
          await ensureInventoryAtLocation(creds, resolved.inventoryItemId, locationId);
        }
        const adj = await shopifyFetch<{
          inventory_level: { available: number };
        }>(creds, `inventory_levels/adjust.json`, {
          method: "POST",
          body: JSON.stringify({
            location_id: Number(locationId),
            inventory_item_id: Number(resolved.inventoryItemId),
            available_adjustment: card.buyQuantity,
          }),
        });
        newQty = adj.inventory_level?.available;
      }

      // Always (re)write cost even when matched to existing — staff may have
      // bought the same card at a different price than last time.
      await shopifyFetch(creds, `inventory_items/${resolved.inventoryItemId}.json`, {
        method: "PUT",
        body: JSON.stringify({
          inventory_item: {
            id: Number(resolved.inventoryItemId),
            cost: card.costPerItem.toFixed(2),
          },
        }),
      });

      results.push({
        sku: card.sku,
        name: card.name,
        ok: true,
        newQuantity: newQty,
        costUpdated: true,
        matchedBy: resolved.matchedBy,
        productId: resolved.productId,
        variantId: resolved.variantId,
      });
    } catch (err) {
      results.push({
        sku: card.sku,
        name: card.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
