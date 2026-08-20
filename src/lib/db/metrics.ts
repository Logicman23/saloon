import "server-only";
import { cache } from "react";
import { prisma, Prisma } from "@/lib/db/client";
import type { ServiceCategory } from "@/lib/types";

/**
 * Dashboard and report aggregates.
 *
 * These run as SQL `SUM`/`COUNT` in Postgres rather than loading rows into
 * Node and reducing them in JavaScript. At salon scale either works; the
 * difference shows up after a year of trading, when "revenue this month"
 * would otherwise mean shipping every invoice of the year over the wire.
 *
 * Every query here is exercised against a real Postgres engine by
 * `scripts/verify-sql.mjs`.
 *
 * Revenue is ACCRUAL — what was billed, not what was collected. Money not yet
 * received is reported separately as `outstanding`, so the two never
 * double-count.
 */

export interface PeriodKpis {
  revenue: number;
  serviceRevenue: number;
  retailRevenue: number;
  expenses: number;
  netProfit: number;
  invoiceCount: number;
  averageTicket: number;
  commissionTotal: number;
  appointmentCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  uniqueClients: number;
}

export interface DashboardMetrics {
  current: PeriodKpis;
  previous: PeriodKpis;
  outstandingTotal: number;
  outstandingCount: number;
}

const num = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number(value.toString());
};

/* ------------------------------------------------------------ Period KPIs */

