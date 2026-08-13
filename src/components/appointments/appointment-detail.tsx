"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Clock, Pencil, Phone, Receipt, Sparkles, User } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, Label, Separator } from "@/components/ui/misc";
import { AppointmentStatusBadge, APPOINTMENT_STATUS_META } from "@/components/appointments/status";
import { useLookups, useSalon } from "@/lib/data/store";
import { clientStats } from "@/lib/data/analytics";
import { formatDateLong, formatTime, addMinutes } from "@/lib/date";
import { cn, formatDuration, formatMoney } from "@/lib/utils";
import { APPOINTMENT_STATUSES, type Appointment, type AppointmentStatus } from "@/lib/types";

export function AppointmentDetail({
  appointment,
  open,
  onOpenChange,
  onEdit,
}: {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (appointment: Appointment) => void;
}) {
  const { invoices, appointments, actions } = useSalon();
  const { clientById, staffById, serviceById } = useLookups();

  if (!appointment) return null;

  const client = clientById.get(appointment.clientId);
  const member = staffById.get(appointment.staffId);
  const services = appointment.serviceIds
    .map((id) => serviceById.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const value = services.reduce((sum, s) => sum + s.price, 0);
  const stats = client ? clientStats(invoices, appointments, client.id) : null;
  const invoice = invoices.find((i) => i.appointmentId === appointment.id);
  const end = addMinutes(appointment.start, appointment.durationMin);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle>{client?.name ?? "Walk-in"}</DialogTitle>
              <p className="mt-0.5 text-sm text-muted">
                {formatDateLong(appointment.start)} · {formatTime(appointment.start)} –{" "}
                {formatTime(end)}
              </p>
            </div>
            <AppointmentStatusBadge status={appointment.status} />
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Status transitions */}
          <div>
            <Label className="mb-2 block">Move to</Label>
            <div className="flex flex-wrap gap-1.5">
              {APPOINTMENT_STATUSES.map((status) => {
                const meta = APPOINTMENT_STATUS_META[status];
                const active = appointment.status === status;
                return (
                  <button
                    key={status}
                    onClick={() => actions.setAppointmentStatus(appointment.id, status)}
                    disabled={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                      active
                        ? "cursor-default border-gold/50 bg-gold/12 text-gold-light"
                        : "border-hairline text-muted hover:border-hairline-strong hover:text-ink",
                    )}
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: meta.dot }}
                      aria-hidden
                    />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Facts */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Fact icon={User} label="Client">
              <div className="flex items-center gap-2">
                <Avatar name={client?.name ?? "?"} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{client?.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-faint">
                    <Phone className="size-3" />
                    {client?.phone}
                  </p>
                </div>
              </div>
            </Fact>

            <Fact icon={Sparkles} label="Specialist">
              <div className="flex items-center gap-2">
                <Avatar name={member?.name ?? "?"} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{member?.name}</p>
                  <p className="truncate text-xs text-faint">{member?.role}</p>
                </div>
              </div>
            </Fact>
          </div>

          {/* Services */}
          <div>
            <Label className="mb-2 block">Services booked</Label>
            <div className="space-y-1.5">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center gap-3 rounded-lg border border-hairline bg-obsidian-elevated p-2.5"
                >
                  <Badge variant="neutral" className="shrink-0 text-[10px]">
                    {service.category}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{service.name}</span>
                  <span className="shrink-0 text-xs text-faint">
                    {formatDuration(service.durationMin)}
                  </span>
                  <span className="tabular shrink-0 text-sm text-muted">
                    {formatMoney(service.price)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-center justify-between rounded-lg border border-gold/25 bg-gold/[0.05] px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-muted">
                <Clock className="size-4 text-gold" />
                {formatDuration(appointment.durationMin)} chair time
              </span>
              <span className="tabular font-semibold text-gold">{formatMoney(value)}</span>
            </div>
          </div>

          {appointment.notes && (
            <div className="rounded-lg border border-hairline bg-obsidian-elevated p-3">
              <Label className="mb-1 block">Booking note</Label>
              <p className="text-sm text-muted">{appointment.notes}</p>
            </div>
          )}

          {client?.notes && (
            <div className="rounded-lg border border-warning/25 bg-warning/[0.06] p-3">
              <Label className="mb-1 block text-warning">Client preference</Label>
              <p className="text-sm text-warning/90">{client.notes}</p>
            </div>
          )}

          {stats && stats.visitCount > 0 && (
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-hairline p-3 text-center">
              <Stat label="Visits" value={String(stats.visitCount)} />
              <Stat label="Lifetime spend" value={formatMoney(stats.totalSpend)} gold />
              <Stat label="Avg ticket" value={formatMoney(stats.averageTicket)} />
            </div>
          )}

          {invoice && (
            <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/[0.06] p-3">
              <Receipt className="size-4 shrink-0 text-success" />
              <span className="flex-1 text-sm text-success">
                Billed on {invoice.number}
              </span>
              <Button asChild variant="ghost" size="sm">
                <Link href="/invoices">View</Link>
              </Button>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
              onEdit(appointment);
            }}
          >
            <Pencil /> Edit booking
          </Button>
          {!invoice && appointment.status !== "CANCELLED" && (
            <Button asChild>
              <Link href="/pos">
                <CalendarClock /> Check out
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-obsidian-elevated p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <Icon className="size-3" />
        {label}
      </p>
      {children}
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div>
      <p className={cn("tabular text-sm font-semibold", gold ? "text-gold" : "text-ink")}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-faint">{label}</p>
    </div>
  );
}
