import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

/**
 * Capture endpoint for the client tracking link.
 *
 * Deliberately public — see the matcher note in `src/middleware.ts`. The
 * person posting here is a salon customer with no account, so the protections
 * are shape validation, a per-IP throttle, and the fact that the handler only
 * ever inserts: nothing here can read, update or delete an existing record.
 *
 * Prisma needs Node APIs, so this must not run on the Edge runtime.
 */
export const runtime = "nodejs";

const LocationSchema = z.object({
  /**
   * The identifier from the link's `?client=` parameter. Kept as an opaque
   * string rather than coerced to a number: a leading zero is meaningful in a
   * local phone number and `Number("0331…")` would eat it.
   */
  clientId: z.string().trim().min(3).max(64),
  /**
   * `z.number()` rejects NaN and Infinity, and the ranges are the real limits
   * of the coordinate system — a payload outside them is not a rounding
   * problem, it is a fabricated or corrupted value.
   */
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** `coords.accuracy` in metres. Optional: not every device reports it. */
  accuracy: z.number().nonnegative().max(1_000_000).optional(),
});

/**
 * Per-IP throttle: 20 captures per IP per 15 minutes.
 *
 * Mirrors the login route, including its caveat — this is in-memory, so on
 * serverless it resets per cold start and is per-instance. Adequate to stop a
 * loop hammering the table; put a shared store behind it if the link is ever
 * broadcast widely.
 *
 * The limit is generous because a genuine client legitimately retries: a
 * first fix times out indoors, they walk outside and try again.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_CAPTURES = 20;
const attempts = new Map<string, { count: number; resetAt: number }>();

function throttle(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_CAPTURES) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * Resolves the link's identifier to a client on file.
 *
 * Matched on the last 10 digits rather than the whole string, because the same
 * person is stored as `0331-2721327` at the front desk and sent a link built
 * from `923312721327`. Comparing either verbatim would never match. Ten digits
 * is the length of a Pakistani subscriber number without its country code or
 * trunk zero, so it is the longest suffix both forms reliably share.
 *
 * A miss is not an error: the capture is stored against the raw identifier and
 * the dashboard shows that instead of a name.
 *
 * The class is `[^0-9]`, not `\D`. Postgres' regex engine leaves `\D`
 * unmatched inside REGEXP_REPLACE and hands back the phone number untouched,
 * so every lookup would silently miss and every capture would land unmatched.
 * Verified against a real engine — `[^0-9]` strips, `\D` does not.
 */
async function resolveClientId(clientRef: string): Promise<string | null> {
  const digits = clientRef.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const suffix = digits.slice(-10);

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "clients"
    WHERE RIGHT(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), 10) = ${suffix}
    ORDER BY "archived_at" NULLS FIRST, "created_at" ASC
    LIMIT 1
  `;

  return rows[0]?.id ?? null;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const gate = throttle(ip);
  if (!gate.allowed) {
    return NextResponse.json(
      { success: false, error: "too_many_requests", message: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid_request", message: "Expected a JSON body." },
      { status: 400 },
    );
  }

  const parsed = LocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "invalid_coordinates",
        message: "latitude and longitude must be valid numbers, and clientId must be present.",
      },
      { status: 400 },
    );
  }

  const { clientId: clientRef, latitude, longitude, accuracy } = parsed.data;

  try {
    const matchedClientId = await resolveClientId(clientRef);

    await prisma.clientLocation.create({
      data: {
        clientRef,
        clientId: matchedClientId,
        latitude,
        longitude,
        // Sub-metre precision in an accuracy *estimate* is noise, so it is
        // stored as whole metres.
        accuracyM: accuracy === undefined ? null : Math.round(accuracy),
        ip: ip === "unknown" ? null : ip,
        // Bounded: the column is unindexed free text off a public endpoint.
        userAgent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
      },
    });
  } catch (error) {
    // An unreachable or unmigrated database must not read to the client as
    // "your location was rejected" — they would keep retrying a fix that was
    // always fine. Say the save failed, and log the real cause for the salon.
    console.error("[save-location] failed to store capture:", error);
    return NextResponse.json(
      {
        success: false,
        error: "storage_failed",
        message: "Your location couldn't be saved. Please try again in a moment.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true, message: "Location saved" }, { status: 201 });
}
