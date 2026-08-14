import { NextResponse } from "next/server";
import { prisma, connectionUrlSource } from "@/lib/db/client";
import { hashPassword, verifyPassword } from "@/lib/auth/users.server";

/**
 * TEMPORARY — delete src/app/api/force-reset/ once you can sign in.
 *
 * Resets a password from inside the deployed app, using the very same
 * `hashPassword` the login route verifies with. That removes the whole class
 * of "the hash was generated somewhere else with slightly different
 * parameters" doubt: there is one implementation, and both sides call it.
 *
 * It doubles as a write test. Reaching the success branch proves the
 * deployment can not only connect to the database but modify it, which the
 * read-only login path cannot tell you on its own.
 */

/** pbkdf2 needs Node APIs — this must not run on the Edge runtime. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Required as ?key=… — without it this endpoint hands anyone who finds the
 * path a working owner account. Absent or wrong, the response is an ordinary
 * 404 so the route is indistinguishable from one that does not exist.
 */
const ACCESS_KEY = "b7f2c91e4a8d6503";

/** Only these accounts may be reset, so the key cannot be turned into a
 *  general-purpose "set any password on any row" tool. */
const ALLOWED = new Set(["admin@sana.com", "ayesha@sana.com", "cashier@sana.com"]);

const DEFAULT_EMAIL = "admin@sana.com";
const DEFAULT_PASSWORD = "Admin@12345";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  if (params.get("key") !== ACCESS_KEY) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const email = (params.get("email") ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = params.get("password") ?? DEFAULT_PASSWORD;

  if (!ALLOWED.has(email)) {
    return NextResponse.json(
      { ok: false, error: `Refusing to reset ${email}. Allowed: ${[...ALLOWED].join(", ")}` },
      { status: 400 },
    );
  }

  try {
    // The login route looks the account up by lowercased email, so a row
    // stored with different casing would never be found. Check the same way.
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, role: { select: { key: true } } },
    });

    if (!existing) {
      const total = await prisma.user.count();
      return NextResponse.json(
        {
          ok: false,
          error: `No user with email ${email}.`,
          usersInDatabase: total,
          hint:
            total === 0
              ? "The users table is empty — this deployment is pointed at a database where the setup SQL never ran."
              : "The account exists somewhere else. This deployment is likely connected to a different Supabase project than the SQL editor you used.",
          connectionFrom: connectionUrlSource(),
        },
        { status: 404 },
      );
    }

    const { salt, hash } = hashPassword(password);

    await prisma.user.update({
      where: { email },
      data: {
        passwordHash: hash,
        passwordSalt: salt,
        active: true,
        // Ten consecutive failures lock the account for 15 minutes. Leaving
        // that in place would make a correct password still fail, which is
        // exactly the confusion this route exists to end.
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    // Read back what was actually persisted and verify against it, rather
    // than trusting the value we just computed in memory. This is the part
    // that proves the stored row really does authenticate.
    const stored = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true, passwordSalt: true, active: true },
    });

    const roundTrip = verifyPassword(password, stored!.passwordSalt, stored!.passwordHash);
    const wrongRejected = !verifyPassword(password + "-wrong", stored!.passwordSalt, stored!.passwordHash);

    return NextResponse.json({
      ok: roundTrip && wrongRejected,
      email,
      name: existing.name,
      role: existing.role.key,
      passwordSetTo: password,
      verifiedAgainstStoredRow: roundTrip,
      wrongPasswordRejected: wrongRejected,
      hashLength: stored!.passwordHash.length,
      saltLength: stored!.passwordSalt.length,
      active: stored!.active,
      connectionFrom: connectionUrlSource(),
      nextStep: roundTrip
        ? `Sign in as ${email} with the password above, then DELETE src/app/api/force-reset/.`
        : "Round-trip verification failed — send this response back before deleting the route.",
    });
  } catch (error) {
    const message = String((error as Error)?.message ?? error)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(" | ");

    return NextResponse.json(
      {
        ok: false,
        error: message,
        connectionFrom: connectionUrlSource(),
        hint: "The reset never ran — the database could not be reached or written to. This is the same failure the login page reports.",
      },
      { status: 500 },
    );
  }
}
