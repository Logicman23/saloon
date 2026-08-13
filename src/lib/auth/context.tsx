"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ROLE_META,
  canAccessPath,
  roleCan,
  roleCanAll,
  roleCanAny,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";

/**
 * Client-side view of the signed-in user.
 *
 * IMPORTANT: everything here is a *usability* layer. It hides controls the
 * user may not use so the UI stays honest, but it is not a security boundary
 * — the session cookie is httpOnly and the real check happens in
 * `middleware.ts` (and, once a database exists, in each server action).
 * Never gate a privileged mutation on `can()` alone.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  staffId?: string;
}

interface AuthContextValue {
  user: SessionUser;
  role: Role;
  roleLabel: string;
  /** Holds this capability. */
  can: (permission: Permission) => boolean;
  canAny: (permissions: Permission[]) => boolean;
  canAll: (permissions: Permission[]) => boolean;
  canVisit: (pathname: string) => boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      role: user.role,
      roleLabel: ROLE_META[user.role].label,
      can: (permission) => roleCan(user.role, permission),
      canAny: (permissions) => roleCanAny(user.role, permissions),
      canAll: (permissions) => roleCanAll(user.role, permissions),
      canVisit: (pathname) => canAccessPath(user.role, pathname),
      isAdmin: user.role === "ADMIN",
      signOut: async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        // `replace` rather than `push` so the authenticated page cannot be
        // reached with the back button. Leaving the (app) route group
        // unmounts SalonProvider, so no salon data survives into the next
        // session, and `refresh()` drops the cached RSC payload.
        router.replace("/login");
        router.refresh();
      },
    }),
    [user, router],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}

/**
 * Conditional render by capability.
 *
 *   <Can permission="finance.view">…</Can>
 *   <Can anyOf={["invoice.void", "pos.discount.override"]} fallback={<Locked />}>…</Can>
 */
export function Can({
  permission,
  anyOf,
  allOf,
  fallback = null,
  children,
}: {
  permission?: Permission;
  anyOf?: Permission[];
  allOf?: Permission[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { can, canAny, canAll } = useAuth();

  let granted = true;
  if (permission) granted = granted && can(permission);
  if (anyOf?.length) granted = granted && canAny(anyOf);
  if (allOf?.length) granted = granted && canAll(allOf);

  return <>{granted ? children : fallback}</>;
}

/**
 * Page-level guard. Middleware already blocks the navigation, so this is a
 * defence-in-depth net for client-side transitions and for panels rendered
 * inside an otherwise-permitted page.
 */
export function ProtectedRoute({
  allowedRoles,
  requires,
  redirectTo = "/denied",
  children,
}: {
  allowedRoles?: Role[];
  requires?: Permission[];
  redirectTo?: string;
  children: React.ReactNode;
}) {
  const { role, canAny } = useAuth();
  const router = useRouter();

  const permitted =
    (!allowedRoles || allowedRoles.includes(role)) && (!requires || canAny(requires));

  React.useEffect(() => {
    if (!permitted) router.replace(redirectTo);
  }, [permitted, redirectTo, router]);

  if (!permitted) return null;
  return <>{children}</>;
}
