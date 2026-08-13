"use client";

import * as React from "react";
import Link from "next/link";
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
import {
  CATEGORY_COLORS,
  CategoryDonut,
  RevenueTrendChart,
} from "@/components/dashboard/charts";
import { AppointmentStatusBadge } from "@/components/appointments/status";
import { useLookups, useSalon } from "@/lib/data/store";
import {
  appointmentsOn,
  dailySeries,
  lowStockProducts,
  percentChange,
  periodRange,
  previousRange,
  revenueByCategory,
  staffPerformance,
  summarize,
  topServices,
  type PeriodKey,
} from "@/lib/data/analytics";
import { formatDateLong, formatTime, startOfDay } from "@/lib/date";
import { formatDuration, formatMoney, formatMoneyCompact } from "@/lib/utils";

export default function DashboardPage() {
  const { invoices, expenses, appointments, services, staff, products } = useSalon();
  const { clientById, staffById } = useLookups();
  const [period, setPeriod] = React.useState<PeriodKey>("month");

  // Anchored once per mount so every panel measures the same instant.
  const now = React.useMemo(() => new Date(), []);
  const today = React.useMemo(() => startOfDay(now), [now]);

  const range = React.useMemo(() => periodRange(period, now), [period, now]);
  const prev = React.useMemo(() => previousRange(range.from, range.to), [range]);

  const current = React.useMemo(
    () => summarize({ invoices, expenses, appointments }, range.from, range.to),
    [invoices, expenses, appointments, range],
  );
  const previous = React.useMemo(
    () => summarize({ invoices, expenses, appointments }, prev.from, prev.to),
    [invoices, expenses, appointments, prev],
  );

  const trend = React.useMemo(
    () => dailySeries(invoices, expenses, range.from, range.to),
    [invoices, expenses, range],
  );

  const categories = React.useMemo(
    () => revenueByCategory(invoices, services, range.from, range.to),
    [invoices, services, range],
  );

  const performers = React.useMemo(
    () => staffPerformance({ invoices, appointments, staff }, range.from, range.to).slice(0, 5),
    [invoices, appointments, staff, range],
  );

  const popular = React.useMemo(
    () => topServices(invoices, services, range.from, range.to, 5),
    [invoices, services, range],
  );

  const todaysBoard = React.useMemo(
    () => appointmentsOn(appointments, today),
    [appointments, today],
  );
  const upNext = React.useMemo(
    () =>
      todaysBoard
        .filter((a) => a.status === "SCHEDULED" || a.status === "IN_PROGRESS")
        .slice(0, 5),
    [todaysBoard],
  );

  const lowStock = React.useMemo(() => lowStockProducts(products), [products]);

  const categoryTotal = categories.reduce((sum, c) => sum + c.revenue, 0);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------- Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gold/70">
            {formatDateLong(today)}
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Good to see you, <span className="text-gilded">Sana</span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            {todaysBoard.length} appointment{todaysBoard.length === 1 ? "" : "s"} on the book today ·{" "}
            {current.outstandingCount} invoice{current.outstandingCount === 1 ? "" : "s"} pending
            payment
          </p>
        </div>

        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
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
          label={`Revenue · ${range.label}`}
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
          value={formatMoney(current.outstandingTotal)}
          icon={Receipt}
          sublabel={`across ${current.outstandingCount} bills`}
          tone={current.outstandingTotal > 0 ? "warning" : "success"}
        />
      </div>

      {/* ------------------------------------------- Trend + category mix */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Revenue trend</CardTitle>
              <p className="mt-0.5 text-sm text-muted">
                Services and retail, stacked · {range.label.toLowerCase()}
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
            <RevenueTrendChart data={trend} />
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
                      <span className="tabular text-ink">{formatMoneyCompact(entry.revenue)}</span>
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
        {/* Up next */}
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
            {upNext.map((appointment) => {
              const client = clientById.get(appointment.clientId);
              const member = staffById.get(appointment.staffId);
              return (
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
                      {client?.name ?? "Walk-in"}
                    </p>
                    <p className="truncate text-xs text-faint">with {member?.name}</p>
                  </div>
                  <AppointmentStatusBadge status={appointment.status} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Staff leaderboard */}
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
              const leader = performers[0].serviceRevenue + performers[0].retailRevenue;
              return (
                <div key={row.staff.id} className="rounded-lg border border-hairline p-3">
                  <div className="flex items-center gap-3">
                    <span className="tabular w-4 shrink-0 text-xs font-semibold text-faint">
                      {index + 1}
                    </span>
                    <Avatar name={row.staff.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{row.staff.name}</p>
                      <p className="truncate text-xs text-faint">{row.staff.role}</p>
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
                      style={{ width: `${leader ? (total / leader) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Stock alerts + top services */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Stock alerts
                {lowStock.length > 0 && (
                  <Badge variant="danger">{lowStock.length}</Badge>
                )}
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/inventory">
                  Manage <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {lowStock.length === 0 && (
                <EmptyState icon={Package} title="Every item is above its threshold" />
              )}
              {lowStock.slice(0, 4).map((product) => (
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
              {popular.length === 0 && <EmptyState icon={Receipt} title="No services billed yet" />}
              {popular.map((service) => (
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
  );
}
