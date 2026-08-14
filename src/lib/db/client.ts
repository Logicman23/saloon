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

/**
 * Where the connection string might live, in order of preference.
 *
 * `schema.prisma` declares `url = env("DATABASE_URL")`, but the Vercel–Supabase
 * integration does not create that name — it injects POSTGRES_* instead. Left
 * to itself Prisma would then throw on the first query, and the login route
 * reports that as "the account couldn't be looked up", which reads like a
 * database problem rather than a naming one.
 *
 * POSTGRES_PRISMA_URL comes before POSTGRES_URL deliberately: the integration
 * builds it with `?pgbouncer=true`, which the transaction pooler requires.
 */
const CONNECTION_URL_VARS = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

function resolveConnectionUrl(): string | undefined {
  for (const name of CONNECTION_URL_VARS) {
    const value = process.env[name]?.trim();
    if (value) return withPoolerFlags(value);
  }
  return undefined;
}

/**
 * Supabase's transaction pooler (port 6543) cannot carry prepared statements.
 * Without `pgbouncer=true` Prisma uses them anyway and queries start failing
 * with "prepared statement s0 already exists" once connections get reused —
 * intermittently, which is the worst way to discover it.
 */
function withPoolerFlags(url: string): string {
  if (!url.includes(":6543/") || url.includes("pgbouncer=true")) return url;
  return url + (url.includes("?") ? "&" : "?") + "pgbouncer=true";
}

const connectionUrl = resolveConnectionUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Passing the URL explicitly keeps Prisma from resolving env("DATABASE_URL")
    // itself, which is what fails on Vercel.
    ...(connectionUrl ? { datasourceUrl: connectionUrl } : {}),
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
  return Boolean(connectionUrl);
}

/** Which environment variable the connection came from — for diagnostics. */
export function connectionUrlSource(): string | null {
  return CONNECTION_URL_VARS.find((name) => process.env[name]?.trim()) ?? null;
}
