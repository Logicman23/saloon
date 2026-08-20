"use client";

import * as React from "react";
import { Check, Clock, Search, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label, Avatar } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSalon } from "@/lib/data/store";
import { SERVICE_CATEGORIES, type Appointment } from "@/lib/types";
import { addMinutes, dateTimeLocalValue, formatTime } from "@/lib/date";
import { cn, formatDuration, formatMoney } from "@/lib/utils";

/**
 * Create or reschedule a booking. Used by the calendar, the kanban board and
 * the top bar's "Quick Booking" action.
 */
export function BookingDialog({
  open,
  onOpenChange,
  /** Pre-selected slot when opened from a calendar cell. */
  defaultStart,
  defaultStaffId,
  /** Provide to edit an existing booking instead of creating one. */
  appointment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStart?: Date;
  defaultStaffId?: string;
  appointment?: Appointment;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh]">
        {/* Radix unmounts Content on close, so the form seeds itself from
            these props on every open — no reset effect needed. */}
        <BookingForm
          defaultStart={defaultStart}
          defaultStaffId={defaultStaffId}
          appointment={appointment}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function BookingForm({
  defaultStart,
  defaultStaffId,
  appointment,
  onDone,
}: {
  defaultStart?: Date;
  defaultStaffId?: string;
  appointment?: Appointment;
  onDone: () => void;
}) {
  const { clients, services, staff, actions } = useSalon();
  const serviceStaff = React.useMemo(
    () => staff.filter((s) => s.active && s.specialties.length > 0),
    [staff],
  );

  const [clientQuery, setClientQuery] = React.useState("");
  const [clientId, setClientId] = React.useState(() => appointment?.clientId ?? "");
  const [staffId, setStaffId] = React.useState(
    () => appointment?.staffId ?? defaultStaffId ?? serviceStaff[0]?.id ?? "",
  );
  const [serviceIds, setServiceIds] = React.useState<string[]>(
    () => appointment?.serviceIds ?? [],
  );
  const [start, setStart] = React.useState(() =>
    dateTimeLocalValue(appointment?.start ?? defaultStart ?? nextHalfHour()),
  );
  const [notes, setNotes] = React.useState(() => appointment?.notes ?? "");
  const [category, setCategory] = React.useState<string>("all");
  const [quickAdd, setQuickAdd] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [error, setError] = React.useState("");

  const selectedServices = serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const durationMin = selectedServices.reduce((sum, s) => sum + s.durationMin, 0);
  const priceTotal = selectedServices.reduce((sum, s) => sum + s.price, 0);

  const filteredClients = React.useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients.slice(0, 6);
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")),
      )
      .slice(0, 6);
  }, [clientQuery, clients]);

  const visibleServices = React.useMemo(
    () =>
      services.filter(
        (s) => s.active && !s.archived && (category === "all" || s.category === category),
      ),
    [services, category],
  );

  const selectedClient = clients.find((c) => c.id === clientId);
  const endTime = start && durationMin ? addMinutes(new Date(start), durationMin) : null;

  const toggleService = (id: string) =>
    setServiceIds((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );

  const submit = async () => {
    let resolvedClientId = clientId;

    if (quickAdd) {
      if (!newName.trim() || !newPhone.trim()) {
        setError("Enter both a name and a phone number for the new client.");
        return;
      }
      const created = await actions.addClient({
        name: newName.trim(),
        phone: newPhone.trim(),
        gender: "Female",
      });
      if (!created) {
        setError(actions.lastError ?? "Couldn't create that client.");
        return;
      }
      resolvedClientId = created.id;
    }

    if (!resolvedClientId) return setError("Select a client, or add a new one.");
    if (!staffId) return setError("Assign a specialist.");
    if (serviceIds.length === 0) return setError("Choose at least one service.");
    if (!start) return setError("Pick a date and time.");

    const payload = {
      clientId: resolvedClientId,
      staffId,
      serviceIds,
      start: new Date(start).toISOString(),
      durationMin,
      status: appointment?.status ?? ("SCHEDULED" as const),
      notes: notes.trim() || undefined,
    };

    if (appointment) await actions.updateAppointment(appointment.id, payload);
    else await actions.bookAppointment(payload);

    if (actions.lastError) {
      setError(actions.lastError);
      return;
    }
    onDone();
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{appointment ? "Edit appointment" : "New appointment"}</DialogTitle>
          <DialogDescription>
            {appointment
              ? "Update the client, specialist, services or time slot."
              : "Book a client with a specialist and reserve chair time."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-6 md:grid-cols-2">
          {/* ---------------------------------------------------- Client */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Client</Label>
              <button
                type="button"
                onClick={() => {
                  setQuickAdd((v) => !v);
                  setClientId("");
                }}
                className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
              >
                <UserPlus className="size-3.5" />
                {quickAdd ? "Search existing" : "Quick add new"}
              </button>
            </div>

            {quickAdd ? (
              <div className="space-y-2 rounded-lg border border-gold/25 bg-gold/[0.04] p-3">
                <Input
                  placeholder="Full name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Input
                  placeholder="Phone number"
                  inputMode="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
                <p className="text-[11px] text-faint">
                  The client is created and attached to this booking on save.
                </p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                  <Input
                    className="pl-9"
                    placeholder="Search by name or phone…"
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                  />
                </div>
                <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                  {filteredClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setClientId(client.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                        clientId === client.id
                          ? "border-gold/50 bg-gold/10"
                          : "border-hairline hover:border-hairline-strong hover:bg-white/[0.03]",
                      )}
                    >
                      <Avatar name={client.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{client.name}</span>
                        <span className="block truncate text-xs text-faint">{client.phone}</span>
                      </span>
                      {clientId === client.id && <Check className="size-4 shrink-0 text-gold" />}
                    </button>
                  ))}
                  {filteredClients.length === 0 && (
                    <p className="py-4 text-center text-xs text-faint">
                      No client matches “{clientQuery}”.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="booking-staff">Specialist</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger id="booking-staff">
                  <SelectValue placeholder="Assign a specialist" />
                </SelectTrigger>
                <SelectContent>
                  {serviceStaff.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} — {member.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="booking-start">Date &amp; start time</Label>
              <Input
                id="booking-start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="[color-scheme:dark]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="booking-notes">Notes</Label>
              <Textarea
                id="booking-notes"
                rows={2}
                placeholder="Allergies, references, special requests…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* -------------------------------------------------- Services */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Services</Label>
              <span className="text-xs text-faint">{serviceIds.length} selected</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {["all", ...SERVICE_CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    category === cat
                      ? "border-gold/50 bg-gold/12 text-gold-light"
                      : "border-hairline text-muted hover:border-hairline-strong hover:text-ink",
                  )}
                >
                  {cat === "all" ? "All" : cat}
                </button>
              ))}
            </div>

            <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
              {visibleServices.map((service) => {
                const checked = serviceIds.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => toggleService(service.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                      checked
                        ? "border-gold/50 bg-gold/10"
                        : "border-hairline hover:border-hairline-strong hover:bg-white/[0.03]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        checked ? "border-gold bg-gold text-obsidian" : "border-hairline-strong",
                      )}
                    >
                      {checked && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{service.name}</span>
                      <span className="block text-xs text-faint">
                        {service.category} · {formatDuration(service.durationMin)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular text-muted">
                      {formatMoney(service.price)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Live slot summary */}
            <div className="rounded-lg border border-hairline bg-obsidian-elevated p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted">
                  <Clock className="size-4 text-gold" />
                  Chair time
                </span>
                <span className="tabular font-medium text-ink">
                  {durationMin ? formatDuration(durationMin) : "—"}
                </span>
              </div>
              {start && endTime && (
                <div className="mt-1.5 flex items-center justify-between text-sm">
                  <span className="text-muted">Slot</span>
                  <span className="tabular text-ink">
                    {formatTime(new Date(start))} – {formatTime(endTime)}
                  </span>
                </div>
              )}
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="text-muted">Estimated value</span>
                <span className="tabular font-semibold text-gold">{formatMoney(priceTotal)}</span>
              </div>
            </div>

            {selectedClient?.notes && (
              <div className="rounded-lg border border-warning/25 bg-warning/[0.06] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-warning">
                  Client note
                </p>
                <p className="mt-1 text-xs text-muted">{selectedClient.notes}</p>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          {error && (
            <p className="mr-auto self-center text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={submit}>
            {appointment ? "Save changes" : "Confirm booking"}
            {durationMin > 0 && (
              <Badge variant="neutral" className="ml-1 border-black/20 bg-black/15 text-obsidian">
                {formatDuration(durationMin)}
              </Badge>
            )}
          </Button>
        </DialogFooter>
    </>
  );
}

/** Rounds "now" up to the next :00 or :30 so the default slot looks intentional. */
function nextHalfHour() {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30);
  return d;
}
