"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  EXPENSE_CATEGORY_TO_DB,
  SERVICE_CATEGORY_TO_DB,
  STAFF_ROLE_TO_DB,
} from "@/lib/db/queries";
import { roleCan } from "@/lib/auth/permissions";
import {
  diff,
  failure,
  recordAudit,
  requirePermission,
  requireSession,
  type ActionResult,
} from "@/lib/actions/guard";
import type { ExpenseCategory } from "@/lib/types";

/* ---------------------------------------------------------------- Clients */

const ClientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional(),
  gender: z.enum(["Female", "Male", "Other"]).optional(),
});

export async function createClientAction(
  input: z.infer<typeof ClientSchema>,
): Promise<ActionResult<{ id: string; name: string; phone: string }>> {
  try {
    await requirePermission("clients.manage");
    const data = ClientSchema.parse(input);

    // `phone` is the natural key — a salon identifies a client by it, and the
    // unique index would otherwise surface as an opaque 500.
    const existing = await prisma.client.findUnique({ where: { phone: data.phone } });
    if (existing) {
      return { ok: false, error: `${existing.name} is already registered on that number.` };
    }

    const client = await prisma.client.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        notes: data.notes || null,
        gender: data.gender ?? "Female",
        tags: ["New"],
      },
      select: { id: true, name: true, phone: true },
    });

    revalidatePath("/clients");
    return { ok: true, data: client };
  } catch (error) {
    return failure(error);
  }
}

export async function updateClientNotesAction(
  clientId: string,
  notes: string,
): Promise<ActionResult> {
  try {
    await requirePermission("clients.manage");
    await prisma.client.update({
      where: { id: clientId },
      data: { notes: notes.trim() || null },
    });
    revalidatePath("/clients");
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error);
  }
}

/**
 * The client's own details. Notes keep their own action deliberately — they
 * are saved constantly from the detail dialog during a visit, and routing them
 * through here would audit-log stylist shorthand over every real change.
 */
export async function updateClientAction(
  clientId: string,
  input: z.infer<typeof ClientSchema>,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const session = await requirePermission("clients.manage");
    const data = ClientSchema.parse(input);

    const existing = await prisma.client.findUnique({ where: { id: clientId } });
    if (!existing || existing.archivedAt) {
      return { ok: false, error: "That client no longer exists — they may have been removed." };
    }

    // Same natural key as create, minus themselves. Without the exclusion,
    // saving a client whose number has not changed reports them as clashing
    // with their own record.
    if (data.phone !== existing.phone) {
      const clash = await prisma.client.findUnique({
        where: { phone: data.phone },
        select: { name: true },
      });
      if (clash) {
        return { ok: false, error: `${clash.name} is already registered on that number.` };
      }
    }

    const changes = diff(
      {
        name: existing.name,
        phone: existing.phone,
        email: existing.email ?? undefined,
        gender: existing.gender ?? undefined,
      },
      {
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        gender: data.gender ?? undefined,
      },
    );

    const client = await prisma.client.update({
      where: { id: clientId },
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        ...(data.gender ? { gender: data.gender } : {}),
      },
      select: { id: true, name: true },
    });

    if (Object.keys(changes).length > 0) {
      await recordAudit("CLIENT_UPDATED", session, {
        entityType: "Client",
        entityId: clientId,
        metadata: { name: data.name, changes },
      });
    }

    revalidatePath("/clients");
    revalidatePath("/appointments");
    revalidatePath("/invoices");
    return { ok: true, data: client };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Soft delete, with the one dependency check worth making before the click.
 *
 * Archiving sidesteps both foreign keys — the RESTRICT on invoices and the
 * CASCADE on appointments — which is exactly why an upcoming booking has to be
 * refused deliberately here. Nothing else stops a client vanishing off the
 * client list while still holding a chair on Thursday.
 *
 * An outstanding balance is deliberately NOT a blocker: money owed by someone
 * who has stopped coming is the ordinary reason to retire a record, and the
 * invoice keeps resolving their name either way.
 */
