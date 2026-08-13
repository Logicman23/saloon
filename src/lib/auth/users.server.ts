import "server-only";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/client";
import type { Role } from "@/lib/auth/permissions";

/**
 * Account lookup and password verification, backed by the `users` table.
 *
 * `import "server-only"` makes this a build error if it is ever pulled into a
 * client bundle, so password material cannot reach the browser even by
 * accident.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Links to a `staff` row so a beautician can see their own chair. */
  staffId?: string;
  active: boolean;
  lockedUntil?: Date | null;
  passwordSalt: string;
  passwordHash: string;
}

const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 floor for PBKDF2-HMAC-SHA512
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return { salt, hash };
}

/**
 * Constant-time comparison. A plain `===` on hashes leaks length and prefix
 * information through timing, which is exactly the class of bug this file
 * exists to avoid.
 */
export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function hashPin(pin: string) {
  return createHash("sha256").update(pin).digest("hex");
}

/** Looks the account up by email, joining the role so we get its key. */
export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const row = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { role: { select: { key: true } } },
  });
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role.key as Role,
    staffId: row.staffId ?? undefined,
    active: row.active,
    lockedUntil: row.lockedUntil,
    passwordSalt: row.passwordSalt,
    passwordHash: row.passwordHash,
  };
}

/** Records a successful sign-in and clears the failure counter. */
export async function recordLoginSuccess(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
}

/**
 * Counts a failed attempt and locks the account for 15 minutes after 10
 * consecutive failures.
 *
 * This is per-account, unlike the per-IP throttle in the route handler — the
 * two cover different attacks: one attacker hammering many accounts, versus
 * many addresses hammering one account.
 */
export async function recordLoginFailure(userId: string) {
  const row = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });

  if (row.failedLoginCount >= 10) {
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000), failedLoginCount: 0 },
    });
  }
}

/** Verifies a manager override PIN against any account allowed to grant one. */
export async function verifyOverridePin(pin: string): Promise<boolean> {
  const digest = hashPin(pin);
  const holders = await prisma.user.findMany({
    where: { overridePinHash: { not: null }, active: true },
    select: { overridePinHash: true },
  });

  // Compare against every holder in constant time, without short-circuiting,
  // so the number of comparisons does not depend on which one matched.
  let matched = false;
  for (const holder of holders) {
    if (!holder.overridePinHash) continue;
    const a = Buffer.from(digest, "hex");
    const b = Buffer.from(holder.overridePinHash, "hex");
    if (a.length === b.length && timingSafeEqual(a, b)) matched = true;
  }
  return matched;
}

/**
 * Burns roughly the same CPU as a real verification so a request for a
 * non-existent account takes as long as one for a real account. Without this,
 * response timing enumerates valid email addresses.
 */
export function dummyVerify() {
  verifyPassword("timing-equalizer", "0".repeat(32), "00".repeat(KEY_LENGTH));
}