async function periodKpis(from: Date, to: Date): Promise<PeriodKpis> {
  const [sales, spend, appointments] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        service_revenue: unknown;
        retail_revenue: unknown;
        commission_total: unknown;
        invoice_count: bigint;
        unique_clients: bigint;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(service_revenue), 0)   AS service_revenue,
        COALESCE(SUM(retail_revenue), 0)    AS retail_revenue,
        COALESCE(SUM(commission_total), 0)  AS commission_total,
        COUNT(*)                            AS invoice_count,
        COUNT(DISTINCT client_id)           AS unique_clients
      FROM sales_invoices
      WHERE payment_status <> 'VOID'
        AND created_at >= ${from}
        AND created_at <= ${to}
    `),

    prisma.$queryRaw<Array<{ total: unknown }>>(Prisma.sql`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE expense_date >= ${from} AND expense_date <= ${to}
    `),

    prisma.$queryRaw<
      Array<{ total: bigint; completed: bigint; cancelled: bigint; no_show: bigint }>
    >(Prisma.sql`
      SELECT
        COUNT(*)                                        AS total,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')    AS completed,
        COUNT(*) FILTER (WHERE status = 'CANCELLED')    AS cancelled,
        COUNT(*) FILTER (WHERE status = 'NO_SHOW')      AS no_show
      FROM appointments
      WHERE scheduled_at >= ${from} AND scheduled_at <= ${to}
    `),
  ]);

  const s = sales[0];
  const serviceRevenue = num(s?.service_revenue);
  const retailRevenue = num(s?.retail_revenue);
  const revenue = serviceRevenue + retailRevenue;
  const expenses = num(spend[0]?.total);
  const invoiceCount = num(s?.invoice_count);
  const a = appointments[0];

  return {
    revenue,
    serviceRevenue,
    retailRevenue,
    expenses,
    netProfit: revenue - expenses,
    invoiceCount,
    averageTicket: invoiceCount ? revenue / invoiceCount : 0,
    commissionTotal: num(s?.commission_total),
    appointmentCount: num(a?.total),
    completedCount: num(a?.completed),
    cancelledCount: num(a?.cancelled),
    noShowCount: num(a?.no_show),
    uniqueClients: num(s?.unique_clients),
  };
}

/** Current period plus the equal-length window before it, for trend deltas. */
export const getDashboardMetrics = cache(
  async (from: Date, to: Date): Promise<DashboardMetrics> => {
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span - 1);
    const prevTo = new Date(from.getTime() - 1);

    const [current, previous, receivables] = await Promise.all([
      periodKpis(from, to),
      periodKpis(prevFrom, prevTo),
      // Deliberately unbounded by period: an unpaid bill from last month is
      // still money owed today.
      prisma.$queryRaw<Array<{ outstanding: unknown; count: bigint }>>(Prisma.sql`
        SELECT
          COALESCE(SUM(total_amount - paid_amount), 0) AS outstanding,
          COUNT(*)                                     AS count
        FROM sales_invoices
        WHERE payment_status IN ('UNPAID', 'PARTIAL')
      `),
    ]);

    return {
      current,
      previous,
      outstandingTotal: num(receivables[0]?.outstanding),
      outstandingCount: num(receivables[0]?.count),
    };
  },
);

/* ------------------------------------------------------- Revenue trend --- */

export interface TrendPoint {
  label: string;
  services: number;
  retail: number;
  expenses: number;
}

/**
 * Daily revenue and spend across the window.
 *
 * `generate_series` supplies every date in range so days with no trade appear
 * as zero rather than being dropped — otherwise the chart would silently
 * compress quiet days and misrepresent the shape of the week.
 */
export const getDailyTrend = cache(async (from: Date, to: Date): Promise<TrendPoint[]> => {
  const rows = await prisma.$queryRaw<
    Array<{ day: Date; services: unknown; retail: unknown; expenses: unknown }>
  >(Prisma.sql`
    WITH days AS (
      SELECT generate_series(${from}::date, ${to}::date, '1 day')::date AS day
    ),
    sales AS (
      SELECT created_at::date AS day,
             SUM(service_revenue) AS services,
             SUM(retail_revenue)  AS retail
      FROM sales_invoices
      WHERE payment_status <> 'VOID' AND created_at >= ${from} AND created_at <= ${to}
      GROUP BY 1
    ),
    spend AS (
      SELECT expense_date::date AS day, SUM(amount) AS expenses
      FROM expenses
      WHERE expense_date >= ${from} AND expense_date <= ${to}
      GROUP BY 1
    )
    SELECT days.day,
           COALESCE(sales.services, 0)  AS services,
           COALESCE(sales.retail, 0)    AS retail,
           COALESCE(spend.expenses, 0)  AS expenses
    FROM days
    LEFT JOIN sales ON sales.day = days.day
    LEFT JOIN spend ON spend.day = days.day
    ORDER BY days.day
  `);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return rows.map((r) => {
    const d = new Date(r.day);
    return {
      label: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
      services: num(r.services),
      retail: num(r.retail),
      expenses: num(r.expenses),
    };
  });
});

/** Monthly buckets for the income-vs-expenses report. */
export const getMonthlyTrend = cache(async (months: number): Promise<TrendPoint[]> => {
  const rows = await prisma.$queryRaw<
    Array<{ month: Date; services: unknown; retail: unknown; expenses: unknown }>
  >(Prisma.sql`
    WITH span AS (
      SELECT generate_series(
        date_trunc('month', NOW()) - (${months - 1} || ' months')::interval,
        date_trunc('month', NOW()),
        '1 month'
      ) AS month
    ),
    sales AS (
      SELECT date_trunc('month', created_at) AS month,
             SUM(service_revenue) AS services,
             SUM(retail_revenue)  AS retail
      FROM sales_invoices
      WHERE payment_status <> 'VOID'
      GROUP BY 1
    ),
    spend AS (
      SELECT date_trunc('month', expense_date) AS month, SUM(amount) AS expenses
      FROM expenses GROUP BY 1
    )
    SELECT span.month,
           COALESCE(sales.services, 0) AS services,
           COALESCE(sales.retail, 0)   AS retail,
           COALESCE(spend.expenses, 0) AS expenses
    FROM span
    LEFT JOIN sales ON sales.month = span.month
    LEFT JOIN spend ON spend.month = span.month
    ORDER BY span.month
  `);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return rows.map((r) => {
    const d = new Date(r.month);
    return {
      label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      services: num(r.services),
      retail: num(r.retail),
      expenses: num(r.expenses),
    };
  });
});

/* --------------------------------------------------- Sales breakdown ring */

export interface CategorySlice {
  category: ServiceCategory | "Retail";
  revenue: number;
}

const CATEGORY_LABEL: Record<string, ServiceCategory | "Retail"> = {
  HAIR: "Hair",
  SKIN: "Skin",
  MAKEUP: "Makeup",
  NAILS: "Nails",
  SPA: "Spa",
  RETAIL: "Retail",
};

/** Revenue split by service category vs. retail — feeds the ring chart. */
export const getCategoryBreakdown = cache(
  async (from: Date, to: Date): Promise<CategorySlice[]> => {
    const rows = await prisma.$queryRaw<Array<{ category: string; revenue: unknown }>>(Prisma.sql`
      SELECT
        CASE
          WHEN l.kind = 'PRODUCT' THEN 'RETAIL'
          ELSE COALESCE(s.category::text, 'HAIR')
        END AS category,
        SUM(l.unit_price * l.qty - l.line_discount) AS revenue
      FROM invoice_lines l
      JOIN sales_invoices i ON i.id = l.invoice_id
      LEFT JOIN services s ON s.id = l.ref_id AND l.kind = 'SERVICE'
      WHERE i.payment_status <> 'VOID'
        AND i.created_at >= ${from} AND i.created_at <= ${to}
      GROUP BY 1
      ORDER BY revenue DESC
    `);

    return rows.map((r) => ({
      category: CATEGORY_LABEL[r.category] ?? "Retail",
      revenue: num(r.revenue),
    }));
  },
);

/* ----------------------------------------------------------- Top services */

export const getTopServices = cache(
  async (from: Date, to: Date, limit = 10): Promise<Array<{ name: string; count: number; revenue: number }>> => {
    const rows = await prisma.$queryRaw<
      Array<{ name: string; count: bigint; revenue: unknown }>
    >(Prisma.sql`
      SELECT l.name,
             SUM(l.qty)                                   AS count,
             SUM(l.unit_price * l.qty - l.line_discount)  AS revenue
      FROM invoice_lines l
      JOIN sales_invoices i ON i.id = l.invoice_id
      WHERE l.kind = 'SERVICE' AND i.payment_status <> 'VOID'
        AND i.created_at >= ${from} AND i.created_at <= ${to}
      GROUP BY l.name
      ORDER BY revenue DESC
      LIMIT ${limit}
    `);

    return rows.map((r) => ({ name: r.name, count: num(r.count), revenue: num(r.revenue) }));
  },
);

/* ------------------------------------------------- Staff performance ----- */

export interface StaffPerformanceRow {
  staffId: string;
  name: string;
  role: string;
  commissionRate: number;
  serviceRevenue: number;
  retailRevenue: number;
  commission: number;
  clientCount: number;
  invoiceCount: number;
  appointmentsCompleted: number;
}

export const getStaffPerformance = cache(
  async (from: Date, to: Date): Promise<StaffPerformanceRow[]> => {
    const rows = await prisma.$queryRaw<
      Array<{
        staff_id: string;
        name: string;
        role: string;
        commission_rate: unknown;
        service_revenue: unknown;
        retail_revenue: unknown;
        commission: unknown;
        client_count: bigint;
        invoice_count: bigint;
        completed: bigint;
      }>
    >(Prisma.sql`
      WITH lines AS (
        SELECT l.staff_id,
               SUM(CASE WHEN l.kind <> 'PRODUCT'
                        THEN l.unit_price * l.qty - l.line_discount ELSE 0 END) AS service_revenue,
               SUM(CASE WHEN l.kind =  'PRODUCT'
                        THEN l.unit_price * l.qty - l.line_discount ELSE 0 END) AS retail_revenue,
               SUM((l.unit_price * l.qty - l.line_discount) * l.commission_rate) AS commission,
               COUNT(DISTINCT i.client_id) AS client_count,
               COUNT(DISTINCT i.id)        AS invoice_count
        FROM invoice_lines l
        JOIN sales_invoices i ON i.id = l.invoice_id
        WHERE l.staff_id IS NOT NULL
          AND i.payment_status <> 'VOID'
          AND i.created_at >= ${from} AND i.created_at <= ${to}
        GROUP BY l.staff_id
      ),
      appts AS (
        SELECT staff_id, COUNT(*) AS completed
        FROM appointments
        WHERE status = 'COMPLETED' AND scheduled_at >= ${from} AND scheduled_at <= ${to}
        GROUP BY staff_id
      )
      SELECT st.id AS staff_id, st.name, st.role::text AS role, st.commission_rate,
             COALESCE(lines.service_revenue, 0) AS service_revenue,
             COALESCE(lines.retail_revenue, 0)  AS retail_revenue,
             COALESCE(lines.commission, 0)      AS commission,
             COALESCE(lines.client_count, 0)    AS client_count,
             COALESCE(lines.invoice_count, 0)   AS invoice_count,
             COALESCE(appts.completed, 0)       AS completed
      FROM staff st
      LEFT JOIN lines ON lines.staff_id = st.id
      LEFT JOIN appts ON appts.staff_id = st.id
      WHERE COALESCE(lines.service_revenue, 0) + COALESCE(lines.retail_revenue, 0) > 0
         OR COALESCE(appts.completed, 0) > 0
      ORDER BY (COALESCE(lines.service_revenue, 0) + COALESCE(lines.retail_revenue, 0)) DESC
    `);

    return rows.map((r) => ({
      staffId: r.staff_id,
      name: r.name,
      role: r.role,
      commissionRate: num(r.commission_rate),
      serviceRevenue: num(r.service_revenue),
      retailRevenue: num(r.retail_revenue),
      commission: num(r.commission),
      clientCount: num(r.client_count),
      invoiceCount: num(r.invoice_count),
      appointmentsCompleted: num(r.completed),
    }));
  },
);

/* ------------------------------------------------- Commission for one -- */

export const getMyCommission = cache(
  async (staffId: string, from: Date, to: Date) => {
    const rows = await prisma.$queryRaw<
      Array<{
        invoice_number: string;
        created_at: Date;
        client_name: string;
        item: string;
        kind: string;
        net: unknown;
        rate: unknown;
        commission: unknown;
      }>
    >(Prisma.sql`
      SELECT i.number                                     AS invoice_number,
             i.created_at,
             c.name                                       AS client_name,
             l.name                                       AS item,
             l.kind::text                                 AS kind,
             (l.unit_price * l.qty - l.line_discount)     AS net,
             l.commission_rate                            AS rate,
             (l.unit_price * l.qty - l.line_discount) * l.commission_rate AS commission
      FROM invoice_lines l
      JOIN sales_invoices i ON i.id = l.invoice_id
      JOIN clients c ON c.id = i.client_id
      WHERE l.staff_id = ${staffId}
        AND i.payment_status <> 'VOID'
        AND i.created_at >= ${from} AND i.created_at <= ${to}
      ORDER BY i.created_at DESC
    `);

    return rows.map((r) => ({
      invoiceNumber: r.invoice_number,
      at: r.created_at.toISOString(),
      client: r.client_name,
      item: r.item,
      kind: r.kind,
      net: num(r.net),
      rate: num(r.rate),
      commission: num(r.commission),
    }));
  },
);

/* ----------------------------------------------------------- Client spend */

/** The spec's `clients.total_spend`, computed rather than denormalised. */
export const getClientSpend = cache(async (): Promise<Map<string, { totalSpend: number; visitCount: number; lastVisit?: string; outstanding: number }>> => {
  const rows = await prisma.$queryRaw<
    Array<{
      client_id: string;
      total_spend: unknown;
      outstanding: unknown;
      visit_count: bigint;
      last_visit: Date | null;
    }>
  >(Prisma.sql`
    SELECT c.id AS client_id,
           COALESCE(SUM(i.paid_amount), 0)                    AS total_spend,
           COALESCE(SUM(i.total_amount - i.paid_amount)
             FILTER (WHERE i.payment_status IN ('UNPAID','PARTIAL')), 0) AS outstanding,
           COALESCE(a.visits, 0)                              AS visit_count,
           a.last_visit
    FROM clients c
    LEFT JOIN sales_invoices i ON i.client_id = c.id AND i.payment_status <> 'VOID'
    LEFT JOIN (
      SELECT client_id, COUNT(*) AS visits, MAX(scheduled_at) AS last_visit
      FROM appointments WHERE status = 'COMPLETED' GROUP BY client_id
    ) a ON a.client_id = c.id
    GROUP BY c.id, a.visits, a.last_visit
  `);

  return new Map(
    rows.map((r) => [
      r.client_id,
      {
        totalSpend: num(r.total_spend),
        outstanding: num(r.outstanding),
        visitCount: num(r.visit_count),
        lastVisit: r.last_visit?.toISOString(),
      },
    ]),
  );
});

/* ------------------------------------------------------------- Inventory */

export const getLowStockCount = cache(async (): Promise<number> => {
  // Archived products are excluded explicitly. This is raw SQL, so it does not
  // inherit the `archivedAt` filter that `getProducts` applies — and a retired
  // product sits at zero stock forever, which is permanently "below the
  // reorder threshold". Without this the alert badge never clears.
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM inventory
    WHERE stock_qty <= min_stock_alert
      AND archived_at IS NULL
  `);
  return num(rows[0]?.count);
});
