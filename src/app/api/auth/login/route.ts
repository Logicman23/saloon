import { NextResponse } from "next/server";
import { z } from "zod";
import {
  REMEMBER_MAX_AGE,
  SESSION_COOKIE,
  SHIFT_MAX_AGE,
  cookieOptions,
  signSession,
} from "@/lib/auth/session";
import { dummyVerify, findUserByEmail, verifyPassword } from "@/lib/auth/users.server";
import { landingFor } from "@/lib/auth/permissions";

/** pbkdf2 needs Node APIs, so this handler must not run on the Edge runtime. */
export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional().default(false),
});

/**
 * Very small in-memory throttle: 8 failures per IP per 15 minutes.
 *
 * Adequate for a single instance; on serverless this resets per cold start,
 * so put a shared store (Upstash / Redis) behind it before going live.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function throttle(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

function clearThrottle(key: string) {
  attempts.delete(key);
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const gate = throttle(ip);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "too_many_attempts", retryAfter: gate.retryAfter },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { email, password, remember } = parsed.data;
  const user = findUserByEmail(email);

  // Always spend the hashing cost, even for unknown accounts, so response
  // time cannot be used to enumerate valid addresses.
  if (!user) {
    dummyVerify();
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // Checked only after the password matches — otherwise this endpoint would
  // reveal which addresses belong to deactivated employees.
  if (!user.active) {
    return NextResponse.json({ error: "account_deactivated" }, { status: 403 });
  }

  clearThrottle(ip);

  const maxAge = remember ? REMEMBER_MAX_AGE : SHIFT_MAX_AGE;
  const token = await signSession(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      staffId: user.staffId,
    },
    maxAge,
  );

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      staffId: user.staffId,
    },
    redirectTo: landingFor(user.role),
  });

  response.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge));
  return response;
}
