import "server-only";
import { cache } from "react";
import { prisma, toNumber } from "@/lib/db/client";
import type {
  Appointment,
  AppointmentStatus,
  Client,
  Expense,
  ExpenseCategory,
  Invoice,
  InvoiceLine,
  Payment,
  Product,
  PromoCode,
  Service,
  ServiceCategory,
  ServicePackage,
  Staff,
  StaffRole,
  StockMovement,
} from "@/lib/types";

/**
 * Read layer.
 *
 * Every function returns the domain types in `src/lib/types.ts`, so the whole
 * component tree is unchanged from the prototype — only the source of the
 * data moved. Enum values are translated at this boundary (the database uses
 * SCREAMING_SNAKE, the UI uses human labels like "Hair" and "Senior
 * Stylist"), which keeps the translation in exactly one place.
 *
 * Reads are wrapped in React's `cache()` so several components in one render
 * pass share a single query rather than each issuing their own.
 */

/* ---------------------------------------------------------- Enum mapping */

const SERVICE_CATEGORY: Record<string, ServiceCategory> = {
  HAIR: "Hair",
  SKIN: "Skin",
  MAKEUP: "Makeup",
  NAILS: "Nails",
  SPA: "Spa",
};

export const SERVICE_CATEGORY_TO_DB: Record<ServiceCategory, "HAIR" | "SKIN" | "MAKEUP" | "NAILS" | "SPA"> = {
  Hair: "HAIR",
  Skin: "SKIN",
  Makeup: "MAKEUP",
  Nails: "NAILS",
  Spa: "SPA",
};

const STAFF_ROLE: Record<string, StaffRole> = {
  OWNER: "Owner",
  SENIOR_STYLIST: "Senior Stylist",
  STYLIST: "Stylist",
  BEAUTICIAN: "Beautician",
  NAIL_TECHNICIAN: "Nail Technician",
  MAKEUP_ARTIST: "Makeup Artist",
  RECEPTIONIST: "Receptionist",
};

export const STAFF_ROLE_TO_DB = Object.fromEntries(
  Object.entries(STAFF_ROLE).map(([db, label]) => [label, db]),
) as Record<StaffRole, string>;

const EXPENSE_CATEGORY: Record<string, ExpenseCategory> = {
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  UTILITIES: "Utilities",
  PRODUCT_PURCHASE: "Product Purchase",
  STAFF_SALARY: "Staff Salary",
  REFRESHMENTS: "Refreshments",
  MARKETING: "Marketing",
  MAINTENANCE: "Maintenance",
  MISCELLANEOUS: "Miscellaneous",
};

export const EXPENSE_CATEGORY_TO_DB = Object.fromEntries(
  Object.entries(EXPENSE_CATEGORY).map(([db, label]) => [label, db]),
) as Record<ExpenseCategory, string>;

/* ------------------------------------------------------------- Catalogue */

export const getStaff = cache(async (): Promise<Staff[]> => {
  const rows = await prisma.staff.findMany({ orderBy: { name: "asc" } });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    role: STAFF_ROLE[s.role] ?? "Stylist",
    phone: s.phone,
    email: s.email ?? undefined,
    commissionRate: toNumber(s.commissionRate),
    specialties: s.specialties.map((c) => SERVICE_CATEGORY[c]).filter(Boolean),
    monthlySalary: toNumber(s.monthlySalary),
    active: s.active,
    joinedAt: s.joinedAt.toISOString(),
  }));
});

export const getClients = cache(async (): Promise<Client[]> => {
  const rows = await prisma.client.findMany({ orderBy: { name: "asc" } });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email ?? undefined,
    gender: (c.gender as Client["gender"]) ?? undefined,
    notes: c.notes ?? undefined,
    tags: c.tags,
    createdAt: c.createdAt.toISOString(),
  }));
});

/**
 * Archived services are returned, not filtered — the one deliberate exception
 * to the rule `getProducts` and `getPackages` follow.
 *
 * A service id is a live reference: `appointment_services` rows point at it,
 * and the analytics in `lib/data/analytics.ts` resolve an invoice line's
 * category by looking its `refId` up in this list. Filtering archived rows out
 * here would blank the service names on every past booking and quietly drop
 * that revenue out of the category breakdown. So the flag travels with the
 * row, and the catalogue surfaces — POS, booking menu, deal builder, this
 * page's table — exclude it.
 */
export const getServices = cache(async (): Promise<Service[]> => {
  const rows = await prisma.service.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    category: SERVICE_CATEGORY[s.category] ?? "Hair",
    durationMin: s.durationMin,
    price: toNumber(s.price),
    description: s.description ?? undefined,
    active: s.active,
    archived: s.archivedAt !== null,
  }));
});

/**
 * Archived rows are excluded here rather than at each call site.
 *
 * A soft-deleted package must disappear from the POS catalogue, the deals
 * grid and the command palette alike; filtering once at the read boundary is
 * what makes that true everywhere by construction, instead of depending on
 * six components each remembering to check. The row itself stays put so
 * `package_services` and any invoice line pointing at it survive.
 */
export const getPackages = cache(async (): Promise<ServicePackage[]> => {
  const rows = await prisma.servicePackage.findMany({
    where: { archivedAt: null },
    include: { services: { select: { serviceId: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? undefined,
    serviceIds: p.services.map((s) => s.serviceId),
    price: toNumber(p.price),
    active: p.active,
  }));
});

/** Archived products are filtered here — see `getPackages` for why. */
export const getProducts = cache(async (): Promise<Product[]> => {
  const rows = await prisma.product.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    type: p.type,
    brand: p.brand,
    unit: p.unit,
    costPrice: toNumber(p.costPrice),
    retailPrice: toNumber(p.retailPrice),
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    supplier: p.supplier ?? undefined,
  }));
});

