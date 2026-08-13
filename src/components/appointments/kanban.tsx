"use client";

import * as React from "react";
import { Clock, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { APPOINTMENT_STATUS_META } from "@/components/appointments/status";
import { formatTime } from "@/lib/date";
import { cn, formatDuration, formatMoney } from "@/lib/utils";
import { APPOINTMENT_STATUSES, type Appointment, type AppointmentStatus } from "@/lib/types";
import type { CalendarContext } from "@/components/appointments/calendar-views";

/**
 * Status board for a single day. Cards are draggable between columns via the
 * native HTML5 drag API — no dependency, and it degrades to the click-through
 * detail sheet on touch devices.
 */
export function KanbanBoard({
  appointments,
  context,
  onSelect,
  onStatusChange,
}: {
  appointments: Appointment[];
  context: CalendarContext;
  onSelect: (appointment: Appointment) => void;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
}) {
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overColumn, setOverColumn] = React.useState<AppointmentStatus | null>(null);

  const columns = React.useMemo(
    () =>
      APPOINTMENT_STATUSES.map((status) => ({
        status,
        meta: APPOINTMENT_STATUS_META[status],
        items: appointments
          .filter((a) => a.status === status)
          .sort((a, b) => a.start.localeCompare(b.start)),
      })),
    [appointments],
  );

  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {columns.map((column) => {
        const value = column.items.reduce(
          (sum, appointment) =>
            sum +
            appointment.serviceIds.reduce(
              (inner, id) => inner + (context.serviceById.get(id)?.price ?? 0),
              0,
            ),
          0,
        );

        return (
          <div
            key={column.status}
            onDragOver={(e) => {
              e.preventDefault();
              setOverColumn(column.status);
            }}
            onDragLeave={() => setOverColumn((c) => (c === column.status ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) onStatusChange(dragId, column.status);
              setDragId(null);
              setOverColumn(null);
            }}
            className={cn(
              "flex flex-col rounded-xl border bg-obsidian-elevated transition-colors",
              overColumn === column.status
                ? "border-gold/50 bg-gold/[0.04]"
                : "border-hairline",
            )}
          >
            {/* Column head */}
            <div className="flex items-center gap-2 border-b border-hairline p-3">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: column.meta.dot }}
                aria-hidden
              />
              <p className="flex-1 truncate text-sm font-medium text-ink">{column.meta.label}</p>
              <Badge variant="neutral" className="shrink-0">
                {column.items.length}
              </Badge>
            </div>

            {value > 0 && (
              <p className="tabular border-b border-hairline px-3 py-1.5 text-[11px] text-faint">
                {formatMoney(value)} of chair value
              </p>
            )}

            {/* Cards */}
            <div className="min-h-[120px] flex-1 space-y-2 p-2">
              {column.items.length === 0 && (
                <EmptyState title="Empty" className="px-2 py-8 text-xs" />
              )}

              {column.items.map((appointment) => {
                const client = context.clientById.get(appointment.clientId);
                const member = context.staffById.get(appointment.staffId);
                const services = appointment.serviceIds
                  .map((id) => context.serviceById.get(id)?.name)
                  .filter(Boolean);

                return (
                  <div
                    key={appointment.id}
                    draggable
                    onDragStart={() => setDragId(appointment.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverColumn(null);
                    }}
                    onClick={() => onSelect(appointment)}
                    className={cn(
                      "group cursor-pointer rounded-lg border border-hairline bg-charcoal p-2.5 transition-all",
                      "hover:border-gold/35 hover:shadow-[0_8px_24px_-16px_rgba(212,175,55,0.8)]",
                      dragId === appointment.id && "opacity-40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {client?.name ?? "Walk-in"}
                        </p>
                        <p className="truncate text-[11px] text-muted">{services.join(", ")}</p>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="tabular flex items-center gap-1 text-[10px] text-faint">
                        <Clock className="size-3" />
                        {formatTime(appointment.start)}
                      </span>
                      <span className="text-[10px] text-faint">
                        {formatDuration(appointment.durationMin)}
                      </span>
                      {member && (
                        <span className="ml-auto flex items-center gap-1">
                          <Avatar name={member.name} size="xs" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
