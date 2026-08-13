import { computeTotals, lineCommission, lineNet } from "@/lib/billing";
import { MONTHS, dateKey, eachDay, isSameDay, startOfDay, startOfMonth } from "@/lib/date";
import { round2 } from "@/lib/utils";
import type {
  Appointment,
  Expense,
  Invoice,
  Product,
  RevenuePoint,
  Service,
  ServiceCategory,
  Staff,
  StaffPerformance,
} from "@/lib/types";

export interface AnalyticsInput {
  invoices: Invoice[];
  expenses: Expense[];
  appointments: Appointment[];
  services: Service[];
  staff: Staff[];
  products: Product[];
}

const inRange = (iso: string, from: Date, to: Date) => {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
};

/** Cash actually collected — the number the owner reconciles the till against. */
export function collected(invoice: Invoice) {
  if (invoice.status === "VOID") return 0;
  return round2(invoice.payments.reduce((sum, p) => sum + p.amount, 0));
}

/** Full billed value including anything still outstanding. */
export function billed(invoice: Invoice) {
  if (invoice.status === "VOID") return 0;
  return computeTotals(invoice.lines, invoice.discount, invoice.taxRate, invoice.payments).total;
}

export function outstanding(invoice: Invoice) {
  if (invoice.status === "VOID") return 0;
  return round2(Math.max(0, billed(invoice) - collected(invoice)));
}

/** Splits an invoice into service vs. retail revenue, net of all discounts. */
export function revenueSplit(invoice: Invoice) {
  if (invoice.status === "VOID") return { services: 0, retail: 0 };
  const totals = computeTotals(invoice.lines, invoice.discount, invoice.taxRate, invoice.payments);
  const { netSubtotal, invoiceDiscount } = totals;
  if (netSubtotal <= 0) return { services: 0, retail: 0 };

  let services = 0;
  let retail = 0;
  for (const line of invoice.lines) {
    const net = lineNet(line);
    // Absorb the invoice-level discount proportionally so the two buckets
    // always add back up to the taxable base.
    const after = net - invoiceDiscount * (net / netSubtotal);
    if (line.kind === "PRODUCT") retail += after;
    else services += after;
  }
  return { services: round2(services), retail: round2(retail) };
}

/* ------------------------------------------------------------------ KPIs */

export interface PeriodSummary {
  revenue: number;
  serviceRevenue: number;
  retailRevenue: number;
  expenses: number;
  netProfit: number;
  invoiceCount: number;
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  outstandingTotal: number;
  outstandingCount: number;
  averageTicket: number;
  uniqueClients: number;
  commissionTotal: number;
}

export function summarize(
  { invoices, expenses, appointments }: Omit<AnalyticsInput, "services" | "staff" | "products">,
  from: Date,
  to: Date,
): PeriodSummary {
  const periodInvoices = invoices.filter(
    (i) => i.status !== "VOID" && inRange(i.createdAt, from, to),
  );
  const periodExpenses = expenses.filter((e) => inRange(e.date, from, to));
  const periodAppointments = appointments.filter((a) => inRange(a.start, from, to));

  let serviceRevenue = 0;
  let retailRevenue = 0;
  let commissionTotal = 0;
  const clientIds = new Set<string>();

  for (const invoice of periodInvoices) {
    const split = revenueSplit(invoice);
    serviceRevenue += split.services;
    retailRevenue += split.retail;
    clientIds.add(invoice.clientId);

    const totals = computeTotals(invoice.lines, invoice.discount, invoice.taxRate, invoice.payments);
    commissionTotal += totals.commissionTotal;
  }

  const revenue = round2(serviceRevenue + retailRevenue);
  const expenseTotal = round2(periodExpenses.reduce((sum, e) => sum + e.amount, 0));

  // Outstanding is deliberately measured across ALL invoices, not just the
  // period — an unpaid bill from last month is still money owed today.
  const unpaid = invoices.filter((i) => i.status === "PARTIAL" || i.status === "UNPAID");

  return {
    revenue,
    serviceRevenue: round2(serviceRevenue),
    retailRevenue: round2(retailRevenue),
    expenses: expenseTotal,
    netProfit: round2(revenue - expenseTotal),
    invoiceCount: periodInvoices.length,
    appointmentCount: periodAppointments.length,
    completedCount: periodAppointments.filter((a) => a.status === "COMPLETED").length,
    cancelledCount: periodAppointments.filter((a) => a.status === "CANCELLED").length,
    noShowCount: periodAppointments.filter((a) => a.status === "NO_SHOW").length,
    outstandingTotal: round2(unpaid.reduce((sum, i) => sum + outstanding(i), 0)),
    outstandingCount: unpaid.length,
    averageTicket: periodInvoices.length ? round2(revenue / periodInvoices.length) : 0,
    uniqueClients: clientIds.size,
    commissionTotal: round2(commissionTotal),
  };
}

