"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CalendarPlus, Phone, Search, TrendingUp, UserPlus, Users } from "lucide-react";
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
import { KpiCard } from "@/components/dashboard/kpi-card";
import { BookingDialog } from "@/components/appointments/booking-dialog";
import { AppointmentStatusBadge, InvoiceStatusBadge } from "@/components/appointments/status";
import { useLookups, useSalon } from "@/lib/data/store";
import { clientStats, collected } from "@/lib/data/analytics";
import { totalsOf } from "@/lib/data/store";
import { formatDate, formatDateTime } from "@/lib/date";
import { formatMoney, formatMoneyCompact } from "@/lib/utils";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  return (
    <React.Suspense fallback={null}>
      <ClientsView />
    </React.Suspense>
  );
}

function ClientsView() {
  const params = useSearchParams();
  const { clients, invoices, appointments, actions } = useSalon();

  const [query, setQuery] = React.useState("");
  // Seeded from the command palette's deep link (?focus=cli_007) on first
  // render, so no effect is needed to sync it.
  const [selectedId, setSelectedId] = React.useState<string | null>(() => params.get("focus"));
  const [addOpen, setAddOpen] = React.useState(false);
  const [bookingOpen, setBookingOpen] = React.useState(false);

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
    return clients
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .map((client) => ({ client, stats: clientStats(invoices, appointments, client.id) }))
      .sort((a, b) => b.stats.totalSpend - a.stats.totalSpend);
  }, [clients, invoices, appointments, query]);

  const totalLifetime = rows.reduce((sum, r) => sum + r.stats.totalSpend, 0);
  const vipCount = clients.filter((c) => c.tags.includes("VIP")).length;
  const withBalance = rows.filter((r) => r.stats.outstanding > 0).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total clients" value={String(clients.length)} icon={Users} tone="gold" />
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
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus /> Add client
            </Button>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableEmpty colSpan={8}>No client matches “{query}”.</TableEmpty>
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

      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} onAdd={actions.addClient} />

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
              actions.updateClient(client.id, { notes: notes.trim() || undefined });
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

/* ---------------------------------------------------------- Add client */

function AddClientDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: ReturnType<typeof useSalon>["actions"]["addClient"];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="default">
        {/* Unmounted while closed, so the fields start empty each time. */}
        <AddClientForm onCancel={() => onOpenChange(false)} onAdd={onAdd} />
      </DialogContent>
    </Dialog>
  );
}

function AddClientForm({
  onCancel,
  onAdd,
}: {
  onCancel: () => void;
  onAdd: ReturnType<typeof useSalon>["actions"]["addClient"];
}) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [notes, setNotes] = React.useState("");

  return (
    <>
        <DialogHeader>
          <DialogTitle>Add a client</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ayesha Khan" />
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
          <Field label="Notes (optional)">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Preferences, allergies…"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !phone.trim()}
            onClick={() => {
              onAdd({
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim() || undefined,
                notes: notes.trim() || undefined,
                gender: "Female",
              });
              onCancel();
            }}
          >
            Add client
          </Button>
        </DialogFooter>
    </>
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
