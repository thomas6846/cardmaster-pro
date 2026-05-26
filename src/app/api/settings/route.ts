import { NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, updateSettings, resetDailyBudget } from "@/lib/settings";

export const runtime = "nodejs";

const PatchBody = z.object({
  budgetTotal: z.number().nonnegative().optional(),
  baseMargin: z.number().min(0).max(1).optional(),
  conditionS: z.number().optional(),
  conditionA: z.number().optional(),
  conditionB: z.number().optional(),
  conditionC: z.number().optional(),
  conditionD: z.number().optional(),
  highStockFactor: z.number().optional(),
  lowStockFactor: z.number().optional(),
  highStockThresh: z.number().int().optional(),
  lowStockThresh: z.number().int().optional(),
  resetBudget: z.boolean().optional(),
});

export async function GET() {
  const s = await getSettings();
  return NextResponse.json({ settings: s });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { resetBudget, ...rest } = parsed.data;
  if (resetBudget) await resetDailyBudget(rest.budgetTotal);
  const updated = await updateSettings(rest);
  return NextResponse.json({ settings: updated });
}
