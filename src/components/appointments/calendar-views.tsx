"use client";

import * as React from "react";
import { Avatar } from "@/components/ui/misc";
import { APPOINTMENT_STATUS_META } from "@/components/appointments/status";
import {
  addDays,
  eachDay,
  formatHour,
  formatTime,
  isSameDay,
  isSameMonth,
  minutesSinceMidnight,
  monthGrid,
  startOfWeek,
  WEEKDAYS,
} from "@/lib/date";
import { CLOSE_HOUR, OPEN_HOUR } from "@/lib/data/seed";
import { cn, formatDuration, formatMoney } from "@/lib/utils";
import type { Appointment, Client, Service, Staff } from "@/lib/types";

const HOUR_HEIGHT = 68; // px per hour in the day/week grids
const OPEN_MINUTES = OPEN_HOUR * 60;
const TOTAL_MINUTES = (CLOSE_HOUR - OPEN_HOUR) * 60;

export interface CalendarContext {
  clientById: Map<string, Client>;
  staffById: Map<string, Staff>;
  serviceById: Map<string, Service>;
}

/** Converts a booking into `top`/`height` inside an open-hours column. */
function blockGeometry(appointment: Appointment) {
  const startMin = minutesSinceMidnight(appointment.start);
  const offset = Math.max(0, startMin - OPEN_MINUTES);
  const visible = Math.min(appointment.durationMin, TOTAL_MINUTES - offset);
  return {
    top: (offset / 60) * HOUR_HEIGHT,
    height: Math.max(22, (visible / 60) * HOUR_HEIGHT - 3),
  };
}

/**
 * Lays overlapping bookings side by side.
 *
 * Without this, two clients booked with the same stylist at the same hour
 * would render one on top of the other and hide a real double-booking.
 */
