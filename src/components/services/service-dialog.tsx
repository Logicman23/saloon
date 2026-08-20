"use client";

import * as React from "react";
import { toast } from "sonner";
import { Clock, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSalon } from "@/lib/data/store";
import { SERVICE_CATEGORIES, type Service, type ServiceCategory } from "@/lib/types";
import { cn, formatDuration, formatMoney } from "@/lib/utils";

/** Chair times a salon actually books in. Free minutes are still allowed via
 *  the input; these just make the common cases one tap. */
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180] as const;

/**
 * Create and edit share one form — see `product-dialog` for the reasoning.
 */
export function ServiceDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to add a new service; pass one to edit it in place. */
  service?: Service | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <ServiceForm
          key={service?.id ?? "new"}
          service={service ?? null}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ServiceForm({ service, onDone }: { service: Service | null; onDone: () => void }) {
  const { actions, services } = useSalon();
  const editing = Boolean(service);

  const [name, setName] = React.useState(service?.name ?? "");
  const [category, setCategory] = React.useState<ServiceCategory>(service?.category ?? "Hair");
  const [durationMin, setDurationMin] = React.useState(String(service?.durationMin ?? 45));
  const [price, setPrice] = React.useState(service ? String(service.price) : "");
  const [description, setDescription] = React.useState(service?.description ?? "");
  const [active, setActive] = React.useState(service?.active ?? true);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const duration = Number(durationMin);
  const priceValue = Number(price);

  // Warn about the clash the server will reject, while the fix is still one
  // keystroke away rather than a failed submit. Itself and archived entries
  // are excluded, matching the rule the action applies.
  const duplicate = React.useMemo(
    () =>
      services.find(
        (s) =>
          s.id !== service?.id &&
          !s.archived &&
          s.category === category &&
          s.name.trim().toLowerCase() === name.trim().toLowerCase() &&
          name.trim().length > 0,
      ),
    [services, service?.id, category, name],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (name.trim().length < 2) return setError("Enter a service name.");
    if (!Number.isInteger(duration) || duration < 5)
      return setError("Chair time must be at least 5 minutes.");
    if (duration > 600) return setError("Chair time cannot exceed 10 hours.");
    if (price === "" || Number.isNaN(priceValue) || priceValue < 0)
      return setError("Enter a valid price.");
    if (duplicate) return setError(`“${name.trim()}” already exists under ${category}.`);

    setError("");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        durationMin: duration,
        price: priceValue,
        description: description.trim() || undefined,
        active,
      };

      const result = service
        ? await actions.updateService(service.id, payload)
        : await actions.addService(payload);

      // The action's own message, not a generic apology — it names the field,
      // the clash or the unreachable database.
      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(
        editing ? `${result.data.name} updated.` : `${result.data.name} added to the catalogue.`,
      );
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    // The flex classes are load-bearing. DialogContent is a clipped flex
    // column whose children are expected to be the header, body and footer;
    // a plain <form> in between breaks that chain, so DialogBody stops
    // scrolling and the footer is clipped out of view the moment the content
    // grows — which is exactly when a price is typed and the summary appears.
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit service" : "New service"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Applies from now on. Invoices already raised keep the price they were billed at, and booked appointments keep the chair time they were scheduled with."
            : "Added to the booking calendar and the POS catalogue immediately."}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="service-name">Service name</Label>
          <Input
            id="service-name"
            autoFocus
            placeholder="Signature Glow Facial"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {duplicate && (
            <p className="text-xs text-warning">
              A service with this name already exists under {category}.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="service-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ServiceCategory)}
            >
              <SelectTrigger id="service-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="service-price">Price</Label>
            <Input
              id="service-price"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="4500"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="tabular"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="service-duration">Chair time (minutes)</Label>
          <Input
            id="service-duration"
            type="number"
            min={5}
            max={600}
            step="5"
            inputMode="numeric"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            className="tabular"
          />
          <div className="flex flex-wrap gap-1.5">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDurationMin(String(preset))}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  duration === preset
                    ? "border-gold/50 bg-gold/12 text-gold-light"
                    : "border-hairline text-muted hover:border-hairline-strong hover:text-ink",
                )}
              >
                {formatDuration(preset)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="service-description">
            Description <span className="text-faint">(optional)</span>
          </Label>
          <Textarea
            id="service-description"
            rows={2}
            placeholder="Cleanse, exfoliate, mask and massage."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-hairline bg-obsidian-elevated p-3">
          <div>
            <p className="text-sm text-ink">Bookable now</p>
            <p className="text-xs text-faint">
              Inactive services stay on past invoices but leave the booking menu.
            </p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        {duration >= 5 && price !== "" && !Number.isNaN(priceValue) && (
          <div className="rounded-lg border border-hairline bg-obsidian-elevated p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted">
                <Clock className="size-4 text-gold" />
                Chair time
              </span>
              <span className="tabular font-medium text-ink">{formatDuration(duration)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <span className="text-muted">Revenue per hour</span>
              <span className="tabular font-semibold text-gold">
                {formatMoney(Math.round((priceValue / duration) * 60))}
              </span>
            </div>
          </div>
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
        {/* Disabled only while the write is in flight. Blocking on `duplicate`
            left the button dead with nothing but a small hint to explain it;
            letting the click through puts the reason in the footer, next to
            the control the person just pressed. */}
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : editing ? "Save changes" : "Add service"}
        </Button>
      </DialogFooter>
    </form>
  );
}
