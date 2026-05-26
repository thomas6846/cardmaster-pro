import { prisma } from "./prisma";
import type { SettingsConfig } from "./types";

const DEFAULT_KEY = "config";

const DEFAULTS = {
  key: DEFAULT_KEY,
  budgetTotal: 50000,
  budgetUsed: 0,
  conditionS: 1.0,
  conditionA: 0.9,
  conditionB: 0.8,
  conditionC: 0.7,
  conditionD: 0.5,
  baseMargin: 0.65,
  highStockFactor: 0.85,
  lowStockFactor: 1.1,
  highStockThresh: 10,
  lowStockThresh: 2,
};

export async function getSettings() {
  let row = await prisma.settings.findUnique({ where: { key: DEFAULT_KEY } });
  if (!row) {
    row = await prisma.settings.create({ data: DEFAULTS });
  }
  return row;
}

export async function updateSettings(patch: Partial<SettingsConfig>) {
  return prisma.settings.update({
    where: { key: DEFAULT_KEY },
    data: patch,
  });
}

export async function consumeBudget(amount: number) {
  const s = await getSettings();
  return prisma.settings.update({
    where: { key: DEFAULT_KEY },
    data: { budgetUsed: s.budgetUsed + amount },
  });
}

export async function resetDailyBudget(newTotal?: number) {
  return prisma.settings.update({
    where: { key: DEFAULT_KEY },
    data: { budgetUsed: 0, ...(newTotal ? { budgetTotal: newTotal } : {}) },
  });
}
