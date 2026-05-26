import Anthropic from "@anthropic-ai/sdk";
import type { RecognizedCard, Rarity } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

const RECOGNITION_PROMPT = `You are an expert trading card grader. The user will give you a photo of a single trading card (most likely Pokémon, One Piece, Yu-Gi-Oh!, or Weiss Schwarz).

Extract the following fields and return STRICT JSON with no prose, no markdown fences, no commentary:

{
  "name": "the card's exact printed name (use English if available, else original)",
  "setCode": "the set + collector number as printed (e.g. 'SV1a-001', 'OP01-001'), or null",
  "rarity": "one of: C, U, R, RR, RRR, SR, SAR, SSR, UR, HR, SEC, PROMO, UNKNOWN",
  "language": "JP / EN / CN / KR / Other",
  "confidence": 0.0-1.0,
  "notes": "any anomalies you notice — corner wear, edging, centering, scratches, suspected counterfeit, etc."
}

If multiple cards are in frame, describe only the most prominent one.
If you cannot read the card at all, return all fields as null/UNKNOWN/0.`;

const BULK_RECOGNITION_PROMPT = `You are an expert trading card grader. The user has provided ONE photo containing MULTIPLE trading cards laid out flat (typically 2-12 cards in a grid, row, or fan). Likely TCGs: Pokémon, One Piece, Yu-Gi-Oh!, Weiss Schwarz.

For EACH distinct card you can see in the photo, extract its fields. Return a STRICT JSON ARRAY (not an object). Order cards top-to-bottom, left-to-right. No prose, no markdown fences, no commentary outside the array.

[
  {
    "name": "exact printed name (English if available, else original language)",
    "setCode": "set + collector number e.g. 'SV1a-001', 'OP01-001', or null",
    "rarity": "C / U / R / RR / RRR / SR / SAR / SSR / UR / HR / SEC / PROMO / UNKNOWN",
    "language": "JP / EN / CN / KR / Other",
    "confidence": 0.0-1.0,
    "position": "brief locator e.g. 'top-left', 'row 2, col 3'",
    "notes": "any visible flaws — corner wear, edging, centering, scratches, suspected counterfeit, sleeve glare"
  },
  ...
]

Rules:
- Include every card you can identify, even partially-overlapped ones (lower their confidence).
- If a card is too obscured to read at all, skip it rather than guessing.
- If you see only one card, still return an array with one element.
- If no cards are recognizable, return [].`;

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }
  return null;
}

function safeParseJsonArray(text: string): unknown[] | null {
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v)) return v;
  } catch {}
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const v = JSON.parse(match[0]);
      if (Array.isArray(v)) return v;
    } catch {}
  }
  return null;
}

function normalizeRarity(input: unknown): Rarity {
  if (typeof input !== "string") return "UNKNOWN";
  const u = input.toUpperCase().trim();
  const valid: Rarity[] = [
    "C", "U", "R", "RR", "RRR", "SR", "SAR", "SSR", "UR", "HR", "SEC", "PROMO", "UNKNOWN",
  ];
  return (valid as string[]).includes(u) ? (u as Rarity) : "UNKNOWN";
}

/**
 * Sends a card image (data URL or remote URL) to Anthropic Vision and returns
 * the parsed recognition. Falls back to a stub result when no API key is set,
 * so the dev UI remains usable without burning tokens.
 */
/**
 * Bulk variant: one photo containing multiple cards laid out flat. Returns an
 * array of recognitions in reading order. Falls back to a single stub item
 * when no API key is configured so dev flows still work.
 */
export async function recognizeCardsBulk(
  imageDataOrUrl: string,
): Promise<RecognizedCard[]> {
  const client = getClient();
  if (!client) {
    return [
      {
        name: "未識別卡牌 (請設定 ANTHROPIC_API_KEY)",
        rarity: "UNKNOWN",
        language: "JP",
        confidence: 0,
        notes: "Stub bulk result — no API key configured.",
        raw: "[]",
      },
    ];
  }

  const imageBlock = await buildImageBlock(imageDataOrUrl);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [imageBlock, { type: "text", text: BULK_RECOGNITION_PROMPT }],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const arr = safeParseJsonArray(raw) ?? [];

  if (arr.length === 0) {
    return [];
  }

  return arr.map((item) => {
    const p = (item ?? {}) as Record<string, unknown>;
    const notes = [
      p.position ? `位置：${p.position}` : null,
      p.notes ? String(p.notes) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      name: (p.name as string) || "未識別卡牌",
      setCode: (p.setCode as string) || undefined,
      rarity: normalizeRarity(p.rarity),
      language: (p.language as RecognizedCard["language"]) || "JP",
      confidence: typeof p.confidence === "number" ? p.confidence : 0.5,
      notes: notes || undefined,
      raw: JSON.stringify(p),
    };
  });
}

export async function recognizeCard(imageDataOrUrl: string): Promise<RecognizedCard> {
  const client = getClient();
  if (!client) {
    return {
      name: "未識別卡牌 (請設定 ANTHROPIC_API_KEY)",
      setCode: undefined,
      rarity: "UNKNOWN",
      language: "JP",
      confidence: 0,
      notes: "Stub result — no API key configured.",
      raw: "{}",
    };
  }

  const imageBlock = await buildImageBlock(imageDataOrUrl);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          imageBlock,
          { type: "text", text: RECOGNITION_PROMPT },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const parsed = safeParseJson(raw) ?? {};

  return {
    name: (parsed.name as string) || "未識別卡牌",
    setCode: (parsed.setCode as string) || undefined,
    rarity: normalizeRarity(parsed.rarity),
    language: (parsed.language as RecognizedCard["language"]) || "JP",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    notes: (parsed.notes as string) || undefined,
    raw,
  };
}

async function buildImageBlock(src: string): Promise<Anthropic.ImageBlockParam> {
  if (src.startsWith("data:")) {
    const match = src.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/);
    if (!match) throw new Error("Invalid data URL for image");
    const mediaType = match[1] as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: match[2],
      },
    };
  }
  // Remote URL — fetch and re-encode as base64 so we don't depend on the
  // SDK's URL source variant (not all SDK versions expose it).
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  const allowed: Array<"image/png" | "image/jpeg" | "image/webp" | "image/gif"> = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ];
  const mediaType = (allowed.find((t) => contentType.startsWith(t)) ||
    "image/jpeg") as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType,
      data: buf.toString("base64"),
    },
  };
}
