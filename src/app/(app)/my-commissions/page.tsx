"use client";

import * as React from "react";
import { CalendarCheck, Percent, TrendingUp, UserX, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, SectionHeading } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ProtectedRoute, useAuth } from "@/lib/auth/context";
import { useLookups, useSalon } from "@/lib/data/store";
import { computeTotals, lineCommission, lineNet } from "@/lib/billing";
import { periodRange, type PeriodKey } from "@/lib/data/analytics";
import { formatDate, formatDateTime } from "@/lib/date";
import { formatMoney, formatMoneyCompact, round2 } from "@/lib/utils";

/**
 * A beautician's own earnings only.
 *
 * Every figure is derived from invoice lines tagged with this member's
 * `staffId`, so it never exposes salon-wide revenue, other stylists' numbers
 * or anything from the financial dashboards.
 */
export default function MyCommissionsPage() {
  return (
    <ProtectedRoute requires={["commissions.view.own", "commissions.view.all"]}>
      <MyCommissionsView />
    </ProtectedRoute>
  );
}

function MyCommissionsView() {
  const { user } = useAuth();
  const { invoices, staff, appointments } = useSalon();
  const { clientById } = useLookups();

  const [period, setPeriod] = React.useState<PeriodKey>("month");
  const now = React.useMemo(() => new Date(), []);
  const range = React.useMemo(() => periodRange(period, now), [period, now]);

  const staffId = user.staffId;
  const me = staff.find((s) => s.id === staffId);

  /** Flattens my tagged lines out of every invoice in the period. */
  const entries = React.useMemo(() => {
    if (!staffId) return [];

    const rows: Array<{
      invoiceId: string;
      invoiceNumber: string;
      at: string;
      client: string;
      item: string;
      kind: string;
      net: number;
      rate: number;
      commission: number;
    }> = [];

    for (const invoice of invoices) {
      if (invoice.status === "VOID") continue;
      const at = new Date(invoice.createdAt).getTime();
      if (at < range.from.getTime() || at > range.to.getTime()) continue;

      const { netSubtotal, invoiceDiscount } = computeTotals(
        invoice.lines,
        invoice.discount,
        invoice.taxRate,
        invoice.payments,
      );
      if (netSubtotal <= 0) continue;

      for (const line of invoice.lines) {
        if (line.staffId !== staffId) continue;
        rows.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          at: invoice.createdAt,
          client: clientById.get(invoice.clientId)?.name ?? "Walk-in",
          item: line.name,
          kind: line.kind,
          net: lineNet(line),
          rate: line.commissionRate,
          commission: lineCommission(line, netSubtotal, invoiceDiscount),
        });
      }
    }

    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }, [invoices, staffId, range, clientById]);

  const totalCommission = round2(entries.reduce((sum, e) => sum + e.commission, 0));
  const totalSales = round2(entries.reduce((sum, e) => sum + e.net, 0));
  const serviceCount = entries.filter((e) => e.kind !== "PRODUCT").length;
  const retailCount = entries.filter((e) => e.kind === "PRODUCT").length;

  const completedAppointments = React.useMemo(
    () =>
      staffId
        ? appointments.filter((a) => {
            if (a.staffId !== staffId || a.status !== "COMPLETED") return false;
            const at = new Date(a.start).getTime();
            return at >= range.from.getTime() && at <= range.to.getTime();
          }).length
        : 0,
    [appointments, staffId, range],
  );

  if (!staffId) {
    return (
      <EmptyState
        icon={UserX}
        title="No staff record linked to your account"
        description="Ask the salon owner to link your login to your staff profile so your commission appears here."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
            My commissions
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {formatDate(range.from)} — {formatDate(range.to)}
            {me && (
              <>
                {" · "}
                <span className="text-gold">{(me.commissionRate * 100).toFixed(0)}%</span> service
                rate
              </>
            )}
          </p>
        </div>

        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">7 days</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="quarter">Quarter</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Commission earned"
          value={formatMoney(totalCommission)}
          icon={Percent}
          sublabel={`${entries.length} tagged items`}
          tone="gold"
        />
        <KpiCard
          label="Sales attributed"
          value={formatMoneyCompact(totalSales)}
          icon={TrendingUp}
          sublabel={`${serviceCount} services · ${retailCount} retail`}
          tone="success"
        />
        <KpiCard
          label="Appointments completed"
          value={String(completedAppointments)}
          icon={CalendarCheck}
          tone="gold"
        />
        <KpiCard
          label="Average per item"
          value={entries.length ? formatMoney(round2(totalCommission / entries.length)) : "—"}
          icon={Wallet}
          tone="gold"
        />
      </div>

      <Card className="border-gold/20 bg-gradient-to-br from-gold/[0.06] to-transparent p-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-gold/70">
          Payable this period
        </p>
        <p className="tabular mt-1 text-3xl font-semibold text-gilded">
          {formatMoney(totalCommission)}
        </p>
        <p className="mt-2 text-xs text-faint">
          Commission is calculated on each item&apos;s share of the bill after discounts, so a
          discount on a ticket is shared proportionally rather than taken from one stylist.
        </p>
      </Card>

      <SectionHeading
        title="Earnings breakdown"
        description="Every invoice line tagged to you in this period."
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Net value</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableEmpty colSpan={8}>
                No commission recorded in this period. Completed services billed to your name will
                appear here.
              </TableEmpty>
            )}
            {entries.slice(0, 80).map((entry, index) => (
              <TableRow key={`${entry.invoiceId}-${index}`}>
                <TableCell className="tabular whitespace-nowrap text-xs text-muted">
                  {formatDateTime(entry.at)}
                </TableCell>
                <TableCell className="font-mono text-xs text-faint">
                  {entry.invoiceNumber}
                </TableCell>
                <TableCell className="text-ink">{entry.client}</TableCell>
                <TableCell className="text-muted">{entry.item}</TableCell>
                <TableCell>
                  <Badge variant={entry.kind === "PRODUCT" ? "neutral" : "default"}>
                    {entry.kind === "PRODUCT" ? "Retail" : "Service"}
                  </Badge>
                </TableCell>
                <TableCell className="tabular text-right text-muted">
                  {formatMoney(entry.net)}
                </TableCell>
                <TableCell className="tabular text-right text-faint">
                  {(entry.rate * 100).toFixed(0)}%
                </TableCell>
                <TableCell className="tabular text-right font-semibold text-gold">
                  {formatMoney(entry.commission)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {entries.length > 80 && (
          <p className="border-t border-hairline px-4 py-2.5 text-xs text-faint">
            Showing the 80 most recent of {entries.length} entries.
          </p>
        )}
      </Card>
    </div>
  );
}
