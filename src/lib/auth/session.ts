/**
 * Stateless session tokens.
 *
 * Format:  base64url(JSON payload) + "." + base64url(HMAC-SHA256)
 *
 * Built on Web Crypto only, so the identical verify path runs in Edge
 * middleware, in Node route handlers and in React Server Components. The
 * cookie is httpOnly, so client JavaScript — including anything injected by
 * an XSS — cannot read or forge it.
 *
 * This is a compact JWT-alike rather than a real JWT because we control both
 * ends and do not need JOSE's algorithm negotiation (whose `alg: none` and
 * confusion pitfalls are a common source of auth bypasses).
 */

import type { Role } from "@/lib/auth/permissions";

export const SESSION_COOKIE = "sbs_session";

/** 30 days when "remember me" is ticked, 8 hours (a salon shift) otherwise. */
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;
export const SHIFT_MAX_AGE = 60 * 60 * 8;

export interface SessionPayload {
  /** User id. */
  sub: string;
  email: string;
  name: string;
  role: Role;
  /** Links the account to a `Staff` record for "my schedule" / commission. */
  staffId?: string;
  /** Issued-at and expiry, seconds since epoch. */
  iat: number;
  exp: number;
}

/* ------------------------------------------------------------ base64url */

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/* ---------------------------------------------------------------- Secret */

/**
 * In production the secret MUST come from the environment. The development
 * fallback keeps `npm run dev` working on a fresh clone, but it is a known
 * constant — a build that reached production with it would be trivially
 * forgeable, so we fail loudly instead.
 */
const DEV_SECRET = "sbs-dev-only-insecure-secret-change-me";

function secretMaterial(): string {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is missing or shorter than 32 characters. Refusing to sign " +
        "sessions with the development fallback in production.",
    );
  }
  return fromEnv || DEV_SECRET;
}

let cachedKey: Promise<CryptoKey> | null = null;

function signingKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secretMaterial()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return cachedKey;
}

/* ------------------------------------------------------------ Sign/verify */

export async function signSession(
  payload: Omit<SessionPayload, "iat" | "exp">,
  maxAgeSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + maxAgeSeconds };

  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(body),
  );

  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Returns the payload only when the signature is valid *and* the token is
 * unexpired. Every failure path returns `null` — callers must not be able to
 * distinguish "bad signature" from "expired" from "malformed".
 */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  if (!body || !signature) return null;

  try {
    // crypto.subtle.verify is constant-time, so this is not a timing oracle.
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      fromBase64Url(signature) as unknown as BufferSource,
      new TextEncoder().encode(body),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;

    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!payload.sub || !payload.role) return null;

    return payload;
  } catch {
    return null;
  }
}

/** Cookie attributes shared by the login and logout handlers. */
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true, //                 unreadable from client JS (XSS-resistant)
    sameSite: "lax" as const, //       blocks cross-site CSRF on state changes
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
