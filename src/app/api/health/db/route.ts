import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

/**
 * TEMPORARY diagnostic — delete this file once the connection is working.
 *
 * Reports why the database is unreachable without needing access to the
 * Vercel logs. Every candidate connection string is probed independently, so
 * this distinguishes "no variable set" from "variable set but wrong" from
 * "connected but the tables are missing" — three failures that all surface in
 * the app as the same "account couldn't be looked up" message.
 *
 * Credentials are never echoed: usernames and passwords are masked before
 * anything is returned.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANDIDATES = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DIRECT_URL",
] as const;

/** Strips credentials so the result is safe to paste into a chat or an issue. */
function describe(raw: string) {
  // Checked before parsing: a URL still holding [PROJECT-REF] / [YOUR-PASSWORD]
  // does not parse at all (the brackets read as an IPv6 literal), so testing
  // this inside the try block would silently drop the most common mistake.
  const looksLikeTemplate = /\[PROJECT-REF\]|\[YOUR-PASSWORD\]|\[REGION\]|<.*?>/.test(raw);
  try {
    const u = new URL(raw);
    const user = u.username
      ? u.username.length > 12
        ? `${u.username.slice(0, 9)}…${u.username.slice(-4)}`
        : u.username
      : "(none)";
    return {
      host: u.hostname,
      port: u.port || "(default 5432)",
      database: u.pathname.replace(/^\//, "") || "(none)",
      username: user,
      hasPassword: Boolean(u.password),
      params: u.search ? u.search.slice(1) : "(none)",
      looksLikeTemplate,
    };
  } catch {
    return {
      looksLikeTemplate,
      parseError: looksLikeTemplate
        ? "STILL A TEMPLATE — this value contains [PROJECT-REF] / [YOUR-PASSWORD] / [REGION] placeholders that were never replaced with real values."
        : "Not a valid connection URL. Check for stray quotes, spaces, or a missing postgresql:// prefix.",
    };
  }
}

/** Classifies the failure into the specific thing to go fix. */
function diagnose(message: string): string {
  if (/Can't reach database server/i.test(message))
    return "Host unreachable. If the host is db.<ref>.supabase.co, that endpoint is IPv6-only and Vercel cannot reach it — switch to the pooler host (aws-0-<region>.pooler.supabase.com). Also confirm the project is not paused.";
  if (/password authentication failed/i.test(message))
    return "Wrong password. Percent-encode special characters (@ -> %40, # -> %23), or reset it in Supabase Settings -> Database.";
  if (/Tenant or user not found/i.test(message))
    return "Wrong username for this host. Pooler needs postgres.<PROJECT-REF>; the direct host needs plain postgres.";
  if (/Environment variable not found/i.test(message))
    return "Prisma tried to resolve a variable that is not set in this environment.";
  if (/does not exist|relation .* does not exist/i.test(message))
    return "Connected, but the schema is missing. Run prisma/supabase-setup.sql in this project's SQL editor.";
  if (/42P05|prepared statement .* already exists/i.test(message))
    return "Connected through the transaction pooler without ?pgbouncer=true. Append it to the port-6543 URL so Prisma stops using prepared statements.";
  if (/invalid port|Invalid URL|invalid connection string|error parsing/i.test(message))
    return "The connection string is malformed — most often the Supabase template pasted in with [PROJECT-REF] / [YOUR-PASSWORD] placeholders still in place, or surrounding quotes copied into the Vercel value box.";
  return "Unrecognised error — paste the raw message.";
}

async function probe(url: string) {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    const meta = await client.$queryRawUnsafe<Array<{ db: string; usr: string }>>(
      "SELECT current_database() AS db, current_user AS usr",
    );
    const result: Record<string, unknown> = {
      connected: true,
      database: meta[0]?.db,
      connectedAs: meta[0]?.usr,
    };

    // Connected — so is the schema actually there?
    try {
      const counts = await client.$queryRawUnsafe<
        Array<{ users: bigint; staff: bigint; services: bigint }>
      >(
        "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM staff) AS staff, (SELECT COUNT(*) FROM services) AS services",
      );
      const c = counts[0];
      result.rows = {
        users: Number(c.users),
        staff: Number(c.staff),
        services: Number(c.services),
      };
      result.schema = Number(c.users) > 0 ? "present and seeded" : "present but users table is EMPTY";
    } catch {
      const tables = await client.$queryRawUnsafe<Array<{ n: bigint }>>(
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='public'",
      );
      result.schema = `MISSING — ${Number(tables[0].n)} tables in public. Run prisma/supabase-setup.sql against THIS project.`;
    }
    return result;
  } catch (error) {
    const message = String((error as Error)?.message ?? error)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" | ");
    return { connected: false, error: message, likelyCause: diagnose(message) };
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

/**
 * Fixed token, required as ?key=… — this endpoint reports the database host
 * and raw connection errors, which should not be readable by anyone who
 * guesses the path. Without it the response is an ordinary 404, so the route
 * is indistinguishable from one that does not exist.
 */
const ACCESS_KEY = "fc35d3771aef09300ccb2a5d";

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("key") !== ACCESS_KEY) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const report: Record<string, unknown> = {
    note: "Temporary diagnostic. Delete src/app/api/health/db/ once login works.",
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV ?? "(not on Vercel)",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "(unknown)",
    authSecret: process.env.AUTH_SECRET
      ? `set, ${process.env.AUTH_SECRET.length} chars${
          process.env.AUTH_SECRET.length >= 32 ? "" : " — TOO SHORT, must be >= 32"
        }`
      : "NOT SET — login will fail with a 500 once the database works",
  };

  const candidates: Record<string, unknown> = {};
  for (const name of CANDIDATES) {
    const raw = process.env[name]?.trim();
    if (!raw) {
      candidates[name] = { set: false };
      continue;
    }
    candidates[name] = { set: true, ...describe(raw), probe: await probe(raw) };
  }
  report.candidates = candidates;

  const anyWorking = Object.values(candidates).some(
    (c) => (c as { probe?: { connected?: boolean } }).probe?.connected,
  );
  report.verdict = anyWorking
    ? "At least one connection works — check its `schema` field above."
    : "No connection string works. See likelyCause on each candidate.";

  return NextResponse.json(report, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
