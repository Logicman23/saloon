"use client";

import * as React from "react";
import {
  CalendarCheck,
  Pencil,
  Percent,
  Phone,
  Scissors,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, SectionHeading } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StaffDialog } from "@/components/staff/staff-dialog";
import { useSalon } from "@/lib/data/store";
import { ProtectedRoute, useAuth } from "@/lib/auth/context";
import { periodRange, staffPerformance, summarize } from "@/lib/data/analytics";
import { formatDate } from "@/lib/date";
import { formatMoney, formatMoneyCompact } from "@/lib/utils";
import type { Staff } from "@/lib/types";

export default function StaffPage() {
  return (
    <ProtectedRoute requires={["staff.view"]}>
      <StaffView />
    </ProtectedRoute>
  );
}

function StaffView() {
  const { staff, invoices, appointments, expenses } = useSalon();
  const { can } = useAuth();
  const canManage = can("staff.manage");
  const [staffOpen, setStaffOpen] = React.useState(false);
  const [editingMember, setEditingMember] = React.useState<Staff | null>(null);

  const now = React.useMemo(() => new Date(), []);
  const range = React.useMemo(() => periodRange("month", now), [now]);

  const performance = React.useMemo(
    () => staffPerformance({ invoices, appointments, staff }, range.from, range.to),
    [invoices, appointments, staff, range],
  );

  const summary = React.useMemo(
    () => summarize({ invoices, expenses, appointments }, range.from, range.to),
    [invoices, expenses, appointments, range],
  );

  const performanceById = React.useMemo(
    () => new Map(performance.map((p) => [p.staff.id, p])),
    [performance],
  );

  const payroll = staff.reduce((sum, s) => sum + s.monthlySalary, 0);
  const commissionTotal = performance.reduce((sum, p) => sum + p.commission, 0);
  const topPerformer = performance[0];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Team size" value={String(staff.length)} icon={Users} tone="gold" />
        <KpiCard
          label="Monthly payroll"
          value={formatMoneyCompact(payroll)}
          icon={Wallet}
          tone="warning"
        />
        <KpiCard
          label="Commission this month"
          value={formatMoneyCompact(commissionTotal)}
          icon={Percent}
          tone="gold"
        />
        <KpiCard
          label="Top performer"
          value={topPerformer?.staff.name.split(" ")[0] ?? "—"}
          sublabel={
            topPerformer
              ? formatMoneyCompact(topPerformer.serviceRevenue + topPerformer.retailRevenue)
              : undefined
          }
          icon={Scissors}
          tone="success"
        />
      </div>

      <SectionHeading
        title="The team"
        description={`Performance for ${range.label.toLowerCase()} — ${formatDate(range.from)} onward.`}
        actions={
          /* Presentation only — createStaffAction re-checks staff.manage. */
          canManage ? (
            <Button onClick={() => setStaffOpen(true)}>
              <UserPlus />
              New member
            </Button>
          ) : undefined
        }
      />

      <StaffDialog open={staffOpen} onOpenChange={setStaffOpen} />
      <StaffDialog
        member={editingMember}
        open={Boolean(editingMember)}
        onOpenChange={(open) => !open && setEditingMember(null)}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {staff.map((member) => {
          const stats = performanceById.get(member.id);
          const total = stats ? stats.serviceRevenue + stats.retailRevenue : 0;
          const share = summary.revenue > 0 ? (total / summary.revenue) * 100 : 0;

          return (
            <Card key={member.id} interactive className="flex flex-col">
              <CardHeader className="flex-row items-start gap-3">
                <Avatar name={member.name} size="lg" ring />
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate">{member.name}</CardTitle>
                  <p className="truncate text-sm text-muted">{member.role}</p>
                  <p className="mt-1 flex items-center gap-1 truncate text-xs text-faint">
                    <Phone className="size-3" />
                    {member.phone}
                  </p>
                </div>
                <Badge variant={member.active ? "success" : "neutral"} className="shrink-0">
                  {member.active ? "Active" : "Inactive"}
                </Badge>
              </CardHeader>

              <CardContent className="flex-1 space-y-3">
                {member.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {member.specialties.map((specialty) => (
                      <Badge key={specialty} variant="neutral" className="text-[10px]">
                        {specialty}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Tile label="Sales (month)" value={formatMoneyCompact(total)} gold />
                  <Tile
                    label="Commission"
                    value={formatMoneyCompact(stats?.commission ?? 0)}
                    gold
                  />
                  <Tile label="Clients served" value={String(stats?.clientCount ?? 0)} />
                  <Tile
                    label="Completed"
                    value={String(stats?.appointmentsCompleted ?? 0)}
                  />
                </div>

                {total > 0 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-faint">
                      <span>Share of salon revenue</span>
                      <span className="tabular">{share.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold-light"
                        style={{ width: `${Math.min(100, share)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1 border-t border-hairline pt-2.5 text-xs">
                  <Row label="Commission rate" value={`${(member.commissionRate * 100).toFixed(0)}%`} />
                  <Row
                    label="Monthly salary"
                    value={member.monthlySalary > 0 ? formatMoney(member.monthlySalary) : "—"}
                  />
                  <Row label="Joined" value={formatDate(member.joinedAt)} />
                </div>
              </CardContent>

              {canManage && (
                <CardFooter className="justify-end px-5 py-3">
                  <Button variant="ghost" size="sm" onClick={() => setEditingMember(member)}>
                    <Pencil />
                    Edit
                  </Button>
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-gold" />
            Payroll summary
          </CardTitle>
          <Badge variant="warning">
            {formatMoney(payroll + commissionTotal)} total monthly cost
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Tile label="Base salaries" value={formatMoney(payroll)} />
          <Tile label="Commission earned" value={formatMoney(commissionTotal)} gold />
          <Tile
            label="As % of revenue"
            value={
              summary.revenue > 0
                ? `${(((payroll + commissionTotal) / summary.revenue) * 100).toFixed(0)}%`
                : "—"
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-lg border border-hairline bg-obsidian-elevated p-2.5">
      <p className={`tabular text-sm font-semibold ${gold ? "text-gold" : "text-ink"}`}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-faint">{label}</span>
      <span className="tabular text-muted">{value}</span>
    </div>
  );
}
