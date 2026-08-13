import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { verifyOverridePin } from "@/lib/auth/users.server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

const OverrideSchema = z.object({
  pin: z.string().min(4).max(12),
  permission: z.enum(PERMISSIONS as unknown as [Permission, ...Permission[]]),
});

/**
 * Manager PIN for cashier escalations.
 *
 * Checked against `users.override_pin_hash` first — that is the real source
 * of truth, so a manager leaving means revoking their row rather than
 * redeploying. `ADMIN_OVERRIDE_PIN` remains as a break-glass fallback for
 * environments where no PIN holder has been provisioned yet.
 *
 * A PIN is low-entropy by nature, so this is a supervision control — "a
 * manager stood here and typed it" — not a cryptographic one. The throttle
 * below is what makes a 4-digit space impractical to brute force.
 */
function envPinMatches(pin: string) {
  const configured = process.env.ADMIN_OVERRIDE_PIN;
  if (!configured) return false;
  const a = createHash("sha256").update(pin).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

/**
 * Writes to the append-only audit trail. Deliberately never throws: an
 * override must not fail because logging did, and it must not succeed
 * silently either — hence the console fallback.
 */
async function audit(
  action: "OVERRIDE_GRANTED" | "OVERRIDE_DENIED",
  session: { sub: string; email: string; role: string },
  permission: string,
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: session.sub,
        actorEmail: session.email,
        actorRole: session.role,
        entityType: "Permission",
        entityId: permission,
      },
    });
  } catch (error) {
    console.warn(`[audit] ${action} user=${session.sub} permission=${permission}`, error);
  }
}

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

  // Database PIN holders first; the env var is only a fallback.
  let ok = false;
  try {
    ok = await verifyOverridePin(parsed.data.pin);
  } catch (error) {
    console.error("[auth] override lookup failed:", error);
  }
  if (!ok) ok = envPinMatches(parsed.data.pin);

  if (!ok) {
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS };
    current.count += 1;
    attempts.set(session.sub, current);

    await audit("OVERRIDE_DENIED", session, parsed.data.permission);
    return NextResponse.json({ error: "invalid_pin" }, { status: 403 });
  }

  attempts.delete(session.sub);
  await audit("OVERRIDE_GRANTED", session, parsed.data.permission);

  return NextResponse.json({ ok: true, permission: parsed.data.permission });
}
