/**
 * Applies prisma/migrations during the Vercel build, before `next build`.
 *
 *   node scripts/migrate-deploy.mjs
 *
 * Deploying schema-dependent code without this is the failure it exists to
 * prevent: the build succeeds, the deployment goes live, and every query
 * touching a new column fails at runtime. Running it here inverts that — a
 * database that cannot be migrated fails the build, and Vercel keeps serving
 * the previous, working deployment.
 *
 * `prisma migrate deploy` only ever applies pending migrations, so re-running
 * it on every build is a no-op once the database is current.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Load .env without adding a dependency, matching scripts/check-db.mjs.
// Vercel injects its variables directly, so this only matters locally.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

const env = (name) => process.env[name]?.trim() || undefined;

/**
 * Turns a Supabase transaction-pooler URL into a session-pooler one.
 *
 * Migrations issue DDL and hold advisory locks across statements; the
 * transaction pooler on 6543 cannot carry either, which is what produces hung
 * migrations and "prepared statement already exists". Same host and username
 * on 5432 is the session pooler — documented in .env.example — and it can.
 */
function toSessionPooler(url) {
  if (!url.includes(":6543/")) return url;
  return url
    .replace(":6543/", ":5432/")
    .replace(/[?&]pgbouncer=true/, "")
    .replace(/[?&]connection_limit=\d+/, "")
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "");
}

/**
 * Where the migration connection might live, in order of preference.
 *
 * The first two are already direct connections. The rest are pooled — the
 * Vercel–Supabase integration injects POSTGRES_* and never creates DIRECT_URL —
 * so they are converted rather than used as-is.
 */
function resolveDirectUrl() {
  for (const name of ["DIRECT_URL", "POSTGRES_URL_NON_POOLING"]) {
    const value = env(name);
    if (value) return { url: value, source: name };
  }
  for (const name of ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"]) {
    const value = env(name);
    if (!value) continue;
    const url = toSessionPooler(value);
    return { url, source: url === value ? name : `${name} → session pooler` };
  }
  return null;
}

/**
 * The runtime URL, in the order src/lib/db/client.ts uses.
 *
 * Migrations run over `directUrl`, but Prisma validates the entire datasource
 * block before doing anything, so an unset DATABASE_URL fails the CLI with
 * P1012 regardless. The Vercel–Supabase integration injects POSTGRES_* and
 * never creates DATABASE_URL — the precise case .env.example warns about — so
 * it is resolved here rather than assumed.
 */
function resolveRuntimeUrl() {
  for (const name of [
    "DATABASE_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
  ]) {
    const value = env(name);
    if (value) return value;
  }
  return undefined;
}

/**
 * Deliberate bypass for a database already known to be current.
 *
 * Failing closed is the right default: a schema mismatch discovered at runtime
 * is worse than a failed build. But that leaves no way to ship a front-end fix
 * while the migration path is blocked, so the escape hatch is explicit,
 * opt-in, and announces itself in the build log.
 */
if (["1", "true", "yes"].includes((process.env.SKIP_MIGRATIONS ?? "").toLowerCase())) {
  console.log("\n  SKIP_MIGRATIONS is set — not applying migrations.");
  console.log("    The deployment assumes the database already matches this schema.\n");
  process.exit(0);
}

const resolved = resolveDirectUrl();

if (!resolved) {
  console.error(
    "\n  ✗ No database connection string found — cannot apply migrations.\n" +
      "    → Set DIRECT_URL (port 5432) in the Vercel project's environment variables.\n" +
      "      See .env.example for the Supabase connection strings and which port each needs.\n",
  );
  process.exit(1);
}

console.log(`\n  Applying migrations via ${resolved.source}`);

/**
 * Prisma's CLI entrypoint, resolved from the package itself and run under this
 * same Node binary.
 *
 * The alternatives are both worse on Windows: bare "prisma" depends on npm
 * having put node_modules/.bin on PATH, and the .bin shim needs `shell: true`,
 * where cmd.exe then rejects the forward slashes in the path. Neither is a
 * thing to discover from a failed production build.
 */
