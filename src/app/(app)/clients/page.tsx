"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarPlus,
  Loader2,
  Pencil,
  Phone,
  Search,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, Label, SectionHeading } from "@/components/ui/misc";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { BookingDialog } from "@/components/appointments/booking-dialog";
import { AppointmentStatusBadge, InvoiceStatusBadge } from "@/components/appointments/status";
import { useLookups, useSalon } from "@/lib/data/store";
import { ProtectedRoute, useAuth } from "@/lib/auth/context";
import { clientStats, collected } from "@/lib/data/analytics";
import { totalsOf } from "@/lib/data/store";
import { formatDate, formatDateTime } from "@/lib/date";
import { formatMoney, formatMoneyCompact } from "@/lib/utils";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  return (
    <ProtectedRoute requires={["clients.view"]}>
      <React.Suspense fallback={null}>
        <ClientsView />
      </React.Suspense>
    </ProtectedRoute>
  );
}

function ClientsView() {
  const params = useSearchParams();
  const { clients, invoices, appointments, actions } = useSalon();
  const { can } = useAuth();

  const [query, setQuery] = React.useState("");
  // Seeded from the command palette's deep link (?focus=cli_007) on first
  // render, so no effect is needed to sync it.
  const [selectedId, setSelectedId] = React.useState<string | null>(() => params.get("focus"));
  const [addOpen, setAddOpen] = React.useState(false);
  const [bookingOpen, setBookingOpen] = React.useState(false);
  const [editingClient, setEditingClient] = React.useState<Client | null>(null);
  const [removingClient, setRemovingClient] = React.useState<Client | null>(null);

  const canManage = can("clients.manage");

  /**
   * The directory, minus anyone retired.
   *
   * `clients` deliberately still carries archived rows — appointments,
   * invoices and receipts resolve a name through the id — so every view
   * presenting the *client base* filters them here.
   */
  const live = React.useMemo(() => clients.filter((c) => !c.archived), [clients]);

  /** The blocker `archiveClientAction` refuses on, surfaced before the click. */
  const upcomingForRemoval = React.useMemo(() => {
    if (!removingClient) return 0;
    const now = new Date().toISOString();
    return appointments.filter(
      (a) =>
        a.clientId === removingClient.id &&
        a.start >= now &&
        (a.status === "SCHEDULED" || a.status === "IN_PROGRESS"),
    ).length;
  }, [removingClient, appointments]);

  const selected = React.useMemo(
    () => clients.find((c) => c.id === selectedId) ?? null,
    [clients, selectedId],
  );
  const setSelected = React.useCallback(
    (client: Client | null) => setSelectedId(client?.id ?? null),
    [],
  );

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return live
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .map((client) => ({ client, stats: clientStats(invoices, appointments, client.id) }))
      .sort((a, b) => b.stats.totalSpend - a.stats.totalSpend);
  }, [live, invoices, appointments, query]);

  const totalLifetime = rows.reduce((sum, r) => sum + r.stats.totalSpend, 0);
  const vipCount = live.filter((c) => c.tags.includes("VIP")).length;
  const withBalance = rows.filter((r) => r.stats.outstanding > 0).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total clients" value={String(live.length)} icon={Users} tone="gold" />
        <KpiCard
          label="Lifetime value"
          value={formatMoneyCompact(totalLifetime)}
          icon={TrendingUp}
          tone="success"
        />
        <KpiCard label="VIP clients" value={String(vipCount)} icon={Users} tone="gold" />
        <KpiCard
          label="With balance due"
          value={String(withBalance)}
          icon={Phone}
          tone={withBalance ? "warning" : "success"}
        />
      </div>

      <SectionHeading
        title="Client directory"
        description="Every profile with visit history, spend and outstanding balance."
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input
                className="w-56 pl-9"
                placeholder="Name, phone or tag…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {can("clients.manage") && (
              <Button onClick={() => setAddOpen(true)}>
                <UserPlus /> Add client
              </Button>
            )}
          </>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="text-right">Visits</TableHead>
              <TableHead className="text-right">Lifetime spend</TableHead>
              <TableHead className="text-right">Avg ticket</TableHead>
              <TableHead>Last visit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableEmpty colSpan={9}>No client matches “{query}”.</TableEmpty>
            )}
            {rows.slice(0, 60).map(({ client, stats }) => (
              <TableRow
                key={client.id}
                onClick={() => setSelected(client)}
                className="cursor-pointer"
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={client.name} size="sm" />
                    <span className="font-medium text-ink">{client.name}</span>
                  </div>
                </TableCell>
                <TableCell className="tabular text-muted">{client.phone}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {client.tags.slice(0, 2).map((tag) => (
                      <Badge
                        key={tag}
                        variant={tag === "VIP" ? "default" : "neutral"}
                        className="text-[10px]"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="tabular text-right text-muted">{stats.visitCount}</TableCell>
                <TableCell className="tabular text-right font-medium text-gold">
                  {formatMoney(stats.totalSpend)}
                </TableCell>
                <TableCell className="tabular text-right text-muted">
                  {formatMoney(stats.averageTicket)}
                </TableCell>
                <TableCell className="text-muted">
                  {stats.lastVisit ? formatDate(stats.lastVisit) : "—"}
                </TableCell>
                <TableCell className="tabular text-right">
                  {stats.outstanding > 0 ? (
                    <span className="text-danger">{formatMoney(stats.outstanding)}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canManage && (
                    /* The row itself opens the profile, so these must not
                       bubble — otherwise every edit click opens the dialog
                       behind the one it just opened. */
                    <div
                      className="flex items-center justify-end gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingClient(client)}
                      >
                        <Pencil />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={`Delete ${client.name}`}
                        className="hover:bg-danger/10 hover:text-danger"
                        onClick={() => setRemovingClient(client)}
                      >
                        <Trash2 />
                        <span className="sr-only">Delete {client.name}</span>
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length > 60 && (
          <p className="border-t border-hairline px-4 py-2.5 text-xs text-faint">
            Showing the top 60 of {rows.length} matches — refine your search to narrow it down.
          </p>
        )}
      </Card>

      <ClientDetail
        client={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onBook={() => setBookingOpen(true)}
      />

      <ClientDialog open={addOpen} onOpenChange={setAddOpen} />
      <ClientDialog
        client={editingClient}
        open={Boolean(editingClient)}
        onOpenChange={(open) => !open && setEditingClient(null)}
      />

      <ConfirmDialog
        open={Boolean(removingClient)}
        onOpenChange={(open) => !open && setRemovingClient(null)}
        title="Delete this client?"
        description={
          removingClient
            ? `${removingClient.name} will come off the directory, the search and the booking picker.`
            : undefined
        }
        confirmLabel="Delete client"
        pendingLabel="Deleting…"
        confirmDisabled={upcomingForRemoval > 0}
        onConfirm={async () => {
          if (!removingClient) return;
          const result = await actions.archiveClient(removingClient.id);
          if (!result.ok) return result.error;
          toast.success(`${result.data.name} removed from the directory.`);
        }}
      >
        <p className="text-sm text-muted">
          Their visit history and invoices are kept — the record is retired, not erased, so past
          bookings and printed receipts still show the name.
        </p>

        {upcomingForRemoval > 0 && (
          <p className="rounded-lg border border-danger/25 bg-danger/[0.06] p-3 text-sm text-danger">
            {upcomingForRemoval === 1
              ? "This client has an upcoming booking."
              : `This client has ${upcomingForRemoval} upcoming bookings.`}{" "}
            Complete or cancel {upcomingForRemoval === 1 ? "it" : "them"} first.
          </p>
        )}
      </ConfirmDialog>

      <BookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}

/* ------------------------------------------------------- Client detail */

function ClientDetail({
  client,
  open,
  onOpenChange,
  onBook,
}: {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBook: () => void;
}) {
  if (!client) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        {/* Keyed so switching clients rebuilds the notes field cleanly. */}
        <ClientDetailBody
          key={client.id}
          client={client}
          onClose={() => onOpenChange(false)}
          onBook={onBook}
        />
      </DialogContent>
    </Dialog>
  );
}

function ClientDetailBody({
  client,
  onClose,
  onBook,
}: {
  client: Client;
  onClose: () => void;
  onBook: () => void;
}) {
  const { invoices, appointments, actions } = useSalon();
  const { staffById, serviceById } = useLookups();
  const [notes, setNotes] = React.useState(() => client.notes ?? "");

  const stats = clientStats(invoices, appointments, client.id);
  const history = appointments
    .filter((a) => a.clientId === client.id)
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 10);
  const bills = invoices
    .filter((i) => i.clientId === client.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  // Which service does this client book most?
  const favourite = (() => {
    const counts = new Map<string, number>();
    for (const appointment of appointments.filter((a) => a.clientId === client.id)) {
      for (const id of appointment.serviceIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? serviceById.get(top[0])?.name : undefined;
  })();

  return (
    <>
        <DialogHeader>
          <div className="flex items-center gap-3 pr-8">
            <Avatar name={client.name} size="lg" ring />
            <div className="min-w-0">
              <DialogTitle>{client.name}</DialogTitle>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Phone className="size-3.5" />
                {client.phone}
                {client.email && <span className="text-faint">· {client.email}</span>}
              </p>
              <div className="mt-1 flex gap-1">
                {client.tags.map((tag) => (
                  <Badge key={tag} variant={tag === "VIP" ? "default" : "neutral"} className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Visits", value: String(stats.visitCount) },
              { label: "Lifetime spend", value: formatMoney(stats.totalSpend), gold: true },
              { label: "Avg ticket", value: formatMoney(stats.averageTicket) },
              { label: "Client since", value: formatDate(client.createdAt) },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-hairline bg-obsidian-elevated p-3 text-center"
              >
                <p
                  className={`tabular text-base font-semibold ${stat.gold ? "text-gold" : "text-ink"}`}
                >
                  {stat.value}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {favourite && (
            <p className="rounded-lg border border-gold/25 bg-gold/[0.05] p-3 text-sm text-muted">
              Books <span className="font-medium text-gold">{favourite}</span> more than anything
              else.
            </p>
          )}

          {stats.outstanding > 0 && (
            <p className="rounded-lg border border-danger/25 bg-danger/[0.06] p-3 text-sm text-danger">
              Outstanding balance of {formatMoney(stats.outstanding)} across unpaid invoices.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Visit ledger */}
            <div>
              <Label className="mb-2 block">Visit history</Label>
              <div className="space-y-1.5">
                {history.length === 0 && (
                  <p className="py-4 text-center text-xs text-faint">No visits recorded.</p>
                )}
                {history.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="rounded-lg border border-hairline bg-obsidian-elevated p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="tabular flex-1 truncate text-xs text-muted">
                        {formatDateTime(appointment.start)}
                      </span>
                      <AppointmentStatusBadge status={appointment.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-ink">
                      {appointment.serviceIds
                        .map((id) => serviceById.get(id)?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <p className="text-[11px] text-faint">
                      with {staffById.get(appointment.staffId)?.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Billing ledger */}
            <div>
              <Label className="mb-2 block">Billing history</Label>
              <div className="space-y-1.5">
                {bills.length === 0 && (
                  <p className="py-4 text-center text-xs text-faint">No invoices yet.</p>
                )}
                {bills.map((invoice) => {
                  const totals = totalsOf(invoice);
                  return (
                    <div
                      key={invoice.id}
                      className="flex items-center gap-2 rounded-lg border border-hairline bg-obsidian-elevated p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs text-ink">{invoice.number}</p>
                        <p className="text-[11px] text-faint">{formatDate(invoice.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="tabular text-sm font-medium text-ink">
                          {formatMoney(totals.total)}
                        </p>
                        <p className="tabular text-[10px] text-faint">
                          paid {formatMoney(collected(invoice))}
                        </p>
                      </div>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stylist notes */}
          <div>
            <Label htmlFor="client-notes" className="mb-2 block">
              Stylist notes
            </Label>
            <Textarea
              id="client-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergies, formulas, preferences…"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              actions.updateClientNotes(client.id, { notes: notes.trim() || undefined });
              onClose();
            }}
          >
            Save notes
          </Button>
          <Button
            onClick={() => {
              onClose();
              onBook();
            }}
          >
            <CalendarPlus /> Book appointment
          </Button>
        </DialogFooter>
    </>
  );
}

/* ------------------------------------------------------ Add / edit client */

const GENDERS = ["Female", "Male", "Other"] as const;

function ClientDialog({
  client = null,
  open,
  onOpenChange,
}: {
  /** Omitted to register a new client; supplied to edit that one. */
  client?: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="default">
        {/* Keyed so opening a second client cannot inherit the first's state. */}
        <ClientForm
          key={client?.id ?? "new"}
          client={client}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ClientForm({ client, onDone }: { client: Client | null; onDone: () => void }) {
  const { actions } = useSalon();
  const editing = client !== null;

  const [name, setName] = React.useState(client?.name ?? "");
  const [phone, setPhone] = React.useState(client?.phone ?? "");
  const [email, setEmail] = React.useState(client?.email ?? "");
  const [gender, setGender] = React.useState<NonNullable<Client["gender"]>>(
    client?.gender ?? "Female",
  );
  // Editing leaves notes alone: they have their own save in the detail dialog,
  // and duplicating the field here would let a stale copy overwrite them.
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (name.trim().length < 2) return setError("Enter the client's name.");
    if (phone.trim().length < 6) return setError("Enter a contact number.");

    setError("");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        gender,
      };

      if (client) {
        const result = await actions.updateClient(client.id, payload);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`${name.trim()} updated.`);
      } else {
        // addClient resolves null on failure and parks the reason in the
        // store — the previous version fired and closed regardless, so a
        // duplicate number looked like it had worked.
        const added = await actions.addClient({ ...payload, notes: notes.trim() || undefined });
        if (!added) {
          setError(actions.lastError ?? "Could not add that client.");
          return;
        }
        toast.success(`${name.trim()} added to the directory.`);
      }
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${client.name}` : "Add a client"}</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-3">
        <Field label="Full name">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ayesha Khan"
          />
        </Field>
        <Field label="Phone">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="0300-1234567"
          />
        </Field>
        <Field label="Email (optional)">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="ayesha@example.com"
          />
        </Field>
        <Field label="Gender">
          <Select
            value={gender}
            onValueChange={(v) => setGender(v as NonNullable<Client["gender"]>)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GENDERS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {!editing && (
          <Field label="Notes (optional)">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Preferences, allergies…"
            />
          </Field>
        )}
      </DialogBody>
      <DialogFooter>
        {error && (
          <p className="mr-auto self-center text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !name.trim() || !phone.trim()}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : editing ? "Save changes" : "Add client"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