/* ---------------------------------------------------------- Time series */

export function dailySeries(
  invoices: Invoice[],
  expenses: Expense[],
  from: Date,
  to: Date,
): RevenuePoint[] {
  const days = eachDay(from, to);
  const buckets = new Map<string, RevenuePoint>(
    days.map((d) => [
      dateKey(d),
      { label: `${d.getDate()} ${MONTHS[d.getMonth()]}`, services: 0, retail: 0, expenses: 0 },
    ]),
  );

  for (const invoice of invoices) {
    if (invoice.status === "VOID") continue;
    const key = dateKey(invoice.createdAt);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const split = revenueSplit(invoice);
    bucket.services += split.services;
    bucket.retail += split.retail;
  }

  for (const expense of expenses) {
    const bucket = buckets.get(dateKey(expense.date));
    if (bucket) bucket.expenses += expense.amount;
  }

  return days.map((d) => {
    const b = buckets.get(dateKey(d))!;
    return {
      label: b.label,
      services: round2(b.services),
      retail: round2(b.retail),
      expenses: round2(b.expenses),
    };
  });
}

export function monthlySeries(
  invoices: Invoice[],
  expenses: Expense[],
  months: number,
  anchor: Date,
): RevenuePoint[] {
  const points: RevenuePoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() - i + 1, 0, 23, 59, 59, 999);

    let services = 0;
    let retail = 0;
    for (const invoice of invoices) {
      if (invoice.status === "VOID") continue;
      if (!inRange(invoice.createdAt, start, end)) continue;
      const split = revenueSplit(invoice);
      services += split.services;
      retail += split.retail;
    }
    const spend = expenses
      .filter((e) => inRange(e.date, start, end))
      .reduce((sum, e) => sum + e.amount, 0);

    points.push({
      label: `${MONTHS[start.getMonth()]} ${start.getFullYear().toString().slice(2)}`,
      services: round2(services),
      retail: round2(retail),
      expenses: round2(spend),
    });
  }
  return points;
}

/* ------------------------------------------------------- Category splits */

