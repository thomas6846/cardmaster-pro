import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { recognizeCard, recognizeCardsBulk } from "@/lib/anthropic";
import { lookupMarketPrice } from "@/lib/snkrdunk";
import { getInventoryBySku } from "@/lib/shopify";
import { quoteCard } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { Condition, RecognizedCard, InventoryLookup } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  imageDataUrl: z.string().min(50),
  condition: z.enum(["S", "A", "B", "C", "D"]).default("A"),
  mode: z.enum(["single", "bulk"]).default("single"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const staffName = session.user.name || session.user.email || undefined;
  const staffId = session.user.id;

  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { imageDataUrl, condition, mode } = parsed.data;

  if (mode === "bulk") {
    const recognitions = await recognizeCardsBulk(imageDataUrl);
    if (recognitions.length === 0) {
      return NextResponse.json({
        mode,
        count: 0,
        results: [],
        message: "AI 未能在相中辨識到任何卡牌，請拍清楚啲再試。",
      });
    }
    const results = await Promise.all(
      recognitions.map((recog) =>
        processOne(recog, imageDataUrl, condition as Condition, staffId, staffName),
      ),
    );
    return NextResponse.json({ mode, count: results.length, results });
  }

  const recog = await recognizeCard(imageDataUrl);
  const result = await processOne(
    recog,
    imageDataUrl,
    condition as Condition,
    staffId,
    staffName,
  );
  return NextResponse.json({
    mode,
    count: 1,
    ...result,
    results: [result],
  });
}

// AI sometimes returns descriptive setCodes like "SV-P or SV2a (...)" — keep
// only alphanumerics + dash so Shopify accepts it as a SKU parameter.
function cleanSku(raw: string | undefined): string | null {
  if (!raw) return null;
  const c = raw
    .replace(/\([^)]*\)/g, "")
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 30);
  return c.length >= 2 ? c : null;
}

async function processOne(
  recog: RecognizedCard,
  imageDataUrl: string,
  condition: Condition,
  staffId: string,
  staffName?: string,
) {
  const sku = cleanSku(recog.setCode);
  const [market, inventory] = await Promise.all([
    lookupMarketPrice({ name: recog.name, setCode: recog.setCode }),
    sku
      ? getInventoryBySku(sku)
      : Promise.resolve<InventoryLookup>({ count: 0 }),
  ]);

  const quote = await quoteCard({
    marketPrice: market.marketPrice,
    condition,
    inventoryCount: inventory.count,
  });

  const card = await prisma.card.create({
    data: {
      name: recog.name,
      setCode: recog.setCode,
      rarity: recog.rarity,
      language: recog.language,
      imageUrl: imageDataUrl,
      condition,
      marketPrice: market.marketPrice,
      marketCurrency: market.currency,
      marketSource: market.source,
      marketReference: market.reference,
      inventoryCount: inventory.count,
      shopifySku: inventory.sku,
      shopifyVariantId: inventory.variantId,
      quotedPrice: quote.finalPrice,
      aiRaw: recog.raw,
      notes: recog.notes,
      status: "quoted",
      scannedById: staffId,
    },
  });

  await logAudit({
    action: "SCAN",
    entityType: "Card",
    entityId: card.id,
    actor: staffName || "staff",
    payload: { recog, market, inventory, quote },
  });

  return { card, recognition: recog, market, inventory, quote };
}
