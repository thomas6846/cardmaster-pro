import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}

export interface ExtractedRow {
  cardName: string;
  setCode: string | null;
  priceJpy: number;
  conditionNote: string | null;
}

export interface BuybackTableResult {
  shop: string | null;
  rows: ExtractedRow[];
  raw: string;
}

const PROMPT = `You are reading a Japanese trading-card shop's BUYBACK price list (買取表). These are commonly posted as images on Twitter/X by shops like トレカバンク, BIG トレカ, 買取ホムラ, etc.

Extract EVERY card line you can read. Return STRICT JSON only, no prose, no markdown fences:

{
  "shop": "the shop name if visible in the image (e.g. 'トレカバンク'), else null",
  "rows": [
    {
      "cardName": "card name as printed (keep Japanese if that's how it's written)",
      "setCode": "collector number / set code if shown (e.g. 'SV1a-001', '116/080'), else null",
      "priceJpy": 12000,
      "conditionNote": "any condition note next to it — 'シュリンク無し', '未開封BOX', 'PSA10', '美品', etc., else null"
    }
  ]
}

RULES:
- priceJpy: integer yen, strip ¥ and commas. "¥12,000" -> 12000.
- Read ALL rows in the table, top to bottom.
- If a price shows a range, use the higher number.
- If you cannot read a row's price clearly, skip that row.
- Do not invent cards. Only what's visibly in the image.`;

function buildImageBlock(src: string): Anthropic.ImageBlockParam {
  const match = src.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const mediaType = match[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  return { type: "image", source: { type: "base64", media_type: mediaType, data: match[2] } };
}

function safeParse(text: string): { shop?: string; rows?: unknown[] } | null {
  try {
    return JSON.parse(text);
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

/**
 * OCR a buyback price-list image into structured rows via Claude Vision.
 * Returns up to ~200 rows. Throws if no API key (caller handles).
 */
export async function extractBuybackTable(
  imageDataUrl: string,
): Promise<BuybackTableResult> {
  const client = getClient();
  if (!client) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [buildImageBlock(imageDataUrl), { type: "text", text: PROMPT }],
      },
    ],
  });

  const textBlock = res.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const parsed = safeParse(raw) ?? {};

  const rows: ExtractedRow[] = Array.isArray(parsed.rows)
    ? parsed.rows
        .map((r) => {
          const o = (r ?? {}) as Record<string, unknown>;
          const price = Number(o.priceJpy);
          if (!price || price <= 0) return null;
          return {
            cardName: String(o.cardName || "").trim(),
            setCode: o.setCode ? String(o.setCode).trim() : null,
            priceJpy: Math.round(price),
            conditionNote: o.conditionNote ? String(o.conditionNote) : null,
          };
        })
        .filter((r): r is ExtractedRow => r !== null && r.cardName.length > 0)
    : [];

  return {
    shop: parsed.shop ? String(parsed.shop) : null,
    rows,
    raw,
  };
}

export function matchKey(name: string, setCode?: string | null): string {
  return `${name}|${setCode || ""}`.toLowerCase().replace(/\s+/g, " ").trim();
}
