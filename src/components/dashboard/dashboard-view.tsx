"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  Clock,
  Package,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, SectionHeading } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { CATEGORY_COLORS, CategoryDonut, RevenueTrendChart } from "@/components/dashboard/charts";
import { AppointmentStatusBadge } from "@/components/appointments/status";
import { percentChange, type PeriodKey } from "@/lib/data/analytics";
import type { CategorySlice, DashboardMetrics, StaffPerformanceRow, TrendPoint } from "@/lib/db/metrics";
import { formatDateLong, formatTime } from "@/lib/date";
import { formatDuration, formatMoney, formatMoneyCompact } from "@/lib/utils";
import type { Appointment, Client, Product, Staff } from "@/lib/types";

/**
 * Presentation only.
 *
 * Every number arrives pre-aggregated from `src/lib/db/metrics.ts`; this
 * component performs no analytics of its own. Changing the period pushes a
 * query-string change so the server recomputes over the new window.
 */
export function DashboardView({
  period,
  rangeLabel,
  metrics,
  trend,
  categories,
  performers,
  topServices,
  lowStockCount,
  lowStockItems,
  todaysAppointments,
  staff,
  clients,
  todayIso,
}: {
  period: PeriodKey;
  rangeLabel: string;
  metrics: DashboardMetrics;
  trend: TrendPoint[];
  categories: CategorySlice[];
  performers: StaffPerformanceRow[];
  topServices: Array<{ name: string; count: number; revenue: number }>;
  lowStockCount: number;
  lowStockItems: Product[];
  todaysAppointments: Appointment[];
  staff: Staff[];
  clients: Client[];
  todayIso: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [switching, startTransition] = React.useTransition();

  const { current, previous } = metrics;

  const staffById = React.useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const clientById = React.useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const changePeriod = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    startTransition(() => router.push(`/?${params.toString()}`));
  };

  const upNext = todaysAppointments
    .filter((a) => a.status === "SCHEDULED" || a.status === "IN_PROGRESS")
    .slice(0, 5);

  const categoryTotal = categories.reduce((sum, c) => sum + c.revenue, 0);
  const leaderTotal = performers[0]
    ? performers[0].serviceRevenue + performers[0].retailRevenue
    : 0;

  return (
    <div className={switching ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="space-y-6">
        {/* ------------------------------------------------------- Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gold/70">
              {formatDateLong(todayIso)}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Good to see you, <span className="text-gilded">Sana</span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              {todaysAppointments.length} appointment
              {todaysAppointments.length === 1 ? "" : "s"} on the book today ·{" "}
              {metrics.outstandingCount} invoice{metrics.outstandingCount === 1 ? "" : "s"} pending
              payment
            </p>
          </div>

          <Tabs value={period} onValueChange={changePeriod}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">7 days</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="quarter">Quarter</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* --------------------------------------------------------- KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={`Revenue · ${rangeLabel}`}
            value={formatMoney(current.revenue)}
            icon={TrendingUp}
            delta={percentChange(current.revenue, previous.revenue)}
            sublabel={`${current.invoiceCount} invoices`}
            tone="gold"
          />
          <KpiCard
            label="Net Profit"
            value={formatMoney(current.netProfit)}
            icon={Wallet}
            delta={percentChange(current.netProfit, previous.netProfit)}
            sublabel={`${formatMoneyCompact(current.expenses)} expenses`}
            tone={current.netProfit >= 0 ? "success" : "danger"}
          />
          <KpiCard
            label="Appointments"
            value={current.appointmentCount.toString()}
            icon={CalendarCheck}
            delta={percentChange(current.appointmentCount, previous.appointmentCount)}
            sublabel={`${current.completedCount} completed · ${current.noShowCount} no-show`}
            tone="gold"
          />
          <KpiCard
            label="Pending Invoices"
            value={formatMoney(metrics.outstandingTotal)}
            icon={Receipt}
            sublabel={`across ${metrics.outstandingCount} bills`}
            tone={metrics.outstandingTotal > 0 ? "warning" : "success"}
          />
        </div>

        {/* ------------------------------------------- Trend + category mix */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Revenue trend</CardTitle>
                <p className="mt-0.5 text-sm text-muted">
                  Services and retail, stacked · {rangeLabel.toLowerCase()}
                </p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="tabular text-lg font-semibold text-gold">
                  {formatMoney(current.revenue)}
                </p>
                <p className="text-xs text-faint">
                  avg ticket {formatMoney(current.averageTicket)}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {trend.length > 0 ? (
                <RevenueTrendChart data={trend} />
              ) : (
                <EmptyState icon={TrendingUp} title="No trade recorded in this period" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sales breakdown</CardTitle>
              <p className="text-sm text-muted">Service categories vs. retail</p>
            </CardHeader>
            <CardContent>
              {categoryTotal > 0 ? (
                <>
                  <CategoryDonut data={categories} />
                  <ul className="mt-3 space-y-2">
                    {categories.map((entry) => (
                      <li key={entry.category} className="flex items-center gap-2.5 text-sm">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: CATEGORY_COLORS[entry.category] ?? "#d4af37" }}
                          aria-hidden
                        />
                        <span className="flex-1 truncate text-muted">{entry.category}</span>
                        <span className="tabular text-ink">
                          {formatMoneyCompact(entry.revenue)}
                        </span>
                        <span className="tabular w-11 text-right text-xs text-faint">
                          {((entry.revenue / categoryTotal) * 100).toFixed(0)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <EmptyState
                  icon={Receipt}
                  title="No sales in this period"
                  description="Ring up a bill from the POS to see the category split."
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------------------------------- Today / staff / stock / top */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Up next today</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/appointments">
                  All <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {upNext.length === 0 && (
                <EmptyState
                  icon={Clock}
                  title="Nothing left on today's board"
                  description="Every appointment for today is closed out."
                />
              )}
              {upNext.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex items-center gap-3 rounded-lg border border-hairline bg-obsidian-elevated p-3"
                >
                  <div className="w-14 shrink-0 text-center">
                    <p className="tabular text-sm font-semibold text-gold">
                      {formatTime(appointment.start)}
                    </p>
                    <p className="text-[10px] text-faint">
                      {formatDuration(appointment.durationMin)}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {clientById.get(appointment.clientId)?.name ?? "Walk-in"}
                    </p>
                    <p className="truncate text-xs text-faint">
                      with {staffById.get(appointment.staffId)?.name}
                    </p>
                  </div>
                  <AppointmentStatusBadge status={appointment.status} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Top performers</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/reports">
                  Report <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {performers.length === 0 && (
                <EmptyState icon={TrendingUp} title="No attributed sales yet" />
              )}
              {performers.map((row, index) => {
                const total = row.serviceRevenue + row.retailRevenue;
                return (
                  <div key={row.staffId} className="rounded-lg border border-hairline p-3">
                    <div className="flex items-center gap-3">
                      <span className="tabular w-4 shrink-0 text-xs font-semibold text-faint">
                        {index + 1}
                      </span>
                      <Avatar name={row.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                        <p className="truncate text-xs text-faint">{row.role}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular text-sm font-semibold text-ink">
                          {formatMoneyCompact(total)}
                        </p>
                        <p className="tabular text-[11px] text-gold">
                          {formatMoneyCompact(row.commission)} comm.
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold-light"
                        style={{ width: `${leaderTotal ? (total / leaderTotal) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  Stock alerts
                  {lowStockCount > 0 && <Badge variant="danger">{lowStockCount}</Badge>}
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/inventory">
                    Manage <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {lowStockItems.length === 0 && (
                  <EmptyState icon={Package} title="Every item is above its threshold" />
                )}
                {lowStockItems.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 rounded-lg border border-danger/25 bg-danger/[0.05] p-2.5"
                  >
                    <AlertTriangle className="size-4 shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{product.name}</p>
                      <p className="text-xs text-faint">
                        {product.stock} {product.unit} left · min {product.lowStockThreshold}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Most booked</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topServices.length === 0 && (
                  <EmptyState icon={Receipt} title="No services billed yet" />
                )}
                {topServices.map((service) => (
                  <div key={service.name} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-muted">{service.name}</span>
                    <Badge variant="neutral">{service.count}x</Badge>
                    <span className="tabular w-16 text-right text-ink">
                      {formatMoneyCompact(service.revenue)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* --------------------------------------------------- Quick links */}
        <SectionHeading
          title="Jump back in"
          description="The three screens the front desk lives in."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              href: "/pos",
              label: "Open POS",
              body: "Ring up a walk-in, split the payment and print a receipt.",
              icon: Receipt,
            },
            {
              href: "/appointments",
              label: "Manage calendar",
              body: "Day, week and month views with a live status board.",
              icon: CalendarCheck,
            },
            {
              href: "/expenses",
              label: "Log an expense",
              body: "Rent, bills, salaries and the daily tea run.",
              icon: Wallet,
            },
          ].map((tile) => (
            <Link key={tile.href} href={tile.href}>
              <Card interactive className="h-full p-5">
                <span className="inline-flex size-9 items-center justify-center rounded-lg bg-gold/10 ring-1 ring-gold/20">
                  <tile.icon className="size-4 text-gold" />
                </span>
                <p className="mt-3 font-medium text-ink">{tile.label}</p>
                <p className="mt-1 text-sm text-muted">{tile.body}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
