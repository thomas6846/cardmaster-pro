import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

export async function logAudit(opts: {
  action: string;
  entityType: "Card" | "Transaction" | "Settings" | "User";
  entityId: string;
  actor: string;
  payload?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        actor: opts.actor,
        payload: opts.payload
          ? (JSON.parse(JSON.stringify(opts.payload)) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.warn("[audit] failed", err);
  }
}
