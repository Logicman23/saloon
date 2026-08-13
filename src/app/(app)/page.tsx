import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { periodRange, type PeriodKey } from "@/lib/data/analytics";
import {
  getCategoryBreakdown,
  getDailyTrend,
  getDashboardMetrics,
  getLowStockCount,
  getStaffPerformance,
  getTopServices,
} from "@/lib/db/metrics";
import { getAppointments, getClients, getProducts, getStaff } from "@/lib/db/queries";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { startOfDay } from "@/lib/date";

/** Figures must be current on every load — never served from a static cache. */
export const dynamic = "force-dynamic";

/**
 * Executive dashboard.
 *
 * A server component: every KPI, both charts and each panel is computed by
 * SQL aggregates in Postgres, then handed to a thin client component that
 * only renders. Nothing here is derived from a mock array, and no invoice
 * rows travel to the browser just to be summed.
 *
 * The period selector round-trips through `?period=` so switching to
 * "Quarter" re-runs the aggregates over the new window rather than
 * re-slicing a payload the client happens to be holding.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");

  // Middleware already gates this route; re-checked here so a direct render
  // can never leak financials, and so the check lives beside the query.
  if (!roleCan(session.role, "finance.view")) redirect("/denied");

  const params = await searchParams;
  const period = (["today", "week", "month", "quarter", "year"] as const).includes(
    params.period as PeriodKey,
  )
    ? (params.period as PeriodKey)
    : "month";

  const now = new Date();
  const range = periodRange(period, now);
  const today = startOfDay(now);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  const [metrics, trend, categories, performers, topServices, lowStock, todaysBoard, staff, clients, products] =
    await Promise.all([
      getDashboardMetrics(range.from, range.to),
      getDailyTrend(range.from, range.to),
      getCategoryBreakdown(range.from, range.to),
      getStaffPerformance(range.from, range.to),
      getTopServices(range.from, range.to, 5),
      getLowStockCount(),
      getAppointments(today, endOfToday),
      getStaff(),
      getClients(),
      getProducts(),
    ]);

  const lowStockItems = products
    .filter((p) => p.stock <= p.lowStockThreshold)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 4);

  return (
    <DashboardView
      period={period}
      rangeLabel={range.label}
      metrics={metrics}
      trend={trend}
      categories={categories}
      performers={performers.slice(0, 5)}
      topServices={topServices}
      lowStockCount={lowStock}
      lowStockItems={lowStockItems}
      todaysAppointments={todaysBoard}
      staff={staff}
      clients={clients}
      todayIso={today.toISOString()}
    />
  );
}
