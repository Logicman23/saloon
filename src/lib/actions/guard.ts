import "server-only";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/auth/session";
import { roleCan, type Permission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
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

export function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof AuthorizationError) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  console.error("[action]", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}