export const getPromoCodes = cache(async (): Promise<PromoCode[]> => {
  const rows = await prisma.promoCode.findMany();
  return rows.map((p) => ({
    code: p.code,
    label: p.label,
    kind: p.kind === "FLAT" ? "FLAT" : "PERCENT",
    value: toNumber(p.value),
    minSpend: toNumber(p.minSpend),
    active: p.active,
  }));
});

/* ---------------------------------------------------------- Appointments */

/**
 * Bookings within a window. The calendar never needs all history, and an
 * unbounded query here is the first thing that would fall over once the salon
 * has a year of data.
 */
export const getAppointments = cache(
  async (from: Date, to: Date, staffId?: string): Promise<Appointment[]> => {
    const rows = await prisma.appointment.findMany({
      where: {
        start: { gte: from, lte: to },
        ...(staffId ? { staffId } : {}),
      },
      include: { services: { select: { serviceId: true } } },
      orderBy: { start: "asc" },
    });

    return rows.map((a) => ({
      id: a.id,
      clientId: a.clientId,
      staffId: a.staffId,
      serviceIds: a.services.map((s) => s.serviceId),
      start: a.start.toISOString(),
      durationMin: a.durationMin,
      status: a.status as AppointmentStatus,
      notes: a.notes ?? undefined,
      createdAt: a.createdAt.toISOString(),
    }));
  },
);

/* --------------------------------------------------------------- Billing */

function mapInvoice(row: {
  id: string;
  number: string;
  clientId: string;
  appointmentId: string | null;
  discountKind: string;
  discountValue: unknown;
  discountCode: string | null;
  taxRate: unknown;
  status: string;
  note: string | null;
  createdByStaffId: string;
  createdAt: Date;
  lines: Array<{
    id: string;
    kind: string;
    refId: string;
    name: string;
    unitPrice: unknown;
    qty: number;
    staffId: string | null;
    commissionRate: unknown;
    lineDiscount: unknown;
  }>;
  payments: Array<{
    id: string;
    mode: string;
    amount: unknown;
    reference: string | null;
    at: Date;
  }>;
}): Invoice {
  return {
    id: row.id,
    number: row.number,
    clientId: row.clientId,
    appointmentId: row.appointmentId ?? undefined,
    lines: row.lines.map(
      (l): InvoiceLine => ({
        id: l.id,
        kind: l.kind as InvoiceLine["kind"],
        refId: l.refId,
        name: l.name,
        unitPrice: toNumber(l.unitPrice as never),
        qty: l.qty,
        staffId: l.staffId ?? undefined,
        commissionRate: toNumber(l.commissionRate as never),
        lineDiscount: toNumber(l.lineDiscount as never),
      }),
    ),
    discount: {
      kind: row.discountKind as Invoice["discount"]["kind"],
      value: toNumber(row.discountValue as never),
      code: row.discountCode ?? undefined,
    },
    payments: row.payments.map(
      (p): Payment => ({
        id: p.id,
        mode: p.mode as Payment["mode"],
        amount: toNumber(p.amount as never),
        reference: p.reference ?? undefined,
        at: p.at.toISOString(),
      }),
    ),
    taxRate: toNumber(row.taxRate as never),
    status: row.status as Invoice["status"],
    createdAt: row.createdAt.toISOString(),
    createdByStaffId: row.createdByStaffId,
    note: row.note ?? undefined,
  };
}

export const getInvoices = cache(async (from: Date, to: Date, limit = 500): Promise<Invoice[]> => {
  const rows = await prisma.invoice.findMany({
    where: { createdAt: { gte: from, lte: to } },
    include: { lines: true, payments: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapInvoice);
});

/** Every invoice still owed on, regardless of age — receivables don't expire. */
export const getOutstandingInvoices = cache(async (): Promise<Invoice[]> => {
  const rows = await prisma.invoice.findMany({
    where: { status: { in: ["UNPAID", "PARTIAL"] } },
    include: { lines: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapInvoice);
});

export const getInvoicesForClient = cache(async (clientId: string): Promise<Invoice[]> => {
  const rows = await prisma.invoice.findMany({
    where: { clientId },
    include: { lines: true, payments: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapInvoice);
});

/* -------------------------------------------------------------- Expenses */

export const getExpenses = cache(async (from: Date, to: Date): Promise<Expense[]> => {
  const rows = await prisma.expense.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "desc" },
  });
  return rows.map((e) => ({
    id: e.id,
    category: EXPENSE_CATEGORY[e.category] ?? "Miscellaneous",
    amount: toNumber(e.amount),
    date: e.date.toISOString(),
    vendor: e.vendor ?? undefined,
    note: e.note ?? undefined,
    paymentMode: e.paymentMode as Expense["paymentMode"],
    attachment: e.attachment ?? undefined,
    recordedByStaffId: e.recordedByStaffId,
  }));
});

/* --------------------------------------------------------------- Stock */

export const getStockMovements = cache(async (limit = 120): Promise<StockMovement[]> => {
  const rows = await prisma.stockMovement.findMany({
    orderBy: { at: "desc" },
    take: limit,
  });
  return rows.map((m) => ({
    id: m.id,
    productId: m.productId,
    type: m.type,
    qty: m.qty,
    note: m.note ?? undefined,
    staffId: m.staffId ?? undefined,
    at: m.at.toISOString(),
  }));
});

/* ------------------------------------------------------- Invoice numbers */

/** Next sequence number for the current year, derived from what exists. */
export async function nextInvoiceNumber(): Promise<{ sequence: number; year: number }> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
  });
  return { sequence: count + 1, year };
}
