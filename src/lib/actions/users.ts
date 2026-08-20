"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/users.server";
import { ROLES, type Role } from "@/lib/auth/permissions";
import {
  diff,
  failure,
  recordAudit,
  requirePermission,
  type ActionResult,
} from "@/lib/actions/guard";

/**
 * Login administration — issuing, re-roling, suspending and deleting accounts.
 *
 * Every action here can hand over or take away access to the whole system, so
 * three invariants are enforced on all of them rather than left to the UI:
 *
 *   1. `users.manage` is required. The owner role holds it and nothing else
 *      does, but the check is here because a server action is a callable
 *      endpoint regardless of which buttons are rendered.
 *   2. Nobody may demote, suspend or delete themselves. Every one of those is
 *      a way to lock the only owner out of their own salon, with no second
 *      account to undo it from.
 *   3. The last active owner is untouchable, for the same reason.
 */

/** Minimum that survives a dictionary attack at 210k PBKDF2 iterations. */
const PASSWORD_MIN = 10;

const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `must be at least ${PASSWORD_MIN} characters`)
  .max(200);

const CreateUserSchema = z.object({
  name: z.string().trim().min(2, "must be at least 2 characters").max(120),
  email: z.string().trim().toLowerCase().email("is not a valid address").max(160),
  password: PasswordSchema,
  role: z.enum(ROLES),
  /** Optional: links the login to a chair, for "my schedule" and commission. */
  staffId: z.string().min(1).optional(),
});

/**
 * Refuses any change that would leave the salon with no way back in.
 *
 * Returns an error message, or null when the change is safe. Both conditions
 * matter: acting on yourself is the fast way to lock yourself out, and
 * removing the last owner is the slow way.
 */
async function guardLastOwner(
  targetUserId: string,
  actorUserId: string,
  verb: string,
): Promise<string | null> {
  if (targetUserId === actorUserId) {
    return `You cannot ${verb} your own account. Ask another owner to do it.`;
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { active: true, role: { select: { key: true } } },
  });
  if (!target) return "That user no longer exists.";
  if (target.role.key !== "ADMIN") return null;

  const otherOwners = await prisma.user.count({
    where: { id: { not: targetUserId }, active: true, role: { key: "ADMIN" } },
  });
  if (otherOwners === 0) {
    return `This is the only active owner account — ${verb} it and nobody can administer the salon. Promote someone else first.`;
  }
  return null;
}

/** Resolves a role key to its row id, so callers can pass "ADMIN". */
async function roleIdFor(role: Role): Promise<string | null> {
  const row = await prisma.userRole.findUnique({ where: { key: role }, select: { id: true } });
  return row?.id ?? null;
}

export async function createUserAction(
  input: z.infer<typeof CreateUserSchema>,
): Promise<ActionResult<{ id: string; email: string }>> {
  try {
    const session = await requirePermission("users.manage");
    const data = CreateUserSchema.parse(input);

    // `email` is unique — checking first names the holder instead of failing
    // on the index with an opaque 500.
    const clash = await prisma.user.findUnique({
      where: { email: data.email },
      select: { name: true },
    });
    if (clash) {
      return { ok: false, error: `${clash.name} already signs in with that address.` };
    }

    const roleId = await roleIdFor(data.role);
    if (!roleId) {
      return { ok: false, error: `The ${data.role} role is missing. Re-run the database seed.` };
    }

    if (data.staffId) {
      // `staffId` is unique on User: one chair, one login. Without this the
      // insert fails on the index and says nothing useful about why.
      const taken = await prisma.user.findUnique({
        where: { staffId: data.staffId },
        select: { name: true },
      });
      if (taken) {
        return { ok: false, error: `That team member already has a login (${taken.name}).` };
      }
    }

    const { salt, hash } = hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: hash,
        passwordSalt: salt,
        roleId,
        staffId: data.staffId ?? null,
        active: true,
      },
      select: { id: true, email: true },
    });

    await recordAudit("ROLE_CHANGED", session, {
      entityType: "User",
      entityId: user.id,
      metadata: { created: true, email: data.email, role: data.role, staffId: data.staffId },
    });

    revalidatePath("/staff/users");
    return { ok: true, data: user };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Changes the access tier.
 *
 * Rotating `sessionsValidFrom` is not optional here. Sessions carry the role
 * in the signed cookie, so without it a demoted user keeps administrator
 * access until their existing session happens to expire — which is precisely
 * the window that matters when you are demoting someone.
 */