export function revenueByCategory(
  invoices: Invoice[],
  services: Service[],
  from: Date,
  to: Date,
): Array<{ category: ServiceCategory | "Retail"; revenue: number }> {
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const totals = new Map<string, number>();

  for (const invoice of invoices) {
    if (invoice.status === "VOID" || !inRange(invoice.createdAt, from, to)) continue;
    const { netSubtotal, invoiceDiscount } = computeTotals(
      invoice.lines,
      invoice.discount,
      invoice.taxRate,
      invoice.payments,
    );
    if (netSubtotal <= 0) continue;

    for (const line of invoice.lines) {
      const net = lineNet(line);
      const after = net - invoiceDiscount * (net / netSubtotal);
      const key =
        line.kind === "PRODUCT"
          ? "Retail"
          : line.kind === "PACKAGE"
            ? "Makeup" // packages are bridal-led; attribute to their headline category
            : (serviceById.get(line.refId)?.category ?? "Hair");
      totals.set(key, (totals.get(key) ?? 0) + after);
    }
  }

  return Array.from(totals.entries())
    .map(([category, revenue]) => ({
      category: category as ServiceCategory | "Retail",
      revenue: round2(revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function topServices(
  invoices: Invoice[],
  services: Service[],
  from: Date,
  to: Date,
  limit = 6,
) {
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const stats = new Map<string, { name: string; count: number; revenue: number }>();

  for (const invoice of invoices) {
    if (invoice.status === "VOID" || !inRange(invoice.createdAt, from, to)) continue;
    for (const line of invoice.lines) {
      if (line.kind !== "SERVICE") continue;
      const svc = serviceById.get(line.refId);
      if (!svc) continue;
      const entry = stats.get(svc.id) ?? { name: svc.name, count: 0, revenue: 0 };
      entry.count += line.qty;
      entry.revenue += lineNet(line);
      stats.set(svc.id, entry);
    }
  }

  return Array.from(stats.values())
    .map((s) => ({ ...s, revenue: round2(s.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/* -------------------------------------------------- Staff & commissions */

export function staffPerformance(
  { invoices, appointments, staff }: Pick<AnalyticsInput, "invoices" | "appointments" | "staff">,
  from: Date,
  to: Date,
): StaffPerformance[] {
  const rows = new Map<string, StaffPerformance>(
    staff.map((s) => [
      s.id,
      {
        staff: s,
        serviceRevenue: 0,
        retailRevenue: 0,
        commission: 0,
        invoiceCount: 0,
        clientCount: 0,
        appointmentsCompleted: 0,
      },
    ]),
  );
  const clientsSeen = new Map<string, Set<string>>();
  const invoicesSeen = new Map<string, Set<string>>();

  for (const invoice of invoices) {
    if (invoice.status === "VOID" || !inRange(invoice.createdAt, from, to)) continue;
    const { netSubtotal, invoiceDiscount } = computeTotals(
      invoice.lines,
      invoice.discount,
      invoice.taxRate,
      invoice.payments,
    );
    if (netSubtotal <= 0) continue;

    for (const line of invoice.lines) {
      if (!line.staffId) continue;
      const row = rows.get(line.staffId);
      if (!row) continue;

      const net = lineNet(line);
      const after = net - invoiceDiscount * (net / netSubtotal);
      if (line.kind === "PRODUCT") row.retailRevenue += after;
      else row.serviceRevenue += after;
      row.commission += lineCommission(line, netSubtotal, invoiceDiscount);

      if (!clientsSeen.has(line.staffId)) clientsSeen.set(line.staffId, new Set());
      clientsSeen.get(line.staffId)!.add(invoice.clientId);
      if (!invoicesSeen.has(line.staffId)) invoicesSeen.set(line.staffId, new Set());
      invoicesSeen.get(line.staffId)!.add(invoice.id);
    }
  }

  for (const appointment of appointments) {
    if (appointment.status !== "COMPLETED" || !inRange(appointment.start, from, to)) continue;
    const row = rows.get(appointment.staffId);
    if (row) row.appointmentsCompleted += 1;
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      serviceRevenue: round2(row.serviceRevenue),
      retailRevenue: round2(row.retailRevenue),
      commission: round2(row.commission),
      clientCount: clientsSeen.get(row.staff.id)?.size ?? 0,
      invoiceCount: invoicesSeen.get(row.staff.id)?.size ?? 0,
    }))
    .filter((row) => row.serviceRevenue + row.retailRevenue > 0 || row.appointmentsCompleted > 0)
    .sort((a, b) => b.serviceRevenue + b.retailRevenue - (a.serviceRevenue + a.retailRevenue));
}

/* -------------------------------------------------------------- Clients */

export function clientStats(invoices: Invoice[], appointments: Appointment[], clientId: string) {
  const own = invoices.filter((i) => i.clientId === clientId && i.status !== "VOID");
  const visits = appointments.filter((a) => a.clientId === clientId);
  const totalSpend = round2(own.reduce((sum, i) => sum + collected(i), 0));
  const lastVisit = visits
    .filter((v) => v.status === "COMPLETED")
    .sort((a, b) => b.start.localeCompare(a.start))[0];

  return {
    totalSpend,
    visitCount: visits.filter((v) => v.status === "COMPLETED").length,
    invoiceCount: own.length,
    averageTicket: own.length ? round2(totalSpend / own.length) : 0,
    lastVisit: lastVisit?.start,
    outstanding: round2(own.reduce((sum, i) => sum + outstanding(i), 0)),
  };
}

/* ------------------------------------------------------------ Inventory */

export function lowStockProducts(products: Product[]) {
  return products
    .filter((p) => p.stock <= p.lowStockThreshold)
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
}

export function inventoryValue(products: Product[]) {
  return round2(products.reduce((sum, p) => sum + p.stock * p.costPrice, 0));
}

/* ---------------------------------------------------------- Appointments */

export function appointmentsOn(appointments: Appointment[], day: Date) {
  return appointments
    .filter((a) => isSameDay(a.start, day))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function upcomingAppointments(appointments: Appointment[], from: Date, limit = 6) {
  return appointments
    .filter((a) => new Date(a.start) >= from && a.status === "SCHEDULED")
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, limit);
}

/* ------------------------------------------------------- Period presets */

export type PeriodKey = "today" | "week" | "month" | "quarter" | "year";

export function periodRange(key: PeriodKey, anchor: Date): { from: Date; to: Date; label: string } {
  const today = startOfDay(anchor);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  switch (key) {
    case "today":
      return { from: today, to: end, label: "Today" };
    case "week": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from, to: end, label: "Last 7 days" };
    }
    case "month":
      return { from: startOfMonth(anchor), to: end, label: "This month" };
    case "quarter": {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 3);
      return { from, to: end, label: "Last 3 months" };
    }
    case "year":
      return { from: new Date(anchor.getFullYear(), 0, 1), to: end, label: "This year" };
  }
}

/** Same-length window immediately before `from` — used for trend deltas. */
export function previousRange(from: Date, to: Date) {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span - 1), to: new Date(from.getTime() - 1) };
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}
