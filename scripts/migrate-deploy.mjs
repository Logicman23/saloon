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

/**
 * Prisma resolves `directUrl = env("DIRECT_URL")` from the schema, so the
 * resolved string is handed over under that name rather than passed as a flag.
 */
const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DIRECT_URL: resolved.url,
    DATABASE_URL: resolveRuntimeUrl() ?? resolved.url,
  },
});

if (result.status !== 0) {
  console.error(
    "\n  ✗ prisma migrate deploy failed — the build is stopped deliberately.\n" +
      "    → Deploying now would serve code against a schema it does not match.\n" +
      "      Run `npm run db:check` locally to diagnose the connection.\n",
  );
  process.exit(result.status ?? 1);
}
