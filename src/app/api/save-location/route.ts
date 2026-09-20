import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { clientIpFrom, lookupIpLocation } from "@/lib/geo/ip-lookup";

/**
 * Capture endpoint for the client tracking link.
 *
 * Called twice in a normal visit:
 *
 *   1. On page load, with device details and no coordinates. The server
 *      resolves the request IP to an approximate place and writes an
 *      IP_APPROX row, returning its id.
 *   2. If the client then grants GPS, with that id and precise coordinates.
 *      The same row is sharpened to GPS_PRECISE rather than duplicated — one
 *      visit is one row, and the city and carrier from step 1 stay on it.
 *
 * Deliberately public — see the matcher note in `src/middleware.ts`. The
 * person posting here is a salon customer with no account, so the protections
 * are shape validation, a per-IP throttle, and a write surface that can only
 * insert a row or sharpen a recent one it can already name.
 *
 * Prisma needs Node APIs, so this must not run on the Edge runtime.
 */
export const runtime = "nodejs";

const DeviceSchema = z.object({
  type: z.enum(["Mobile", "Tablet", "Desktop", "Unknown"]).optional(),
  os: z.string().trim().max(80).optional(),
  browser: z.string().trim().max(80).optional(),
  model: z.string().trim().max(120).optional(),
  screen: z.string().trim().max(40).optional(),
});

const CaptureSchema = z
  .object({
    /**
     * The identifier from the link's `?client=` parameter. Kept as an opaque
     * string rather than coerced to a number: a leading zero is meaningful in
     * a local phone number and `Number("0331…")` would eat it.
     */
    clientId: z.string().trim().min(3).max(64),
    /** Id of the row this visit already created, when sharpening it. */
    captureId: z.string().trim().max(64).optional(),
    /**
     * `z.number()` rejects NaN and Infinity, and the ranges are the real
     * limits of the coordinate system — a payload outside them is not a
     * rounding problem, it is a fabricated or corrupted value.
     *
     * Optional since the device-only first call, which carries no fix.
     */
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    /** `coords.accuracy` in metres. Not every device reports it. */
    accuracy: z.number().nonnegative().max(1_000_000).optional(),
    device: DeviceSchema.optional(),
  })
  // A lone latitude is a bug in the caller, not half a location. Accepting it
  // would store a coordinate that cannot be plotted.
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: "latitude and longitude must be sent together",
  });

/**
 * Per-IP throttle: 40 requests per IP per 15 minutes.
 *
 * Mirrors the login route, including its caveat — in-memory, so on serverless
 * it resets per cold start and is per-instance. Adequate to stop a loop
 * hammering the table.
 *
 * Doubled from the pre-0006 limit because a single visit now costs two
 * requests rather than one, and a client legitimately retries: a first fix
 * times out indoors, they walk outside and try again.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 40;
const attempts = new Map<string, { count: number; resetAt: number }>();

function throttle(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_REQUESTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * How long a capture stays open to being sharpened by GPS.
 *
 * Long enough for a client to read the page, think about it and allow
 * permission; short enough that a leaked id is not a standing write.
 */
const UPGRADE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Resolves the link's identifier to a client on file.
 *
 * Matched on the last 10 digits rather than the whole string, because the
 * same person is stored as `0331-2721327` at the front desk and sent a link
 * built from `923312721327`. Comparing either verbatim would never match. Ten
 * digits is the length of a Pakistani subscriber number without its country
 * code or trunk zero, so it is the longest suffix both forms reliably share.
 *
 * A miss is not an error: the capture is stored against the raw identifier
 * and the dashboard shows that instead of a name.
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
  const ip = clientIpFrom(request.headers);
  const throttleKey = ip ?? "unknown";

  const gate = throttle(throttleKey);
  if (!gate.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "too_many_requests",
        message: "Too many attempts. Try again shortly.",
      },
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

  const parsed = CaptureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "invalid_coordinates",
        message:
          "clientId must be present, and latitude and longitude must be valid numbers sent together.",
      },
      { status: 400 },
    );
  }

  const { clientId: clientRef, captureId, latitude, longitude, accuracy, device } = parsed.data;
  const hasFix = latitude !== undefined && longitude !== undefined;

  try {
    /* ------------------------------------------- Sharpen an existing row */

    if (hasFix && captureId) {
      // `updateMany` rather than `update`: every condition is part of the
      // authorisation, and a miss must be an empty result to fall through on,
      // not an exception. An id alone is not enough — it has to be a recent,
      // still-approximate row belonging to the same link. Guessing a cuid
      // buys nothing without all three.
      const { count } = await prisma.clientLocation.updateMany({
        where: {
          id: captureId,
          clientRef,
          locationType: "IP_APPROX",
          createdAt: { gte: new Date(Date.now() - UPGRADE_WINDOW_MS) },
        },
        data: {
          latitude,
          longitude,
          accuracyM: accuracy === undefined ? null : Math.round(accuracy),
          locationType: "GPS_PRECISE",
        },
      });

      if (count > 0) {
        return NextResponse.json(
          { success: true, id: captureId, locationType: "GPS_PRECISE", message: "Location saved" },
          { status: 200 },
        );
      }
      // Stale or unknown id — fall through and record the fix on its own row
      // rather than discarding a real GPS reading over bookkeeping.
    }

    /* ---------------------------------------------------- Create a row */

    const [matchedClientId, approx] = await Promise.all([
      resolveClientId(clientRef),
      // Skipped when GPS already answered: a precise fix makes the
      // approximate coordinates redundant, and this is a network round trip
      // on the client's critical path.
      hasFix ? Promise.resolve(null) : lookupIpLocation(ip, request.headers),
    ]);

    const created = await prisma.clientLocation.create({
      data: {
        clientRef,
        clientId: matchedClientId,
        locationType: hasFix ? "GPS_PRECISE" : "IP_APPROX",
        latitude: hasFix ? latitude : (approx?.latitude ?? null),
        longitude: hasFix ? longitude : (approx?.longitude ?? null),
        // Sub-metre precision in an accuracy *estimate* is noise, so whole
        // metres — and never a figure at all for an IP guess.
        accuracyM: hasFix && accuracy !== undefined ? Math.round(accuracy) : null,

        ipAddress: ip,
        city: approx?.city ?? null,
        region: approx?.region ?? null,
        country: approx?.country ?? null,
        isp: approx?.isp ?? null,

        deviceType: device?.type ?? null,
        os: device?.os ?? null,
        browser: device?.browser ?? null,
        deviceModel: device?.model ?? null,
        screenResolution: device?.screen ?? null,

        // Bounded: the column is unindexed free text off a public endpoint.
        userAgent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
      },
      select: { id: true },
    });

    return NextResponse.json(
      {
        success: true,
        id: created.id,
        locationType: hasFix ? "GPS_PRECISE" : "IP_APPROX",
        message: "Location saved",
      },
      { status: 201 },
    );
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
}
