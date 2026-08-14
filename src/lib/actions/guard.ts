import "server-only";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/auth/session";
import { roleCan, type Permission } from "@/lib/auth/permissions";
import { prisma, Prisma } from "@/lib/db/client";
import type { AuditAction } from "@prisma/client";

/**
 * Server-side permission gate for mutations.
 *
 * This is the layer the earlier RBAC work could not provide: middleware
 * decides which *pages* you may open, but a server action is a callable
 * endpoint. Without a check here, a beautician could invoke `checkout` or
 * `deleteExpense` directly from the browser console regardless of what the UI
 * shows them.
 *
 * Every mutating action in `src/lib/actions/*` starts with `requirePermission`.
 */

export class AuthorizationError extends Error {
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}

export async function currentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** Throws unless the caller is signed in and holds the capability. */
export async function requirePermission(permission: Permission): Promise<SessionPayload> {
  const session = await currentSession();
  if (!session) throw new AuthorizationError(permission);

  if (!roleCan(session.role, permission)) {
    await recordAudit("ACCESS_DENIED", session, {
      entityType: "Permission",
      entityId: permission,
    });
    throw new AuthorizationError(permission);
  }
  return session;
}

/** Signed-in but no specific capability required. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await currentSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

/**
 * Append-only audit write. Never throws — a failed log must not roll back the
 * business action, but it must not vanish either, hence the console fallback.
 */
export async function recordAudit(
  action: AuditAction,
  session: SessionPayload | null,
  detail: {
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  } = {},
) {
  try {
    const headerList = await headers();
    await prisma.auditLog.create({
      data: {
        action,
        userId: session?.sub,
        actorEmail: session?.email,
        actorRole: session?.role,
        entityType: detail.entityType,
        entityId: detail.entityId,
        metadata: detail.metadata as never,
        ip:
          headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          headerList.get("x-real-ip") ??
          undefined,
        userAgent: headerList.get("user-agent") ?? undefined,
      },
    });
  } catch (error) {
    console.warn(`[audit] ${action} failed to persist`, error);
  }
}

/** Uniform shape returned by every action, so the UI can branch on `ok`. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Turns a thrown error into something a receptionist can act on.
 *
 * The generic fallback is deliberate for anything unrecognised — internal
 * messages can leak schema details — but the cases below are ones the person
 * at the counter can actually fix, so spending a specific message on them
 * saves a support call. Nothing here exposes a value the caller did not
 * already submit.
 */
export function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof AuthorizationError) {
    return { ok: false, error: "You don't have permission to do that." };
  }

  // Validation: name the offending field. "Something went wrong" on a form
  // with twelve inputs is not a usable error message.
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    if (issue) {
      const field = issue.path.filter((p) => typeof p === "string").join(" ");
      return { ok: false, error: field ? `${field}: ${issue.message}` : issue.message };
    }
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": {
        // Unique constraint. `target` is the column list, which for this
        // schema is always something the user typed (sku, phone, email).
        const target = (error.meta?.target as string[] | undefined)?.join(", ");
        return {
          ok: false,
          error: target
            ? `That ${target} is already used by another record.`
            : "A record with those details already exists.",
        };
      }
      case "P2003":
        return { ok: false, error: "That references something which no longer exists." };
      case "P2025":
        return { ok: false, error: "That record no longer exists — it may have been deleted." };
    }
  }

  // The database is unreachable or misconfigured. Distinguishing this from a
  // genuine application fault is what stops "it's broken" turning into a hunt
  // through the wrong layer.
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code.startsWith("P1"))
  ) {
    console.error("[action] database unreachable", error);
    return {
      ok: false,
      error: "Can't reach the database right now. Please try again in a moment.",
    };
  }

  console.error("[action]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}
