/**
 * Role-based access control — the single source of truth.
 *
 * Permissions are *capabilities*, not screens. Screens are then mapped to the
 * capability they require (`ROUTE_PERMISSIONS`), so middleware, the sidebar
 * and in-page guards all derive from one matrix and cannot drift apart.
 *
 * This module is imported by Edge middleware, so it must stay free of Node
 * built-ins and of any `server-only` import.
 */

/* ------------------------------------------------------------------ Roles */

export const ROLES = ["ADMIN", "CASHIER", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<
  Role,
  { label: string; blurb: string; landing: string; accent: string }
> = {
  ADMIN: {
    label: "Owner / Super Admin",
    blurb: "Unrestricted access to every module, including financials.",
    landing: "/",
    accent: "#d4af37",
  },
  CASHIER: {
    label: "Cashier / Receptionist",
    blurb: "Front desk: billing, bookings and the client directory.",
    landing: "/pos",
    accent: "#38bdf8",
  },
  STAFF: {
    label: "Beautician / Staff",
    blurb: "Personal portal: today's chair, service status and commission.",
    landing: "/my-schedule",
    accent: "#10b981",
  },
};

/* ------------------------------------------------------------ Permissions */

export const PERMISSIONS = [
  // Financial — deliberately the narrowest grant in the system.
  "finance.view", //         P&L, net profit, expense totals, revenue analytics
  "reports.view", //         business report module
  "expenses.view",
  "expenses.manage",

  // Point of sale
  "pos.operate", //          ring up a ticket and take payment
  "pos.discount.override", // discount beyond the standard engine
  "register.view", //        daily cash drawer / shift takings
  "invoice.view",
  "invoice.void", //         void or delete a finalised invoice

  // Appointments
  "appointments.view.all", // every specialist's column
  "appointments.view.own", // only the signed-in member's bookings
  "appointments.manage", //  create, reschedule, cancel
  "appointments.status.own", // mark own bookings in-progress / completed

  // Clients
  "clients.view",
  "clients.manage",
  "clients.export", //       bulk contact export

  // Catalogue
  "services.view",
  "services.manage", //      base pricing, packages, combo deals

  // Inventory
  "inventory.view",
  "inventory.manage", //     stock adjustments

  // People
  "staff.view",
  "staff.manage", //         add / edit / remove staff, change roles & passwords

  // Commission
  "commissions.view.own",
  "commissions.view.all",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/* --------------------------------------------------------- Role → grants */

const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS;

const CASHIER_PERMISSIONS: readonly Permission[] = [
  "pos.operate",
  "register.view",
  "invoice.view",
  "appointments.view.all",
  "appointments.manage",
  "clients.view",
  "clients.manage",
  "services.view",
  "inventory.view",
  // Explicitly withheld: finance.view, reports.view, expenses.*, invoice.void,
  // pos.discount.override, services.manage, inventory.manage, staff.manage,
  // clients.export, commissions.*
];

const STAFF_PERMISSIONS: readonly Permission[] = [
  "appointments.view.own",
  "appointments.status.own",
  "commissions.view.own",
  // Explicitly withheld: everything else — no POS, no inventory edits,
  // no expenses, no client directory or contact export.
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: ADMIN_PERMISSIONS,
  CASHIER: CASHIER_PERMISSIONS,
  STAFF: STAFF_PERMISSIONS,
};

/** Does this role hold the capability? */
export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Does this role hold *every* listed capability? */
export function roleCanAll(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => roleCan(role, p));
}

/** Does this role hold *any* of the listed capabilities? */
export function roleCanAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => roleCan(role, p));
}

/* -------------------------------------------------------- Route → grants */

/**
 * A route is reachable when the role holds *at least one* of the listed
 * permissions. Order matters: the longest matching prefix wins, so
 * `/appointments/x` inherits `/appointments` unless it has its own entry.
 */
export const ROUTE_PERMISSIONS: Array<{ prefix: string; anyOf: Permission[] }> = [
  { prefix: "/my-schedule", anyOf: ["appointments.view.own", "appointments.view.all"] },
  { prefix: "/my-commissions", anyOf: ["commissions.view.own", "commissions.view.all"] },
  { prefix: "/pos", anyOf: ["pos.operate"] },
  { prefix: "/appointments", anyOf: ["appointments.view.all", "appointments.manage"] },
  { prefix: "/clients", anyOf: ["clients.view"] },
  { prefix: "/services", anyOf: ["services.view"] },
  { prefix: "/inventory", anyOf: ["inventory.view"] },
  { prefix: "/expenses", anyOf: ["expenses.view"] },
  { prefix: "/invoices", anyOf: ["invoice.view"] },
  { prefix: "/reports", anyOf: ["reports.view"] },
  { prefix: "/staff", anyOf: ["staff.view"] },
  // The executive dashboard leads with revenue and net profit, so it is
  // gated on the financial capability rather than on merely being signed in.
  { prefix: "/", anyOf: ["finance.view"] },
];

/** Permissions required for a path, or `null` when the path is unguarded. */
export function permissionsForPath(pathname: string): Permission[] | null {
  const match = ROUTE_PERMISSIONS.filter(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  )
    // Longest prefix wins so "/" never shadows a more specific rule.
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return match ? match.anyOf : null;
}

export function canAccessPath(role: Role, pathname: string): boolean {
  const required = permissionsForPath(pathname);
  if (!required) return true;
  return roleCanAny(role, required);
}

/** First landing page this role is actually allowed to see. */
export function landingFor(role: Role): string {
  const preferred = ROLE_META[role].landing;
  if (canAccessPath(role, preferred)) return preferred;

  const fallback = ROUTE_PERMISSIONS.find((entry) => roleCanAny(role, entry.anyOf));
  return fallback?.prefix ?? "/denied";
}
