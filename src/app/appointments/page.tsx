"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  LayoutGrid,
  Plus,
  Rows3,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DayView, MonthView, WeekView } from "@/components/appointments/calendar-views";
import { KanbanBoard } from "@/components/appointments/kanban";
import { BookingDialog } from "@/components/appointments/booking-dialog";
import { AppointmentDetail } from "@/components/appointments/appointment-detail";
import { APPOINTMENT_STATUS_META } from "@/components/appointments/status";
import { useLookups, useSalon } from "@/lib/data/store";
import {
  addDays,
  addMonths,
  formatDateLong,
  formatDateShort,
  formatMonthYear,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "@/lib/date";
import { formatMoney } from "@/lib/utils";
import { APPOINTMENT_STATUSES, type Appointment } from "@/lib/types";

type ViewMode = "day" | "week" | "month" | "board";

export default function AppointmentsPage() {
  const { appointments, staff, actions } = useSalon();
  const { clientById, staffById, serviceById } = useLookups();

  const [view, setView] = React.useState<ViewMode>("day");
  const [anchor, setAnchor] = React.useState<Date>(() => startOfDay(new Date()));
  const [staffFilter, setStaffFilter] = React.useState("all");

  const [bookingOpen, setBookingOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Appointment | undefined>();
  const [slotStart, setSlotStart] = React.useState<Date | undefined>();
  const [slotStaffId, setSlotStaffId] = React.useState<string | undefined>();

  const [detail, setDetail] = React.useState<Appointment | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const context = React.useMemo(
    () => ({ clientById, staffById, serviceById }),
    [clientById, staffById, serviceById],
  );

  const serviceStaff = React.useMemo(
    () => staff.filter((s) => s.active && s.specialties.length > 0),
    [staff],
  );

  const visibleStaff = React.useMemo(
    () => (staffFilter === "all" ? serviceStaff : serviceStaff.filter((s) => s.id === staffFilter)),
    [serviceStaff, staffFilter],
  );

  const filtered = React.useMemo(
    () => (staffFilter === "all" ? appointments : appointments.filter((a) => a.staffId === staffFilter)),
    [appointments, staffFilter],
  );

  const dayAppointments = React.useMemo(
    () => filtered.filter((a) => isSameDay(a.start, anchor)),
    [filtered, anchor],
  );

  /* ------------------------------------------------------------ Handlers */

  const openNewBooking = (start?: Date, staffId?: string) => {
    setEditing(undefined);
    setSlotStart(start);
    setSlotStaffId(staffId);
    setBookingOpen(true);
  };

  const openDetail = (appointment: Appointment) => {
    setDetail(appointment);
    setDetailOpen(true);
  };

  const step = (direction: 1 | -1) => {
    if (view === "month") setAnchor((d) => addMonths(d, direction));
    else if (view === "week") setAnchor((d) => addDays(d, direction * 7));
    else setAnchor((d) => addDays(d, direction));
  };

  const rangeLabel = React.useMemo(() => {
    if (view === "month") return formatMonthYear(anchor);
    if (view === "week") {
      const start = startOfWeek(anchor);
      return `${formatDateShort(start)} – ${formatDateShort(addDays(start, 6))}`;
    }
    return formatDateLong(anchor);
  }, [view, anchor]);

  const dayValue = dayAppointments
    .filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW")
    .reduce(
      (sum, a) =>
        sum + a.serviceIds.reduce((inner, id) => inner + (serviceById.get(id)?.price ?? 0), 0),
      0,
    );

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- Toolbar */}
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

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight text-ink">{rangeLabel}</h2>
          <p className="truncate text-xs text-faint">
            {view === "month"
              ? `${filtered.length} bookings in view`
              : `${dayAppointments.length} booked · ${formatMoney(dayValue)} of chair value`}
          </p>
        </div>

        <Select value={staffFilter} onValueChange={setStaffFilter}>
          <SelectTrigger className="w-[168px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All specialists</SelectItem>
            {serviceStaff.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="day">
              <Columns3 className="size-3.5" /> Day
            </TabsTrigger>
            <TabsTrigger value="week">
              <CalendarDays className="size-3.5" /> Week
            </TabsTrigger>
            <TabsTrigger value="month">
              <LayoutGrid className="size-3.5" /> Month
            </TabsTrigger>
            <TabsTrigger value="board">
              <Rows3 className="size-3.5" /> Board
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button onClick={() => openNewBooking()}>
          <Plus /> New booking
        </Button>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-3">
        {APPOINTMENT_STATUSES.map((status) => {
          const meta = APPOINTMENT_STATUS_META[status];
          const count = dayAppointments.filter((a) => a.status === status).length;
          return (
            <span key={status} className="flex items-center gap-1.5 text-xs text-faint">
              <span
                className="size-2 rounded-full"
                style={{ background: meta.dot }}
                aria-hidden
              />
              {meta.label}
              {view !== "month" && count > 0 && (
                <Badge variant="neutral" className="ml-0.5 px-1.5 py-0 text-[10px]">
                  {count}
                </Badge>
              )}
            </span>
          );
        })}
      </div>

      {/* ---------------------------------------------------------- Views */}
      {view === "board" ? (
        <KanbanBoard
          appointments={dayAppointments}
          context={context}
          onSelect={openDetail}
          onStatusChange={actions.setAppointmentStatus}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[calc(100vh-17rem)] overflow-y-auto">
            {view === "day" && (
              <DayView
                day={anchor}
                appointments={filtered}
                staff={visibleStaff}
                context={context}
                onSelect={openDetail}
                onCreate={(start, staffId) => openNewBooking(start, staffId)}
              />
            )}
            {view === "week" && (
              <WeekView
                anchor={anchor}
                appointments={filtered}
                context={context}
                onSelect={openDetail}
                onCreate={(start) => openNewBooking(start)}
              />
            )}
            {view === "month" && (
              <MonthView
                anchor={anchor}
                appointments={filtered}
                context={context}
                onSelectDay={(day) => {
                  setAnchor(day);
                  setView("day");
                }}
                onSelect={openDetail}
              />
            )}
          </div>
        </Card>
      )}

      <BookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        defaultStart={slotStart}
        defaultStaffId={slotStaffId}
        appointment={editing}
      />

      <AppointmentDetail
        appointment={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={(appointment) => {
          setEditing(appointment);
          setSlotStart(undefined);
          setSlotStaffId(undefined);
          setBookingOpen(true);
        }}
      />
    </div>
  );
}
