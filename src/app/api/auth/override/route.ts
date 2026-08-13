import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const OverrideSchema = z.object({
  pin: z.string().min(4).max(12),
  permission: z.enum(PERMISSIONS as unknown as [Permission, ...Permission[]]),
});

/**
 * Manager PIN for cashier escalations.
 *
 * Stored as a SHA-256 hash of the configured PIN. A PIN is low-entropy by
 * nature, so this is a supervision control — "a manager stood here and typed
 * it" — not a cryptographic one. The throttle below is what makes a 4-digit
 * space impractical to brute force.
 */
const DEV_PIN = "4726";

function expectedDigest() {
  const pin = process.env.ADMIN_OVERRIDE_PIN || DEV_PIN;
  if (!process.env.ADMIN_OVERRIDE_PIN && process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_OVERRIDE_PIN must be set in production.");
  }
  return createHash("sha256").update(pin).digest();
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  // Overrides are only meaningful for an already-authenticated operator.
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const now = Date.now();
  const entry = attempts.get(session.sub);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = OverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supplied = createHash("sha256").update(parsed.data.pin).digest();
  const ok = timingSafeEqual(supplied, expectedDigest());

  if (!ok) {
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS };
    current.count += 1;
    attempts.set(session.sub, current);

    // Audit trail: a failed override is a security-relevant event. Ship this
    // to the AuditLog table (see prisma/schema.prisma) once wired.
    console.warn(
      `[audit] failed override user=${session.sub} role=${session.role} permission=${parsed.data.permission}`,
    );
    return NextResponse.json({ error: "invalid_pin" }, { status: 403 });
  }

  attempts.delete(session.sub);
  console.info(
    `[audit] override granted user=${session.sub} role=${session.role} permission=${parsed.data.permission}`,
  );

  return NextResponse.json({ ok: true, permission: parsed.data.permission });
}
