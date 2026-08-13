"use client";

import * as React from "react";
import { Check, Phone, Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { useSalon } from "@/lib/data/store";
import { clientStats } from "@/lib/data/analytics";
import { formatDate } from "@/lib/date";
import { cn, formatMoney } from "@/lib/utils";
import type { Client } from "@/lib/types";

/**
 * Counter-speed client selection: type to search existing clients, or add a
 * new one inline with just a name and phone.
 */
export function ClientPicker({
  clientId,
  onSelect,
}: {
  clientId: string | null;
  onSelect: (client: Client | null) => void;
}) {
  const { clients, invoices, appointments, actions } = useSalon();
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");

  const selected = clients.find((c) => c.id === clientId) ?? null;

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const digits = q.replace(/\D/g, "");
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)),
      )
      .slice(0, 5);
  }, [query, clients]);

  const stats = React.useMemo(
    () => (selected ? clientStats(invoices, appointments, selected.id) : null),
    [selected, invoices, appointments],
  );

  const [error, setError] = React.useState("");

  const createClient = async () => {
    if (!name.trim() || !phone.trim()) return;
    const client = await actions.addClient({
      name: name.trim(),
      phone: phone.trim(),
      gender: "Female",
    });
    if (!client) {
      setError(actions.lastError ?? "Couldn't create that client.");
      return;
    }
    onSelect(client);
    setAdding(false);
    setName("");
    setPhone("");
    setQuery("");
    setError("");
  };

  /* ------------------------------------------------- Selected state */

  if (selected) {
    return (
      <div className="rounded-xl border border-gold/30 bg-gold/[0.05] p-3">
        <div className="flex items-center gap-3">
          <Avatar name={selected.name} size="md" ring />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium text-ink">{selected.name}</p>
              {selected.tags.slice(0, 1).map((tag) => (
                <Badge key={tag} variant="default" className="shrink-0 text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
            <p className="flex items-center gap-1 truncate text-xs text-muted">
              <Phone className="size-3" />
              {selected.phone}
            </p>
          </div>
          <button
            onClick={() => onSelect(null)}
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-danger"
            aria-label="Clear client"
          >
            <X className="size-4" />
          </button>
        </div>

        {stats && stats.visitCount > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gold/15 pt-2.5 text-center">
            <div>
              <p className="tabular text-sm font-semibold text-ink">{stats.visitCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-faint">Visits</p>
            </div>
            <div>
              <p className="tabular text-sm font-semibold text-gold">
                {formatMoney(stats.totalSpend)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-faint">Lifetime</p>
            </div>
            <div>
              <p className="tabular text-sm font-semibold text-ink">
                {stats.lastVisit ? formatDate(stats.lastVisit).slice(0, 6) : "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-faint">Last visit</p>
            </div>
          </div>
        )}

        {selected.notes && (
          <p className="mt-2 rounded-md border border-warning/20 bg-warning/[0.06] p-2 text-[11px] text-warning">
            {selected.notes}
          </p>
        )}

        {stats && stats.outstanding > 0 && (
          <p className="mt-2 rounded-md border border-danger/25 bg-danger/[0.06] p-2 text-[11px] text-danger">
            Outstanding balance of {formatMoney(stats.outstanding)} on earlier invoices.
          </p>
        )}
      </div>
    );
  }

  /* --------------------------------------------------- Quick-add form */

  if (adding) {
    return (
      <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/[0.04] p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold">New client</p>
          <button
            onClick={() => setAdding(false)}
            className="rounded-md p-1 text-faint hover:text-ink"
            aria-label="Cancel"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <Input
          autoFocus
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void createClient()}
        />
        <Input
          placeholder="Phone number"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void createClient()}
        />
        {error && <p className="text-[11px] text-danger">{error}</p>}
        <Button
          size="sm"
          className="w-full"
          onClick={() => void createClient()}
          disabled={!name.trim() || !phone.trim()}
        >
          <Check /> Add &amp; attach
        </Button>
      </div>
    );
  }

  /* ------------------------------------------------------ Search state */

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input
          className="pl-9"
          placeholder="Search client by name or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {matches.length > 0 && (
        <div className="space-y-1 rounded-lg border border-hairline bg-obsidian-elevated p-1">
          {matches.map((client) => (
            <button
              key={client.id}
              onClick={() => {
                onSelect(client);
                setQuery("");
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-gold/10"
            >
              <Avatar name={client.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{client.name}</span>
                <span className="block truncate text-xs text-faint">{client.phone}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {query.trim() && matches.length === 0 && (
        <p className="px-1 text-xs text-faint">No client matches “{query}”.</p>
      )}

      <Button
        variant="secondary"
        size="sm"
        className={cn("w-full")}
        onClick={() => {
          setAdding(true);
          setName(query.replace(/[0-9]/g, "").trim());
          setPhone(/\d/.test(query) ? query : "");
        }}
      >
        <UserPlus /> Quick add new client
      </Button>
    </div>
  );
}
