import { NextResponse } from "next/server";
import { resetDailyBudget } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Daily budget reset endpoint. Designed to be hit by Railway Cron (or any
 * scheduler) at 00:01 local time each day. Resets Settings.budgetUsed to 0
 * so the next morning starts with a fresh quota.
 *
 * Protected by CRON_SECRET — caller must set Authorization: Bearer <secret>.
 * Set CRON_SECRET in Railway Variables before scheduling.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const updated = await resetDailyBudget();
  await logAudit({
    action: "BUDGET_RESET",
    entityType: "Settings",
    entityId: updated.id,
    actor: "cron",
    payload: { budgetTotal: updated.budgetTotal },
  });

  return NextResponse.json({
    ok: true,
    resetAt: new Date().toISOString(),
    budgetTotal: updated.budgetTotal,
  });
}

// GET for easy manual testing via browser/curl
export async function GET(req: Request) {
  return POST(req);
}