function withColumns(appointments: Appointment[]) {
  const sorted = [...appointments].sort((a, b) => a.start.localeCompare(b.start));
  const laid: Array<{ appointment: Appointment; column: number; columns: number }> = [];
  let cluster: Appointment[] = [];
  let clusterEnd = 0;

  const flush = () => {
    if (!cluster.length) return;
    const columnEnds: number[] = [];
    const assignment = new Map<string, number>();

    for (const item of cluster) {
      const start = new Date(item.start).getTime();
      const end = start + item.durationMin * 60000;
      let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(end);
      } else {
        columnEnds[column] = end;
      }
      assignment.set(item.id, column);
    }

    for (const item of cluster) {
      laid.push({
        appointment: item,
        column: assignment.get(item.id) ?? 0,
        columns: columnEnds.length,
      });
    }
    cluster = [];
    clusterEnd = 0;
  };

  for (const item of sorted) {
    const start = new Date(item.start).getTime();
    const end = start + item.durationMin * 60000;
    if (cluster.length && start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();

  return laid;
}

/* ------------------------------------------------------------ Time gutter */

function TimeGutter() {
  return (
    <div className="w-14 shrink-0 border-r border-hairline">
      <div className="h-10 border-b border-hairline" />
      {Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => (
        <div
          key={i}
          className="relative border-b border-hairline/60"
          style={{ height: HOUR_HEIGHT }}
        >
          <span className="absolute -top-2 right-2 text-[10px] tabular text-faint">
            {formatHour(OPEN_HOUR + i)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- Day view */

export function DayView({
  day,
  appointments,
  staff,
  context,
  onSelect,
  onCreate,
}: {
  day: Date;
  appointments: Appointment[];
  staff: Staff[];
  context: CalendarContext;
  onSelect: (appointment: Appointment) => void;
  onCreate: (start: Date, staffId: string) => void;
}) {
  const dayAppointments = appointments.filter((a) => isSameDay(a.start, day));

  return (
    <div className="flex overflow-x-auto">
      <TimeGutter />

      <div className="flex min-w-0 flex-1">
        {staff.map((member) => {
          const own = dayAppointments.filter((a) => a.staffId === member.id);
          const laid = withColumns(own);

          return (
            <div
              key={member.id}
              className="min-w-[168px] flex-1 border-r border-hairline last:border-r-0"
            >
              {/* Column head */}
              <div className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b border-hairline bg-charcoal px-2">
                <Avatar name={member.name} size="xs" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">
                    {member.name.split(" ")[0]}
                  </p>
                  <p className="truncate text-[9px] text-faint">{own.length} booked</p>
                </div>
              </div>

              {/* Slots */}
              <div className="relative">
                {Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const start = new Date(day);
                      start.setHours(OPEN_HOUR + i, 0, 0, 0);
                      onCreate(start, member.id);
                    }}
                    className="block w-full border-b border-hairline/60 transition-colors hover:bg-gold/[0.04]"
                    style={{ height: HOUR_HEIGHT }}
                    aria-label={`Book ${member.name} at ${formatHour(OPEN_HOUR + i)}`}
                  />
                ))}

                {laid.map(({ appointment, column, columns }) => (
                  <AppointmentBlock
                    key={appointment.id}
                    appointment={appointment}
                    context={context}
                    onSelect={onSelect}
                    style={{
                      ...blockGeometry(appointment),
                      left: `calc(${(column / columns) * 100}% + 2px)`,
                      width: `calc(${100 / columns}% - 4px)`,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Week view */

export function WeekView({
  anchor,
  appointments,
  context,
  onSelect,
  onCreate,
}: {
  anchor: Date;
  appointments: Appointment[];
  context: CalendarContext;
  onSelect: (appointment: Appointment) => void;
  onCreate: (start: Date) => void;
}) {
  const weekStart = startOfWeek(anchor);
  const days = eachDay(weekStart, addDays(weekStart, 6));
  const today = new Date();

  return (
    <div className="flex overflow-x-auto">
      <TimeGutter />

      <div className="flex min-w-0 flex-1">
        {days.map((day) => {
          const own = appointments.filter((a) => isSameDay(a.start, day));
          const laid = withColumns(own);
          const isToday = isSameDay(day, today);

          return (
            <div
              key={day.toISOString()}
              className="min-w-[132px] flex-1 border-r border-hairline last:border-r-0"
            >
              <div
                className={cn(
                  "sticky top-0 z-10 flex h-10 flex-col items-center justify-center border-b border-hairline bg-charcoal",
                  isToday && "bg-gold/[0.08]",
                )}
              >
                <span className="text-[10px] uppercase tracking-wider text-faint">
                  {WEEKDAYS[day.getDay()]}
                </span>
                <span
                  className={cn(
                    "tabular text-xs font-semibold",
                    isToday ? "text-gold" : "text-ink",
                  )}
                >
                  {day.getDate()}
                </span>
              </div>

              <div className="relative">
                {Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const start = new Date(day);
                      start.setHours(OPEN_HOUR + i, 0, 0, 0);
                      onCreate(start);
                    }}
                    className={cn(
                      "block w-full border-b border-hairline/60 transition-colors hover:bg-gold/[0.04]",
                      isToday && "bg-gold/[0.015]",
                    )}
                    style={{ height: HOUR_HEIGHT }}
                    aria-label={`Book ${day.getDate()} at ${formatHour(OPEN_HOUR + i)}`}
                  />
                ))}

                {laid.map(({ appointment, column, columns }) => (
                  <AppointmentBlock
                    key={appointment.id}
                    appointment={appointment}
                    context={context}
                    compact
                    onSelect={onSelect}
                    style={{
                      ...blockGeometry(appointment),
                      left: `calc(${(column / columns) * 100}% + 1px)`,
                      width: `calc(${100 / columns}% - 2px)`,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Month view */

export function MonthView({
  anchor,
  appointments,
  context,
  onSelectDay,
  onSelect,
}: {
  anchor: Date;
  appointments: Appointment[];
  context: CalendarContext;
  onSelectDay: (day: Date) => void;
  onSelect: (appointment: Appointment) => void;
}) {
  const cells = monthGrid(anchor);
  const today = new Date();

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-hairline">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <div
            key={label}
            className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-faint"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day) => {
          const own = appointments
            .filter((a) => isSameDay(a.start, day))
            .sort((a, b) => a.start.localeCompare(b.start));
          const outside = !isSameMonth(day, anchor);
          const isToday = isSameDay(day, today);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[112px] border-b border-r border-hairline p-1.5 transition-colors last:border-r-0 hover:bg-white/[0.02]",
                outside && "bg-obsidian/40",
              )}
            >
              <button
                onClick={() => onSelectDay(day)}
                className="mb-1 flex w-full items-center justify-between"
              >
                <span
                  className={cn(
                    "tabular inline-flex size-5 items-center justify-center rounded-full text-[11px]",
                    isToday
                      ? "bg-gold font-semibold text-obsidian"
                      : outside
                        ? "text-faint"
                        : "text-muted",
                  )}
                >
                  {day.getDate()}
                </span>
                {own.length > 0 && (
                  <span className="tabular text-[10px] text-faint">{own.length}</span>
                )}
              </button>

              <div className="space-y-0.5">
                {own.slice(0, 3).map((appointment) => {
                  const meta = APPOINTMENT_STATUS_META[appointment.status];
                  return (
                    <button
                      key={appointment.id}
                      onClick={() => onSelect(appointment)}
                      className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] transition-colors hover:bg-white/5"
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: meta.dot }}
                        aria-hidden
                      />
                      <span className="tabular shrink-0 text-faint">
                        {formatTime(appointment.start).replace(":00", "")}
                      </span>
                      <span className="truncate text-muted">
                        {context.clientById.get(appointment.clientId)?.name.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
                {own.length > 3 && (
                  <button
                    onClick={() => onSelectDay(day)}
                    className="px-1 text-[10px] text-gold hover:underline"
                  >
                    +{own.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Booking block */

function AppointmentBlock({
  appointment,
  context,
  onSelect,
  style,
  compact,
}: {
  appointment: Appointment;
  context: CalendarContext;
  onSelect: (appointment: Appointment) => void;
  style: React.CSSProperties;
  compact?: boolean;
}) {
  const meta = APPOINTMENT_STATUS_META[appointment.status];
  const client = context.clientById.get(appointment.clientId);
  const serviceNames = appointment.serviceIds
    .map((id) => context.serviceById.get(id)?.name)
    .filter(Boolean)
    .join(", ");
  const value = appointment.serviceIds.reduce(
    (sum, id) => sum + (context.serviceById.get(id)?.price ?? 0),
    0,
  );

  const cancelled = appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";

  return (
    <button
      onClick={() => onSelect(appointment)}
      style={style}
      title={`${client?.name} · ${serviceNames} · ${formatTime(appointment.start)} (${formatDuration(appointment.durationMin)}) · ${formatMoney(value)}`}
      className={cn(
        "absolute z-[5] overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left transition-all duration-150",
        "hover:z-10 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] hover:brightness-125",
        cancelled && "opacity-55 saturate-50",
      )}
      data-status={appointment.status}
    >
      <span
        className="absolute inset-0 -z-10"
        style={{ background: `color-mix(in srgb, ${meta.dot} 16%, #1a1a1a)` }}
        aria-hidden
      />
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: meta.dot }}
        aria-hidden
      />

      <p
        className={cn(
          "truncate text-[11px] font-medium text-ink",
          cancelled && "line-through decoration-1",
        )}
      >
        {client?.name ?? "Walk-in"}
      </p>
      {!compact && (
        <p className="truncate text-[10px] text-muted">{serviceNames}</p>
      )}
      <p className="tabular truncate text-[9px] text-faint">
        {formatTime(appointment.start)} · {formatDuration(appointment.durationMin)}
      </p>
    </button>
  );
}