export async function updateUserRoleAction(
  userId: string,
  role: Role,
): Promise<ActionResult<{ name: string; role: string }>> {
  try {
    const session = await requirePermission("users.manage");
    if (!ROLES.includes(role)) return { ok: false, error: "Unknown role." };

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, role: { select: { key: true } } },
    });
    if (!existing) return { ok: false, error: "That user no longer exists." };
    if (existing.role.key === role) return { ok: true, data: { name: existing.name, role } };

    // Only demotion away from ADMIN can strand the salon; promoting anyone is
    // always safe, and blocking self-promotion would serve no purpose.
    if (existing.role.key === "ADMIN") {
      const problem = await guardLastOwner(userId, session.sub, "change the role on");
      if (problem) return { ok: false, error: problem };
    }

    const roleId = await roleIdFor(role);
    if (!roleId) {
      return { ok: false, error: `The ${role} role is missing. Re-run the database seed.` };
    }

    await prisma.user.update({
      where: { id: userId },
      data: { roleId, sessionsValidFrom: new Date() },
    });

    await recordAudit("ROLE_CHANGED", session, {
      entityType: "User",
      entityId: userId,
      metadata: {
        name: existing.name,
        changes: diff({ role: existing.role.key }, { role }),
        sessionsRevoked: true,
      },
    });

    revalidatePath("/staff/users");
    return { ok: true, data: { name: existing.name, role } };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Suspends or restores an account.
 *
 * The reversible counterpart to deletion, and the one to reach for when
 * someone leaves: the row stays, so their audit trail and the `staff` link
 * survive, and restoring them is one click rather than a re-invite.
 */
export async function setUserActiveAction(
  userId: string,
  active: boolean,
): Promise<ActionResult<{ name: string; active: boolean }>> {
  try {
    const session = await requirePermission("users.manage");

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, active: true },
    });
    if (!existing) return { ok: false, error: "That user no longer exists." };
    if (existing.active === active) return { ok: true, data: { name: existing.name, active } };

    if (!active) {
      const problem = await guardLastOwner(userId, session.sub, "suspend");
      if (problem) return { ok: false, error: problem };
    }

    await prisma.user.update({
      where: { id: userId },
      // Suspension must cut live sessions, or the account keeps working until
      // the cookie expires and "suspended" means nothing until tomorrow.
      data: { active, ...(active ? {} : { sessionsValidFrom: new Date() }) },
    });

    await recordAudit("USER_DEACTIVATED", session, {
      entityType: "User",
      entityId: userId,
      metadata: { name: existing.name, active, sessionsRevoked: !active },
    });

    revalidatePath("/staff/users");
    return { ok: true, data: { name: existing.name, active } };
  } catch (error) {
    return failure(error);
  }
}

/** Sets a new password and signs the account out everywhere. */
export async function resetUserPasswordAction(
  userId: string,
  password: string,
): Promise<ActionResult<{ name: string }>> {
  try {
    const session = await requirePermission("users.manage");
    const parsed = PasswordSchema.parse(password);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!existing) return { ok: false, error: "That user no longer exists." };

    const { salt, hash } = hashPassword(parsed);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hash,
        passwordSalt: salt,
        // Anyone holding the old password is signed out, and the failure
        // counter is cleared so a locked-out account is usable again.
        sessionsValidFrom: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    await recordAudit("PASSWORD_CHANGED", session, {
      entityType: "User",
      entityId: userId,
      metadata: { name: existing.name, byOwner: true, sessionsRevoked: true },
    });

    revalidatePath("/staff/users");
    return { ok: true, data: { name: existing.name } };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Permanent deletion, which the schema is built to survive.
 *
 * `sessions` cascade, and `audit_logs.user_id` is ON DELETE SetNull with the
 * actor's email denormalised onto the row — so the security trail keeps naming
 * who did what after the account is gone. That is what makes a hard delete
 * defensible here, where it is not for a client or a service.
 *
 * `staff` is untouched: the chair, its bookings and its commission history are
 * a separate record from the login that happened to be attached to it.
 */
export async function deleteUserAction(
  userId: string,
): Promise<ActionResult<{ name: string }>> {
  try {
    const session = await requirePermission("users.manage");

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, role: { select: { key: true } } },
    });
    if (!existing) return { ok: false, error: "That user no longer exists." };

    const problem = await guardLastOwner(userId, session.sub, "delete");
    if (problem) return { ok: false, error: problem };

    // Audited before the delete, not after: once the row is gone the SetNull
    // has already fired and there is no user id left to record against.
    await recordAudit("USER_DEACTIVATED", session, {
      entityType: "User",
      entityId: userId,
      metadata: {
        deleted: true,
        name: existing.name,
        email: existing.email,
        role: existing.role.key,
      },
    });

    await prisma.user.delete({ where: { id: userId } });

    revalidatePath("/staff/users");
    return { ok: true, data: { name: existing.name } };
  } catch (error) {
    return failure(error);
  }
}
