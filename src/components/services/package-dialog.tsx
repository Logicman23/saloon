"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Loader2, Search, X } from "lucide-react";
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
import { Label, Switch } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { useSalon } from "@/lib/data/store";
import { SERVICE_CATEGORIES } from "@/lib/types";
import { cn, formatDuration, formatMoney } from "@/lib/utils";

export function PackageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh]">
        <PackageForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PackageForm({ onDone }: { onDone: () => void }) {
  const { actions, services } = useSalon();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [serviceIds, setServiceIds] = React.useState<string[]>([]);
  const [active, setActive] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const selected = serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const fullPrice = selected.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = selected.reduce((sum, s) => sum + s.durationMin, 0);
  const bundlePrice = Number(price);
  const priced = price !== "" && !Number.isNaN(bundlePrice);
  const savings = priced ? fullPrice - bundlePrice : 0;
  const savingsPct = priced && fullPrice > 0 ? (savings / fullPrice) * 100 : 0;

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter(
      (s) =>
        s.active &&
        (category === "all" || s.category === category) &&
        (!q || s.name.toLowerCase().includes(q)),
    );
  }, [services, category, query]);

  const toggle = (id: string) =>
    setServiceIds((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (name.trim().length < 2) return setError("Enter a package name.");
    if (serviceIds.length < 2) return setError("Pick at least two services to bundle.");
    if (!priced || bundlePrice < 0) return setError("Enter a valid package price.");

    setError("");
    setSaving(true);
    try {
      const result = await actions.addPackage({
        name: name.trim(),
        description: description.trim() || undefined,
        price: bundlePrice,
        serviceIds,
        active,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(`${result.data.name} added to deals.`);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>New deal</DialogTitle>
        <DialogDescription>
          Bundle two or more services at a combined price. Members stay individually
          bookable.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="grid gap-6 md:grid-cols-2">
        {/* ------------------------------------------------------- Details */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="package-name">Package name</Label>
            <Input
              id="package-name"
              autoFocus
              placeholder="Complete Bridal Package"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="package-price">Bundle price</Label>
            <Input
              id="package-price"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder={fullPrice ? String(Math.round(fullPrice * 0.85)) : "85000"}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="tabular"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="package-description">
              Description <span className="text-faint">(optional)</span>
            </Label>
            <Textarea
              id="package-description"
              rows={2}
              placeholder="Bridal makeup + hydrafacial + gel nails + body polish."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-hairline bg-obsidian-elevated p-3">
            <div>
              <p className="text-sm text-ink">Sellable now</p>
              <p className="text-xs text-faint">Inactive deals stay off the POS catalogue.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>

          {/* Chosen services, removable without hunting back through the list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>In this package</Label>
              <span className="text-xs text-faint">{serviceIds.length} selected</span>
            </div>
            {selected.length === 0 ? (
              <p className="rounded-lg border border-dashed border-hairline px-3 py-4 text-center text-xs text-faint">
                Nothing picked yet — choose from the list.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs text-gold-light transition-colors hover:border-gold/70"
                  >
                    {s.name}
                    <X className="size-3" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Savings maths, live. A bundle priced above its parts is almost
              always a typo, so it is called out rather than left to be found
              by a client at the counter. */}
          {selected.length > 0 && (
            <div className="rounded-lg border border-hairline bg-obsidian-elevated p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Sum of services</span>
                <span className="tabular text-ink">{formatMoney(fullPrice)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="text-muted">Total chair time</span>
                <span className="tabular text-ink">{formatDuration(totalDuration)}</span>
              </div>
              {priced && (
                <div className="mt-1.5 flex items-center justify-between border-t border-hairline pt-1.5 text-sm">
                  <span className="text-muted">
                    {savings >= 0 ? "Client saves" : "Priced above parts"}
                  </span>
                  <span
                    className={cn(
                      "tabular font-semibold",
                      savings >= 0 ? "text-gold" : "text-warning",
                    )}
                  >
                    {formatMoney(Math.round(Math.abs(savings)))}
                    <span className="ml-1 text-xs font-normal">
                      ({Math.abs(savingsPct).toFixed(0)}%)
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------ Services */}
        <div className="space-y-3">
          <Label>Choose services</Label>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              className="pl-9"
              placeholder="Search services…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
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

          <div className="max-h-[340px] space-y-1 overflow-y-auto pr-1">
            {visible.map((service) => {
              const checked = serviceIds.includes(service.id);
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => toggle(service.id)}
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
                  <span className="tabular shrink-0 text-sm text-muted">
                    {formatMoney(service.price)}
                  </span>
                </button>
              );
            })}
            {visible.length === 0 && (
              <p className="py-6 text-center text-xs text-faint">No service matches that.</p>
            )}
          </div>
        </div>
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
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : "Add deal"}
          {serviceIds.length > 0 && !saving && (
            <Badge variant="neutral" className="ml-1 border-black/20 bg-black/15 text-obsidian">
              {serviceIds.length}
            </Badge>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
