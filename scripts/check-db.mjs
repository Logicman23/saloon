/**
 * Diagnoses the Supabase connection before you run a migration.
 *
 *   node scripts/check-db.mjs
 *
 * Checks the two URLs are shaped correctly, connects with each, and reports
 * what is actually there. Every failure names the specific fix rather than
 * leaving you with a Prisma stack trace.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";

// Load .env without adding a dependency.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

let problems = 0;
const fail = (msg, fix) => {
  problems += 1;
  console.log(`\n  ✗ ${msg}`);
  if (fix) console.log(`    → ${fix}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

console.log("\nSupabase connection check\n" + "─".repeat(60));

/* ------------------------------------------------------------- Shape --- */

const pooled = process.env.DATABASE_URL;
const direct = process.env.DIRECT_URL;

/**
 * The 6543/5432 split is a fact about Supabase's pooler topology, not about
 * Postgres. A local database has no pooler in front of it, so applying those
 * rules there would report problems that do not exist.
 */
const isLocal = (url) => /@(localhost|127\.0\.0\.1|\[::1\])/.test(url ?? "");
const localMode = isLocal(pooled) || isLocal(direct);

if (localMode) {
  ok("local database detected — skipping Supabase pooler checks");
}

if (!pooled) {
  fail("DATABASE_URL is not set", "Copy .env.example to .env and fill it in.");
} else if (localMode) {
  ok("DATABASE_URL set (local)");
} else {
  const port = pooled.match(/:(\d{4,5})\//)?.[1];
  if (port === "6543") ok("DATABASE_URL uses the transaction pooler (6543)");
  else if (port === "5432")
    fail(
      `DATABASE_URL uses port ${port}, not the pooler`,
      "On serverless this opens a connection per invocation. Use the port 6543 string.",
    );
  else fail(`DATABASE_URL has an unexpected port (${port ?? "none"})`);

  if (port === "6543" && !pooled.includes("pgbouncer=true")) {
    fail(
      "DATABASE_URL is missing ?pgbouncer=true",
      'Append "?pgbouncer=true&connection_limit=1" — without it you will hit "prepared statement s0 already exists".',
    );
  } else if (port === "6543") {
    ok("pgbouncer=true is present");
  }

  if (pooled.includes("[PROJECT-REF]") || pooled.includes("[YOUR-PASSWORD]")) {
    fail("DATABASE_URL still contains template placeholders");
  }
}

if (!direct) {
  fail("DIRECT_URL is not set", "Prisma needs it for migrations.");
} else if (localMode) {
  ok("DIRECT_URL set (local)");
} else {
  const port = direct.match(/:(\d{4,5})\//)?.[1];
  if (port === "5432") ok("DIRECT_URL uses port 5432");
  else
    fail(
      `DIRECT_URL uses port ${port}, which cannot run migrations`,
      "Migrations need the direct or session-pooler string on port 5432.",
    );

  if (direct.includes("pgbouncer=true")) {
    fail(
      "DIRECT_URL has pgbouncer=true",
      "Remove it — this connection must NOT be pooled.",
    );
  }
}

if (problems > 0) {
  console.log("\n" + "─".repeat(60));
  console.log(`${problems} configuration problem(s). Fix the above, then re-run.\n`);
  process.exit(1);
}

/* --------------------------------------------------------- Connect ----- */

/**
 * Connects, reports, and releases immediately. Holding both connections open
 * at once would falsely report the second as unreachable on any setup that
 * allows a single connection.
 */
async function probe(label, url) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await client.$queryRawUnsafe("SELECT current_database() AS db, version() AS v");
    ok(`${label} connected → ${rows[0].db} (${rows[0].v.split(",")[0]})`);
    await client.$disconnect();
    return true;
  } catch (error) {
    const msg = String(error?.message ?? error);
    if (msg.includes("Can't reach database server")) {
      fail(
        `${label} unreachable`,
        label === "DIRECT_URL"
          ? "Likely IPv4-only network vs Supabase's IPv6 direct host. Switch DIRECT_URL to the SESSION pooler (port 5432, pooler host, postgres.[REF] username)."
          : "Check the host, and that the project is not paused in the Supabase dashboard.",
      );
    } else if (msg.includes("password authentication failed")) {
      fail(
        `${label} rejected the password`,
        "Percent-encode special characters (@ → %40, # → %23), or reset the password in Settings → Database.",
      );
    } else if (msg.includes("Tenant or user not found")) {
      fail(
        `${label} username is wrong`,
        "The pooled string needs postgres.[PROJECT-REF]; the direct one needs plain postgres.",
      );
    } else {
      fail(`${label} failed: ${msg.split("\n")[0]}`);
    }
    await client.$disconnect();
    return false;
  }
}

const runtimeOk = await probe("DATABASE_URL", pooled);
await probe("DIRECT_URL", direct);

/* ----------------------------------------------------------- State ----- */

if (runtimeOk) {
  const runtime = new PrismaClient({ datasources: { db: { url: pooled } } });
  try {
    const tables = await runtime.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`,
    );
    if (tables.length === 0) {
      console.log("\n  ! No tables yet — run: npx prisma migrate deploy");
    } else {
      ok(`${tables.length} tables present`);

      const counts = await runtime.$queryRawUnsafe(`
        SELECT
          (SELECT COUNT(*) FROM users)     AS users,
          (SELECT COUNT(*) FROM staff)     AS staff,
          (SELECT COUNT(*) FROM services)  AS services,
          (SELECT COUNT(*) FROM inventory) AS inventory
      `);
      const c = counts[0];
      const total = Number(c.users) + Number(c.staff) + Number(c.services);
      if (total === 0) {
        console.log("\n  ! Tables are empty — run: npm run db:seed");
      } else {
        ok(
          `seeded: ${c.users} users, ${c.staff} staff, ${c.services} services, ${c.inventory} inventory`,
        );
      }
    }
  } catch {
    console.log("\n  ! Tables not found — run: npx prisma migrate deploy");
  }
  await runtime.$disconnect();
}

console.log("\n" + "─".repeat(60));
console.log(problems === 0 ? "All good.\n" : `${problems} problem(s) found.\n`);
process.exit(problems === 0 ? 0 : 1);
