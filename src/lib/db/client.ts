import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Prisma singleton.
 *
 * Next's dev server hot-reloads modules on every edit; without caching the
 * client on `globalThis` each reload would open a fresh connection pool and
 * exhaust Postgres' connection limit within a few saves.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Prisma returns `Decimal` objects for money columns. Every read path funnels
 * through here so the domain types stay plain `number` and no component ever
 * has to know Decimal exists.
 *
 * Safe for salon-scale money: JS numbers hold integers exactly to 2^53, and
 * these are rupee amounts with two decimal places. Arithmetic that must not
 * drift still happens in `lib/billing.ts` on rounded values, and totals are
 * persisted as Decimal.
 */
export function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

export { Prisma };

/** True when a database connection is actually configured. */
export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