export async function archiveClientAction(
  clientId: string,
): Promise<ActionResult<{ name: string }>> {
  try {
    const session = await requirePermission("clients.manage");

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true, phone: true, archivedAt: true },
    });
    if (!client) return { ok: false, error: "That client no longer exists." };
    // Idempotent, so a double-click or a second manager on the same record is
    // a no-op rather than an error neither of them can act on.
    if (client.archivedAt) return { ok: true, data: { name: client.name } };

    const upcoming = await prisma.appointment.count({
      where: {
        clientId,
        start: { gte: new Date() },
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
    });

    if (upcoming > 0) {
      return {
        ok: false,
        error:
          upcoming === 1
            ? "This client has an upcoming booking. Complete or cancel it first."
            : `This client has ${upcoming} upcoming bookings. Complete or cancel them first.`,
      };
    }

    await prisma.client.update({
      where: { id: clientId },
      data: { archivedAt: new Date() },
    });

    await recordAudit("CLIENT_ARCHIVED", session, {
      entityType: "Client",
      entityId: clientId,
      metadata: { name: client.name, phone: client.phone },
    });

    revalidatePath("/clients");
    revalidatePath("/appointments");
    return { ok: true, data: { name: client.name } };
  } catch (error) {
    return failure(error);
  }
}

/* ----------------------------------------------------------- Appointments */

const BookingSchema = z.object({
  clientId: z.string().min(1),
  staffId: z.string().min(1),
  serviceIds: z.array(z.string().min(1)).min(1).max(12),
  start: z.string().datetime(),
  notes: z.string().trim().max(500).optional(),
});

export async function createAppointmentAction(
  input: z.infer<typeof BookingSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("appointments.manage");
    const data = BookingSchema.parse(input);

    // Duration comes from the catalogue, not the client, so the calendar
    // block always matches the services actually booked.
    const services = await prisma.service.findMany({
      where: { id: { in: data.serviceIds } },
      select: { id: true, durationMin: true },
    });
    if (services.length !== data.serviceIds.length) {
      return { ok: false, error: "One of those services no longer exists." };
    }
    const durationMin = services.reduce((sum, s) => sum + s.durationMin, 0);

    const appointment = await prisma.appointment.create({
      data: {
        clientId: data.clientId,
        staffId: data.staffId,
        start: new Date(data.start),
        durationMin,
        notes: data.notes || null,
        services: { create: data.serviceIds.map((serviceId) => ({ serviceId })) },
      },
      select: { id: true },
    });

    revalidatePath("/appointments");
    revalidatePath("/my-schedule");
    return { ok: true, data: appointment };
  } catch (error) {
    return failure(error);
  }
}

export async function updateAppointmentAction(
  appointmentId: string,
  input: z.infer<typeof BookingSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("appointments.manage");
    const data = BookingSchema.parse(input);

    const services = await prisma.service.findMany({
      where: { id: { in: data.serviceIds } },
      select: { id: true, durationMin: true },
    });
    const durationMin = services.reduce((sum, s) => sum + s.durationMin, 0);

    await prisma.$transaction([
      prisma.appointmentService.deleteMany({ where: { appointmentId } }),
      prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          clientId: data.clientId,
          staffId: data.staffId,
          start: new Date(data.start),
          durationMin,
          notes: data.notes || null,
          services: { create: data.serviceIds.map((serviceId) => ({ serviceId })) },
        },
      }),
    ]);

    revalidatePath("/appointments");
    revalidatePath("/my-schedule");
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error);
  }
}

const STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;

/**
 * Status transitions.
 *
 * A beautician holds only `appointments.status.own`, so this additionally
 * verifies the booking is theirs — otherwise one stylist could close out
 * another's chair.
 */
export async function setAppointmentStatusAction(
  appointmentId: string,
  status: (typeof STATUSES)[number],
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (!STATUSES.includes(status)) return { ok: false, error: "Unknown status." };

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { staffId: true },
    });
    if (!appointment) return { ok: false, error: "That booking no longer exists." };

    const managesAll = roleCan(session.role, "appointments.manage");
    const ownsIt =
      roleCan(session.role, "appointments.status.own") &&
      Boolean(session.staffId) &&
      appointment.staffId === session.staffId;

    if (!managesAll && !ownsIt) {
      await recordAudit("ACCESS_DENIED", session, {
        entityType: "Appointment",
        entityId: appointmentId,
      });
      return { ok: false, error: "You can only update your own appointments." };
    }

    await prisma.appointment.update({ where: { id: appointmentId }, data: { status } });

    revalidatePath("/appointments");
    revalidatePath("/my-schedule");
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error);
  }
}