function resolvePrismaCli() {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("prisma/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.prisma;
  if (!bin) throw new Error("the prisma package declares no bin entry");
  return path.join(path.dirname(manifestPath), bin);
}

let prismaCli;
try {
  prismaCli = resolvePrismaCli();
} catch (error) {
  console.error(
    `\n  ✗ Could not locate the Prisma CLI — ${error.message}.\n` +
      "    → Run `npm install` and try again.\n",
  );
  process.exit(1);
}

/** The migration whose effects a `db push` database already has. */
const BASELINE_MIGRATION = "0001_init";

/** Every table 0001_init creates — the fingerprint a baseline is checked against. */
const BASELINE_TABLES = [
  "appointment_services",
  "appointments",
  "audit_logs",
  "clients",
  "expenses",
  "inventory",
  "invoice_lines",
  "package_services",
  "payments",
  "permissions",
  "promo_codes",
  "role_permissions",
  "sales_invoices",
  "service_packages",
  "services",
  "sessions",
  "staff",
  "stock_movements",
  "user_roles",
  "users",
];

/**
 * Reads the live schema over a short-lived connection.
 *
 * Raw SQL against information_schema deliberately — the generated client is
 * built from the *new* schema.prisma, so any modelled query would reference
 * columns this database is not supposed to have yet.
 */
async function inspect(query, params = []) {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({ datasources: { db: { url: resolved.url } } });
  try {
    return await client.$queryRawUnsafe(query, ...params);
  } finally {
    await client.$disconnect();
  }
}

/** True when tables exist but Prisma has no migration history for them. */
async function isUnbaselined() {
  try {
    const rows = await inspect(
      `SELECT to_regclass('public._prisma_migrations') IS NULL AS missing,
              COUNT(*)::int AS tables
         FROM information_schema.tables
        WHERE table_schema = 'public'`,
    );
    return rows[0]?.missing === true && rows[0]?.tables > 0;
  } catch {
    // Unreachable or unreadable is not a baseline case — let the original
    // migrate failure stand and be reported as itself.
    return false;
  }
}

/**
 * Returns a reason to refuse, or null when baselining is safe.
 *
 * Two ways this database could differ from "0001_init and nothing since": it
 * could be missing tables 0001_init creates, or it could already carry the
 * later migrations' columns from a `db push` of a newer schema. The first
 * means the baseline is a lie; the second means 0002 would fail on a column
 * that already exists. Both are drift a human needs to look at.
 */
async function assertBaselineSafe() {
  const present = await inspect(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const names = new Set(present.map((row) => row.table_name));
  const missing = BASELINE_TABLES.filter((table) => !names.has(table));
  if (missing.length > 0) {
    return `${missing.length} table(s) from ${BASELINE_MIGRATION} are absent — ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}`;
  }

  const archived = await inspect(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'archived_at'`,
  );
  if (archived.length > 0) {
    return `archived_at already exists on ${archived.map((row) => row.table_name).join(", ")} — the later migrations appear to have been applied by hand`;
  }

  return null;
}

/**
 * Prisma resolves `directUrl = env("DIRECT_URL")` from the schema, so the
 * resolved string is handed over under that name rather than passed as a flag.
 */
const migrationEnv = {
  ...process.env,
  DIRECT_URL: resolved.url,
  DATABASE_URL: resolveRuntimeUrl() ?? resolved.url,
};

/**
 * Waits for the database to accept a connection before migrating.
 *
 * A build machine reaches Supabase over the public internet from whatever
 * egress address its region hands out, and that path is not always up the
 * instant the build starts. Prisma's own connect timeout is five seconds with
 * no retry, so a single blip failed an entire deploy. Retrying costs seconds;
 * a false failure costs a release.
 *
 * When every attempt times out the cause is not transient, and the message
 * points at the settings that actually produce this rather than repeating
 * "can't reach database server".
 */
async function waitForDatabase() {
  const delays = [2000, 4000, 8000, 16000];
  for (let attempt = 0; ; attempt++) {
    try {
      await inspect("SELECT 1");
      if (attempt > 0) console.log(`  Connected on attempt ${attempt + 1}.`);
      return true;
    } catch (error) {
      // Prisma leads with a blank line and an "Invalid `...` invocation"
      // banner; the sentence worth printing is the first line that is neither.
      const detail =
        String(error?.message ?? error)
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith("Invalid `")) ?? "no detail";
      if (attempt >= delays.length) {
        console.error(
          `\n  ✗ No connection after ${delays.length + 1} attempts — ${detail}\n` +
            "\n    The host resolved and the URL parsed, so this is the network path being\n" +
            "    dropped rather than a bad connection string. Check, in order:\n" +
            "\n      1. Supabase → Settings → Database → Network Restrictions.\n" +
            "         When enabled it permits only the listed CIDRs, and a build machine's\n" +
            "         address is not fixed. Allow 0.0.0.0/0 and ::/0, or disable it.\n" +
            "      2. Supabase → Home. A paused free-tier project refuses connections.\n" +
            "      3. That DIRECT_URL is the SESSION POOLER on port 5432. The direct\n" +
            "         db.<ref>.supabase.co host is IPv6-only and unreachable from IPv4.\n" +
            "\n    To ship while the schema is known to be current, set SKIP_MIGRATIONS=1.\n" +
            "    It skips this step and nothing else.\n",
        );
        return false;
      }
      console.log(`  Attempt ${attempt + 1} failed (${detail}) — retrying in ${delays[attempt] / 1000}s…`);
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

const runPrisma = (...args) =>
  spawnSync(process.execPath, [prismaCli, ...args], { stdio: "inherit", env: migrationEnv });

if (!(await waitForDatabase())) process.exit(1);

let result = runPrisma("migrate", "deploy");

/**
 * P3005 — the schema has tables but no `_prisma_migrations` history.
 *
 * This database was created with `prisma db push`, so Prisma has no record of
 * 0001_init having been applied and refuses to touch a schema it cannot
 * account for. The documented fix is to baseline: mark 0001_init as already
 * applied, leaving the genuinely pending migrations to run normally.
 *
 * Doing that automatically is only defensible because it is verified first and
 * happens exactly once — the moment a history table exists, this branch is
 * unreachable forever. `assertBaselineSafe` refuses unless the live schema is
 * demonstrably the one 0001_init produces.
 */
if (result.status !== 0 && (await isUnbaselined())) {
  console.log("\n  P3005 — database predates the migration history. Checking it can be baselined.");

  const problem = await assertBaselineSafe();
  if (problem) {
    console.error(
      `\n  ✗ Refusing to baseline: ${problem}\n` +
        "    → The database does not match what 0001_init creates, so marking it applied\n" +
        "      would hide real drift. Inspect it before deploying again.\n",
    );
    process.exit(1);
  }

  console.log("  Schema matches 0001_init — marking it applied, then retrying.\n");
  if (runPrisma("migrate", "resolve", "--applied", BASELINE_MIGRATION).status !== 0) {
    console.error("\n  ✗ Could not baseline the database.\n");
    process.exit(1);
  }
  result = runPrisma("migrate", "deploy");
}

if (result.status !== 0) {
  console.error(
    "\n  ✗ prisma migrate deploy failed — the build is stopped deliberately.\n" +
      "    → Deploying now would serve code against a schema it does not match.\n" +
      "      Run `npm run db:check` locally to diagnose the connection.\n",
  );
  process.exit(result.status ?? 1);
}
