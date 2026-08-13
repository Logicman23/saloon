"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  PlayCircle,
  UserX,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, EmptyState, SectionHeading } from "@/components/ui/misc";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AppointmentStatusBadge } from "@/components/appointments/status";
import { ProtectedRoute, useAuth } from "@/lib/auth/context";
import { useLookups, useSalon } from "@/lib/data/store";
import {
  addDays,
  eachDay,
  formatDateLong,
  formatDateShort,
  formatTime,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "@/lib/date";
import { cn, formatDuration, formatMoney } from "@/lib/utils";
import type { Appointment, AppointmentStatus } from "@/lib/types";

/**
 * The beautician's home screen: only their own chair, with the two status
 * transitions they are allowed to make.
 */
export default function MySchedulePage() {
  return (
    <ProtectedRoute requires={["appointments.view.own", "appointments.view.all"]}>
      <MyScheduleView />
    </ProtectedRoute>
  );
}

function MyScheduleView() {
  const { user, can } = useAuth();
  const { appointments, actions } = useSalon();
  const { clientById, serviceById } = useLookups();

  const [range, setRange] = React.useState<"day" | "week">("day");
  const [anchor, setAnchor] = React.useState(() => startOfDay(new Date()));

  const staffId = user.staffId;

  /**
   * Scoped to the signed-in member's `staffId`. A user with no linked staff
   * record sees nothing rather than everything — failing closed matters more
   * than a tidy empty state.
   */
  const mine = React.useMemo(
    () => (staffId ? appointments.filter((a) => a.staffId === staffId) : []),
    [appointments, staffId],
  );

  const days = React.useMemo(() => {
    if (range === "day") return [anchor];
    const start = startOfWeek(anchor);
    return eachDay(start, addDays(start, 6));
  }, [range, anchor]);

  const visible = React.useMemo(
    () =>
      mine
        .filter((a) => days.some((day) => isSameDay(a.start, day)))
        .sort((a, b) => a.start.localeCompare(b.start)),
    [mine, days],
  );

  const valueOf = React.useCallback(
    (appointment: Appointment) =>
      appointment.serviceIds.reduce((sum, id) => sum + (serviceById.get(id)?.price ?? 0), 0),
    [serviceById],
  );

  const active = visible.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW");
  const chairMinutes = active.reduce((sum, a) => sum + a.durationMin, 0);
  const chairValue = active.reduce((sum, a) => sum + valueOf(a), 0);
  const completed = visible.filter((a) => a.status === "COMPLETED").length;

  const step = (direction: 1 | -1) =>
    setAnchor((d) => addDays(d, range === "week" ? direction * 7 : direction));

  const setStatus = (appointment: Appointment, status: AppointmentStatus) => {
    actions.setAppointmentStatus(appointment.id, status);
    const client = clientById.get(appointment.clientId)?.name ?? "Client";
    toast.success(
      status === "IN_PROGRESS"
        ? `Started ${client}'s appointment`
        : status === "COMPLETED"
          ? `Completed ${client}'s appointment`
          : `Marked ${client} as no-show`,
    );
  };

  if (!staffId) {
    return (
      <EmptyState
        icon={UserX}
        title="No staff record linked to your account"
        description="Ask the salon owner to link your login to your staff profile so your schedule appears here."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-gold/70">
          {formatDateLong(new Date())}
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Your chair, <span className="text-gilded">{user.name.split(" ")[0]}</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {active.length} appointment{active.length === 1 ? "" : "s"} ·{" "}
          {formatDuration(chairMinutes)} of chair time
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={range === "day" ? "Today's bookings" : "This week's bookings"}
          value={String(active.length)}
          icon={CalendarClock}
          tone="gold"
        />
        <KpiCard label="Chair time" value={formatDuration(chairMinutes)} icon={Clock} tone="gold" />
        <KpiCard
          label="Completed"
          value={`${completed}/${active.length}`}
          icon={CheckCircle2}
          tone="success"
        />
        {can("commissions.view.own") && (
          <KpiCard
            label="Service value"
            value={formatMoney(chairValue)}
            icon={Users}
            sublabel="before discounts"
            tone="gold"
          />
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="icon" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="icon" onClick={() => step(1)} aria-label="Next">
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAnchor(startOfDay(new Date()))}
            className="ml-1"
          >
            Today
          </Button>
        </div>

        <p className="min-w-0 flex-1 truncate text-sm text-muted">
          {range === "day"
            ? formatDateLong(anchor)
            : `${formatDateShort(days[0])} – ${formatDateShort(days[days.length - 1])}`}
        </p>

        <Tabs value={range} onValueChange={(v) => setRange(v as "day" | "week")}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Schedule */}
      {days.map((day) => {
        const forDay = visible.filter((a) => isSameDay(a.start, day));
        if (range === "week" && forDay.length === 0) return null;

        return (
          <div key={day.toISOString()} className="space-y-2">
            {range === "week" && (
              <SectionHeading
                title={formatDateShort(day)}
                description={`${forDay.length} booking${forDay.length === 1 ? "" : "s"}`}
              />
            )}

            {forDay.length === 0 ? (
              <Card>
                <EmptyState
                  icon={CalendarClock}
                  title="Nothing booked"
                  description="You have no appointments scheduled for this day."
                />
              </Card>
            ) : (
              <div className="space-y-2">
                {forDay.map((appointment) => {
                  const client = clientById.get(appointment.clientId);
                  const services = appointment.serviceIds
                    .map((id) => serviceById.get(id)?.name)
                    .filter(Boolean);
                  const closed =
                    appointment.status === "COMPLETED" ||
                    appointment.status === "CANCELLED" ||
                    appointment.status === "NO_SHOW";

                  return (
                    <Card
                      key={appointment.id}
                      className={cn("p-4", closed && "opacity-70")}
                      interactive
                    >
                      <div className="flex flex-wrap items-start gap-4">
                        {/* Time */}
                        <div className="w-16 shrink-0 text-center">
                          <p className="tabular text-base font-semibold text-gold">
                            {formatTime(appointment.start)}
                          </p>
                          <p className="text-[10px] text-faint">
                            {formatDuration(appointment.durationMin)}
                          </p>
                        </div>

                        {/* Client + services */}
                        <div className="min-w-[180px] flex-1">
                          <div className="flex items-center gap-2">
                            <Avatar name={client?.name ?? "Walk-in"} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">
                                {client?.name ?? "Walk-in"}
                              </p>
                              <p className="truncate text-xs text-muted">
                                {services.join(", ")}
                              </p>
                            </div>
                          </div>

                          {client?.notes && (
                            <p className="mt-2 rounded-md border border-warning/20 bg-warning/[0.06] p-2 text-[11px] text-warning">
                              {client.notes}
                            </p>
                          )}
                          {appointment.notes && (
                            <p className="mt-1.5 text-[11px] text-faint">{appointment.notes}</p>
                          )}
                        </div>

                        {/* Status + actions */}
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <AppointmentStatusBadge status={appointment.status} />

                          {can("appointments.status.own") && !closed && (
                            <div className="flex gap-1.5">
                              {appointment.status === "SCHEDULED" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setStatus(appointment, "IN_PROGRESS")}
                                  >
                                    <PlayCircle /> Start
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setStatus(appointment, "NO_SHOW")}
                                  >
                                    No-show
                                  </Button>
                                </>
                              )}
                              {appointment.status === "IN_PROGRESS" && (
                                <Button
                                  size="sm"
                                  variant="success"
                                  onClick={() => setStatus(appointment, "COMPLETED")}
                                >
                                  <CheckCircle2 /> Complete
                                </Button>
                              )}
                            </div>
                          )}

                          {can("commissions.view.own") && (
                            <Badge variant="neutral" className="text-[10px]">
                              {formatMoney(valueOf(appointment))}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {range === "week" && visible.length === 0 && (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="Nothing booked this week"
            description="Your week is clear. Bookings appear here as reception adds them."
          />
        </Card>
      )}
    </div>
  );
}