/* --------------------------------------------------------------- Expenses */

const ExpenseSchema = z.object({
  category: z.string().min(1),
  amount: z.number().positive().max(100_000_000),
  date: z.string(),
  vendor: z.string().trim().max(160).optional(),
  note: z.string().trim().max(500).optional(),
  paymentMode: z.enum(["CASH", "CARD", "WALLET", "TRANSFER"]),
  attachment: z.string().trim().max(260).optional(),
});

export async function createExpenseAction(
  input: z.infer<typeof ExpenseSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission("expenses.manage");
    const data = ExpenseSchema.parse(input);

    const dbCategory = EXPENSE_CATEGORY_TO_DB[data.category as ExpenseCategory];
    if (!dbCategory) return { ok: false, error: "Unknown expense category." };

    const expense = await prisma.expense.create({
      data: {
        category: dbCategory as never,
        amount: data.amount,
        date: new Date(data.date),
        vendor: data.vendor || null,
        note: data.note || null,
        paymentMode: data.paymentMode,
        attachment: data.attachment || null,
        recordedByStaffId: session.staffId ?? "",
      },
      select: { id: true },
    });

    revalidatePath("/expenses");
    revalidatePath("/");
    return { ok: true, data: expense };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteExpenseAction(expenseId: string): Promise<ActionResult> {
  try {
    const session = await requirePermission("expenses.manage");

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: { amount: true, category: true },
    });

    await prisma.expense.delete({ where: { id: expenseId } });
    await recordAudit("EXPENSE_DELETED", session, {
      entityType: "Expense",
      entityId: expenseId,
      metadata: { amount: Number(expense?.amount ?? 0), category: expense?.category },
    });

    revalidatePath("/expenses");
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------- Inventory */

const StockSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(["STOCK_IN", "SERVICE_USAGE", "RETAIL_SALE", "DAMAGED", "EXPIRED", "ADJUSTMENT"]),
  qty: z.number().int().positive().max(100_000),
  note: z.string().trim().max(300).optional(),
});

export async function adjustStockAction(
  input: z.infer<typeof StockSchema>,
): Promise<ActionResult<{ stock: number }>> {
  try {
    const session = await requirePermission("inventory.manage");
    const data = StockSchema.parse(input);

    // Direction is derived from the movement type on the server; the client
    // only ever sends an unsigned quantity.
    const signed =
      data.type === "STOCK_IN" || data.type === "ADJUSTMENT" ? data.qty : -data.qty;

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: data.productId },
        select: { stock: true, name: true },
      });
      if (!product) throw new Error("Product not found");

      // Clamp at zero rather than allowing negative stock, which would make
      // the valuation report nonsense.
      const next = Math.max(0, product.stock + signed);

      await tx.product.update({ where: { id: data.productId }, data: { stock: next } });
      await tx.stockMovement.create({
        data: {
          productId: data.productId,
          type: data.type,
          qty: signed,
          note: data.note || null,
          staffId: session.staffId,
        },
      });

      return { stock: next, name: product.name };
    });

    await recordAudit("STOCK_ADJUSTED", session, {
      entityType: "Product",
      entityId: data.productId,
      metadata: { type: data.type, qty: signed, resulting: result.stock },
    });

    revalidatePath("/inventory");
    return { ok: true, data: { stock: result.stock } };
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------------------------------------------ Staff */

const StaffSchema = z.object({
  name: z.string().trim().min(2, "must be at least 2 characters").max(120),
  role: z.enum([
    "Owner",
    "Senior Stylist",
    "Stylist",
    "Beautician",
    "Nail Technician",
    "Makeup Artist",
    "Receptionist",
  ]),
  phone: z.string().trim().min(6, "must be at least 6 digits").max(30),
  email: z.string().trim().email("is not a valid address").max(160).optional().or(z.literal("")),
  // Stored as a fraction, entered as a percentage. Decimal(4,3) would happily
  // hold up to 9.999 — a 999% commission — so this bound is the business rule,
  // not the column's. Postgres will not catch a misplaced decimal point here.
  commissionRate: z.number().min(0, "cannot be negative").max(0.999, "cannot reach 100%"),
  specialties: z.array(z.enum(["Hair", "Skin", "Makeup", "Nails", "Spa"])).max(5),
  monthlySalary: z.number().nonnegative("cannot be negative").max(100_000_000),
  active: z.boolean(),
});

