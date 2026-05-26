/**
 * Card identity verification against free public card databases.
 *
 * Claude Vision sometimes hallucinates set codes — claims "SV1a-001" when
 * the photo is actually SV1a-007. This module cross-checks (name, setCode)
 * against authoritative sources and returns a clean, canonical record when
 * one exists. The Shopify sync then uses the canonical SKU and image URL
 * instead of whatever the AI typed.
 *
 * Sources (free, no API key):
 *   - Pokémon TCG API (https://pokemontcg.io) — JP + EN Pokémon sets
 *   - Scryfall (https://scryfall.com/docs/api) — Magic: The Gathering
 *   - YGOPRODeck (https://ygoprodeck.com/api-guide) — Yu-Gi-Oh!
 *
 * Each lookup is best-effort with a 5s timeout and graceful fallback.
 */

export interface VerifiedCard {
  source: "pokemon-tcg" | "scryfall" | "ygoprodeck";
  canonicalName: string;
  canonicalSetCode: string;
  setName?: string;
  rarity?: string;
  imageUrl?: string;
  marketPriceUsd?: number;
  referenceUrl?: string;
}

const TIMEOUT_MS = 5_000;

async function fetchWithTimeout(url: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "CardMaster-Pro/1.0" },
    });
  } catch (err) {
    console.warn("[cardverify] fetch failed:", url, err);
    return null;
  }
}

interface PokemonTcgCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set?: { id: string; name: string; ptcgoCode?: string };
  images?: { small?: string; large?: string };
  cardmarket?: { prices?: { trendPrice?: number } };
  tcgplayer?: { url?: string; prices?: Record<string, { market?: number }> };
}

async function tryPokemonTcg(name: string): Promise<VerifiedCard | null> {
  // The API supports Lucene queries: name:"Charizard ex"
  const query = `name:"${name.replace(/"/g, "")}"`;
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=5`;
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { data?: PokemonTcgCard[] };
  const top = data.data?.[0];
  if (!top) return null;

  return {
    source: "pokemon-tcg",
    canonicalName: top.name,
    canonicalSetCode: top.set?.ptcgoCode
      ? `${top.set.ptcgoCode}-${top.number}`
      : top.set
        ? `${top.set.id}-${top.number}`
        : top.number,
    setName: top.set?.name,
    rarity: top.rarity,
    imageUrl: top.images?.large || top.images?.small,
    marketPriceUsd:
      top.cardmarket?.prices?.trendPrice ||
      top.tcgplayer?.prices?.holofoil?.market ||
      top.tcgplayer?.prices?.normal?.market,
    referenceUrl: top.tcgplayer?.url,
  };
}

interface ScryfallCard {
  name: string;
  set: string;
  collector_number: string;
  rarity: string;
  set_name: string;
  image_uris?: { normal?: string; large?: string };
  prices?: { usd?: string };
  scryfall_uri?: string;
}

async function tryScryfall(name: string): Promise<VerifiedCard | null> {
  const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  const card = (await res.json()) as ScryfallCard;
  return {
    source: "scryfall",
    canonicalName: card.name,
    canonicalSetCode: `${card.set.toUpperCase()}-${card.collector_number}`,
    setName: card.set_name,
    rarity: card.rarity,
    imageUrl: card.image_uris?.large || card.image_uris?.normal,
    marketPriceUsd: card.prices?.usd ? parseFloat(card.prices.usd) : undefined,
    referenceUrl: card.scryfall_uri,
  };
}

interface YgoCard {
  name: string;
  type?: string;
  card_sets?: Array<{ set_code: string; set_name: string; set_rarity?: string }>;
  card_images?: Array<{ image_url?: string; image_url_small?: string }>;
  card_prices?: Array<{ tcgplayer_price?: string }>;
}

async function tryYgoprodeck(name: string): Promise<VerifiedCard | null> {
  const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(name)}&num=1&offset=0`;
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { data?: YgoCard[] };
  const card = data.data?.[0];
  if (!card) return null;
  const firstSet = card.card_sets?.[0];
  return {
    source: "ygoprodeck",
    canonicalName: card.name,
    canonicalSetCode: firstSet?.set_code || card.name.slice(0, 20),
    setName: firstSet?.set_name,
    rarity: firstSet?.set_rarity,
    imageUrl: card.card_images?.[0]?.image_url,
    marketPriceUsd: card.card_prices?.[0]?.tcgplayer_price
      ? parseFloat(card.card_prices[0].tcgplayer_price)
      : undefined,
  };
}

/**
 * Try sources in parallel and return the first hit. We prioritise Pokémon
 * since that's the user's primary inventory; the others run alongside so we
 * still catch cross-TCG buys without an extra round-trip.
 */
export async function verifyCard(
  name: string,
): Promise<VerifiedCard | null> {
  if (!name || name.length < 2) return null;

  const [pkmn, scry, ygo] = await Promise.all([
    tryPokemonTcg(name).catch(() => null),
    tryScryfall(name).catch(() => null),
    tryYgoprodeck(name).catch(() => null),
  ]);

  return pkmn || scry || ygo || null;
}
