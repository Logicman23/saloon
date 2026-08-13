import "server-only";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role } from "@/lib/auth/permissions";

/**
 * Demo account store — the stand-in for the `User` table.
 *
 * `import "server-only"` makes this a build error if it is ever pulled into a
 * client bundle, so password material cannot leak into the browser even by
 * accident. Replace the two lookup functions with Prisma queries and nothing
 * else in the auth layer changes.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Links to a `Staff` row so a beautician can see their own chair. */
  staffId?: string;
  active: boolean;
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

/**
 * Deterministic salts so the demo credentials below stay stable across
 * restarts. Real accounts must use `randomBytes` — which `hashPassword`
 * does by default.
 */
function demoSalt(seed: string) {
  return createHash("sha256").update(`sbs-demo-${seed}`).digest("hex").slice(0, 32);
}

function demoUser(
  id: string,
  email: string,
  name: string,
  role: Role,
  password: string,
  options: { staffId?: string; active?: boolean } = {},
): AuthUser {
  const salt = demoSalt(id);
  const { hash } = hashPassword(password, salt);
  return {
    id,
    email,
    name,
    role,
    staffId: options.staffId,
    active: options.active ?? true,
    passwordSalt: salt,
    passwordHash: hash,
  };
}

/**
 * Demo credentials. These are intentionally weak and are seeded for the
 * role-switcher on the login screen — delete this array the moment real
 * accounts exist.
 */
export const DEMO_CREDENTIALS = [
  { role: "ADMIN" as Role, email: "owner@sanasbeauty.pk", password: "Owner@2026" },
  { role: "CASHIER" as Role, email: "reception@sanasbeauty.pk", password: "Front@2026" },
  { role: "STAFF" as Role, email: "ayesha@sanasbeauty.pk", password: "Studio@2026" },
];

const USERS: AuthUser[] = [
  demoUser("usr_owner", "owner@sanasbeauty.pk", "Sana Malik", "ADMIN", "Owner@2026", {
    staffId: "stf_sana",
  }),
  demoUser("usr_reception", "reception@sanasbeauty.pk", "Rabia Sattar", "CASHIER", "Front@2026", {
    staffId: "stf_rabia",
  }),
  demoUser("usr_ayesha", "ayesha@sanasbeauty.pk", "Ayesha Khan", "STAFF", "Studio@2026", {
    staffId: "stf_ayesha",
  }),
  demoUser("usr_zoya", "zoya@sanasbeauty.pk", "Zoya Iqbal", "STAFF", "Studio@2026", {
    staffId: "stf_zoya",
  }),
  // Exercises the "account deactivated" path on the login screen.
  demoUser("usr_former", "former@sanasbeauty.pk", "Mehwish Ali", "STAFF", "Studio@2026", {
    staffId: "stf_mehwish",
    active: false,
  }),
];

export function findUserByEmail(email: string): AuthUser | undefined {
  const normalized = email.trim().toLowerCase();
  return USERS.find((user) => user.email.toLowerCase() === normalized);
}

export function findUserById(id: string): AuthUser | undefined {
  return USERS.find((user) => user.id === id);
}

/**
 * Burns roughly the same CPU as a real verification so that a request for a
 * non-existent account takes as long as one for a real account. Without this,
 * response timing enumerates valid email addresses.
 */
export function dummyVerify() {
  verifyPassword("timing-equalizer", demoSalt("absent"), "00".repeat(KEY_LENGTH));
}