export async function createStaffAction(
  input: z.infer<typeof StaffSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requirePermission("staff.manage");
    const data = StaffSchema.parse(input);

    const dbRole = STAFF_ROLE_TO_DB[data.role];
    if (!dbRole) return { ok: false, error: "Unknown staff role." };

    // `email` carries a unique index, but only when present — checking first
    // names the colleague already holding it instead of failing on the index.
    if (data.email) {
      const clash = await prisma.staff.findUnique({
        where: { email: data.email },
        select: { name: true },
      });
      if (clash) {
        return { ok: false, error: `${clash.name} already uses that email address.` };
      }
    }

    const member = await prisma.staff.create({
      data: {
        name: data.name,
        role: dbRole as never,
        phone: data.phone,
        email: data.email || null,
        commissionRate: data.commissionRate,
        specialties: data.specialties.map(
          (c) => SERVICE_CATEGORY_TO_DB[c],
        ) as never,
        monthlySalary: data.monthlySalary,
        active: data.active,
      },
      select: { id: true },
    });

    await recordAudit("ROLE_CHANGED", session, {
      entityType: "Staff",
      entityId: member.id,
      metadata: { created: true, name: data.name, role: data.role },
    });

    revalidatePath("/staff");
    revalidatePath("/appointments");
    return { ok: true, data: member };
  } catch (error) {
    return failure(error);
  }
}

export async function updateStaffAction(
  staffId: string,
  input: z.infer<typeof StaffSchema>,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const session = await requirePermission("staff.manage");
    const data = StaffSchema.parse(input);

    const dbRole = STAFF_ROLE_TO_DB[data.role];
    if (!dbRole) return { ok: false, error: "Unknown staff role." };

    const existing = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!existing) {
      return { ok: false, error: "That team member no longer exists." };
    }

    // Same rule as create, minus themselves — otherwise saving a member's own
    // unchanged email would report them as clashing with themselves.
    if (data.email) {
      const clash = await prisma.staff.findFirst({
        where: { id: { not: staffId }, email: data.email },
        select: { name: true },
      });
      if (clash) {
        return { ok: false, error: `${clash.name} already uses that email address.` };
      }
    }

    const specialties = data.specialties.map((c) => SERVICE_CATEGORY_TO_DB[c]);

    const changes = diff(
      {
        name: existing.name,
        role: existing.role,
        phone: existing.phone,
        email: existing.email ?? undefined,
        commissionRate: Number(existing.commissionRate),
        monthlySalary: Number(existing.monthlySalary),
        active: existing.active,
        // Compared as a sorted string for the same reason a package's contents
        // are: the column is a set, and reordering it is not an edit.
        specialties: [...existing.specialties].sort().join(","),
      },
      {
        name: data.name,
        role: dbRole,
        phone: data.phone,
        email: data.email || undefined,
        commissionRate: data.commissionRate,
        monthlySalary: data.monthlySalary,
        active: data.active,
        specialties: [...specialties].sort().join(","),
      },
    );

    const member = await prisma.staff.update({
      where: { id: staffId },
      data: {
        name: data.name,
        role: dbRole as never,
        phone: data.phone,
        email: data.email || null,
        commissionRate: data.commissionRate,
        specialties: specialties as never,
        monthlySalary: data.monthlySalary,
        active: data.active,
      },
      select: { id: true, name: true },
    });

    // Repricing commission does not rewrite history: `invoice_lines` snapshot
    // the rate they were sold at, and the payroll report sums those snapshots.
    // A new rate applies to what is sold next.
    if (Object.keys(changes).length > 0) {
      await recordAudit("ROLE_CHANGED", session, {
        entityType: "Staff",
        entityId: staffId,
        metadata: { name: data.name, role: data.role, changes },
      });
    }

    revalidatePath("/staff");
    revalidatePath("/appointments");
    revalidatePath("/my-commissions");
    return { ok: true, data: member };
  } catch (error) {
    return failure(error);
  }
}
