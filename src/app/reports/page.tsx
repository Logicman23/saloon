"use client";

import * as React from "react";
import { Banknote, Download, Percent, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, SectionHeading } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  CATEGORY_COLORS,
  CategoryDonut,
  HorizontalRevenueBars,
  IncomeExpenseChart,
  RevenueTrendChart,
} from "@/components/dashboard/charts";
import { useSalon } from "@/lib/data/store";
import {
  dailySeries,
  monthlySeries,
  percentChange,
  periodRange,
  previousRange,
  revenueByCategory,
  staffPerformance,
  summarize,
  topServices,
  type PeriodKey,
} from "@/lib/data/analytics";
import { formatDate } from "@/lib/date";
import { formatMoney, formatMoneyCompact } from "@/lib/utils";

export default function ReportsPage() {
  const { invoices, expenses, appointments, services, staff } = useSalon();
  const [period, setPeriod] = React.useState<PeriodKey>("month");

  const now = React.useMemo(() => new Date(), []);
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

  const daily = React.useMemo(
    () => dailySeries(invoices, expenses, range.from, range.to),
    [invoices, expenses, range],
  );
  const monthly = React.useMemo(
    () => monthlySeries(invoices, expenses, 6, now),
    [invoices, expenses, now],
  );
  const categories = React.useMemo(
    () => revenueByCategory(invoices, services, range.from, range.to),
    [invoices, services, range],
  );
  const performers = React.useMemo(
    () => staffPerformance({ invoices, appointments, staff }, range.from, range.to),
    [invoices, appointments, staff, range],
  );
  const popular = React.useMemo(
    () => topServices(invoices, services, range.from, range.to, 10),
    [invoices, services, range],
  );

  const categoryTotal = categories.reduce((sum, c) => sum + c.revenue, 0);
  const commissionTotal = performers.reduce((sum, p) => sum + p.commission, 0);

  /** Exports the active report tab's core figures as CSV. */
  const exportCsv = () => {
    const lines = [
      ["Sana's Beauty Saloon — Business Report"],
      [`Period`, `${formatDate(range.from)} to ${formatDate(range.to)}`],
      [],
      ["Summary"],
      ["Revenue", current.revenue],
      ["Service revenue", current.serviceRevenue],
      ["Retail revenue", current.retailRevenue],
      ["Expenses", current.expenses],
      ["Net profit", current.netProfit],
      ["Invoices", current.invoiceCount],
      ["Average ticket", current.averageTicket],
      ["Appointments", current.appointmentCount],
      ["Completed", current.completedCount],
      ["Cancelled", current.cancelledCount],
      ["No-shows", current.noShowCount],
      ["Outstanding", current.outstandingTotal],
      [],
      ["Revenue by category"],
      ["Category", "Revenue"],
      ...categories.map((c) => [c.category, c.revenue]),
      [],
      ["Staff performance"],
      ["Staff", "Role", "Service revenue", "Retail revenue", "Commission", "Clients", "Completed"],
      ...performers.map((p) => [
        p.staff.name,
        p.staff.role,
        p.serviceRevenue,
        p.retailRevenue,
        p.commission,
        p.clientCount,
        p.appointmentsCompleted,
      ]),
    ];

    const csv = lines
      .map((row) =>
        row
          .map((cell) => {
            const text = String(cell ?? "");
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sbs-report-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Business reports
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {formatDate(range.from)} — {formatDate(range.to)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">7 days</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="quarter">Quarter</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="secondary" onClick={exportCsv}>
            <Download /> Export CSV
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue"
          value={formatMoney(current.revenue)}
          icon={TrendingUp}
          delta={percentChange(current.revenue, previous.revenue)}
          sublabel={`avg ${formatMoneyCompact(current.averageTicket)} / bill`}
          tone="gold"
        />
        <KpiCard
          label="Expenses"
          value={formatMoney(current.expenses)}
          icon={TrendingDown}
          delta={percentChange(current.expenses, previous.expenses)}
          invertDelta
          tone="danger"
        />
        <KpiCard
          label="Net profit"
          value={formatMoney(current.netProfit)}
          icon={Banknote}
          delta={percentChange(current.netProfit, previous.netProfit)}
          sublabel={
            current.revenue > 0
              ? `${((current.netProfit / current.revenue) * 100).toFixed(0)}% margin`
              : undefined
          }
          tone={current.netProfit >= 0 ? "success" : "danger"}
        />
        <KpiCard
          label="Commission payable"
          value={formatMoney(commissionTotal)}
          icon={Percent}
          sublabel={`${performers.length} staff earning`}
          tone="warning"
        />
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="pnl">Income vs expenses</TabsTrigger>
          <TabsTrigger value="staff">Staff &amp; commission</TabsTrigger>
        </TabsList>

        {/* ----------------------------------------------------- Sales tab */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue trend</CardTitle>
                <p className="text-sm text-muted">Services and retail, stacked daily</p>
              </CardHeader>
              <CardContent>
                <RevenueTrendChart data={daily} height={300} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Service vs retail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CategoryDonut data={categories} />
                <div className="space-y-2">
                  {categories.map((entry) => (
                    <div key={entry.category} className="flex items-center gap-2.5 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: CATEGORY_COLORS[entry.category] ?? "#d4af37" }}
                        aria-hidden
                      />
                      <span className="flex-1 truncate text-muted">{entry.category}</span>
                      <span className="tabular text-ink">{formatMoneyCompact(entry.revenue)}</span>
                      <span className="tabular w-11 text-right text-xs text-faint">
                        {categoryTotal ? ((entry.revenue / categoryTotal) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 border-t border-hairline pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Service revenue</span>
                    <span className="tabular text-gold">
                      {formatMoney(current.serviceRevenue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Retail revenue</span>
                    <span className="tabular text-info">{formatMoney(current.retailRevenue)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top performing services</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Times billed</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {popular.length === 0 && (
                  <TableEmpty colSpan={5}>No services billed in this period.</TableEmpty>
                )}
                {popular.map((service, index) => (
                  <TableRow key={service.name}>
                    <TableCell className="tabular text-faint">{index + 1}</TableCell>
                    <TableCell className="text-ink">{service.name}</TableCell>
                    <TableCell className="tabular text-right text-muted">{service.count}</TableCell>
                    <TableCell className="tabular text-right font-medium text-gold">
                      {formatMoney(service.revenue)}
                    </TableCell>
                    <TableCell className="tabular text-right text-faint">
                      {current.serviceRevenue
                        ? `${((service.revenue / current.serviceRevenue) * 100).toFixed(1)}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------- P&L tab */}
        <TabsContent value="pnl" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Income vs expenses — last 6 months</CardTitle>
              <p className="text-sm text-muted">
                Bars show income and spend; the line traces net profit.
              </p>
            </CardHeader>
            <CardContent>
              <IncomeExpenseChart data={monthly} height={340} />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Profit &amp; loss — {range.label.toLowerCase()}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <PnlRow label="Service revenue" value={current.serviceRevenue} />
                <PnlRow label="Retail revenue" value={current.retailRevenue} />
                <PnlRow label="Total income" value={current.revenue} bold />
                <div className="h-px bg-hairline" />
                <PnlRow label="Operating expenses" value={-current.expenses} />
                <PnlRow label="Commission payable" value={-commissionTotal} muted />
                <div className="h-px bg-hairline" />
                <PnlRow label="Net profit" value={current.netProfit} bold big />
                <p className="pt-1 text-xs text-faint">
                  Commission is shown for information — in this dataset it is settled through the
                  Staff Salary expense category rather than deducted twice.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly breakdown</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Income</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthly.map((point) => {
                    const income = point.services + point.retail;
                    const net = income - point.expenses;
                    return (
                      <TableRow key={point.label}>
                        <TableCell className="text-ink">{point.label}</TableCell>
                        <TableCell className="tabular text-right text-muted">
                          {formatMoneyCompact(income)}
                        </TableCell>
                        <TableCell className="tabular text-right text-danger">
                          {formatMoneyCompact(point.expenses)}
                        </TableCell>
                        <TableCell
                          className={`tabular text-right font-medium ${net >= 0 ? "text-success" : "text-danger"}`}
                        >
                          {formatMoneyCompact(net)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>

        {/* ----------------------------------------------------- Staff tab */}
        <TabsContent value="staff" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by specialist</CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalRevenueBars
                data={performers.map((p) => ({
                  name: p.staff.name.split(" ")[0],
                  services: p.serviceRevenue,
                  retail: p.retailRevenue,
                }))}
                height={Math.max(220, performers.length * 46)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Commission report</CardTitle>
              <Badge variant="warning">{formatMoney(commissionTotal)} payable</Badge>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Services</TableHead>
                  <TableHead className="text-right">Retail</TableHead>
                  <TableHead className="text-right">Total sales</TableHead>
                  <TableHead className="text-right">Clients</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performers.length === 0 && (
                  <TableEmpty colSpan={9}>No attributed sales in this period.</TableEmpty>
                )}
                {performers.map((row) => (
                  <TableRow key={row.staff.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={row.staff.name} size="sm" />
                        <span className="font-medium text-ink">{row.staff.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted">{row.staff.role}</TableCell>
                    <TableCell className="tabular text-right text-muted">
                      {(row.staff.commissionRate * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className="tabular text-right text-muted">
                      {formatMoney(row.serviceRevenue)}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted">
                      {formatMoney(row.retailRevenue)}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium text-ink">
                      {formatMoney(row.serviceRevenue + row.retailRevenue)}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted">
                      {row.clientCount}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted">
                      {row.appointmentsCompleted}
                    </TableCell>
                    <TableCell className="tabular text-right font-semibold text-gold">
                      {formatMoney(row.commission)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Client activity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-4">
              <Metric label="Unique clients served" value={String(current.uniqueClients)} icon={Users} />
              <Metric label="Appointments" value={String(current.appointmentCount)} icon={Users} />
              <Metric
                label="Completion rate"
                value={
                  current.appointmentCount
                    ? `${((current.completedCount / current.appointmentCount) * 100).toFixed(0)}%`
                    : "—"
                }
                icon={TrendingUp}
              />
              <Metric
                label="No-show rate"
                value={
                  current.appointmentCount
                    ? `${((current.noShowCount / current.appointmentCount) * 100).toFixed(0)}%`
                    : "—"
                }
                icon={TrendingDown}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PnlRow({
  label,
  value,
  bold,
  big,
  muted,
}: {
  label: string;
  value: number;
  bold?: boolean;
  big?: boolean;
  muted?: boolean;
}) {
  const negative = value < 0;
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-faint" : "text-muted"}>{label}</span>
      <span
        className={[
          "tabular",
          big ? "text-lg" : "",
          bold ? "font-semibold" : "",
          muted ? "text-faint" : negative ? "text-danger" : bold ? "text-gold" : "text-ink",
        ].join(" ")}
      >
        {negative ? `- ${formatMoney(Math.abs(value))}` : formatMoney(value)}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-obsidian-elevated p-4">
      <Icon className="size-4 text-gold" />
      <p className="tabular mt-2 text-xl font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-faint">{label}</p>
    </div>
  );
}
