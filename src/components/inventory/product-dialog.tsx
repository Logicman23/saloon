"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, TrendingDown } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSalon } from "@/lib/data/store";
import type { ProductType } from "@/lib/types";
import { formatMoney } from "@/lib/utils";

/** Units a salon actually buys in — free text would fragment the stock report. */
const UNITS = ["pc", "ml", "ltr", "g", "kg", "box", "pack"] as const;

export function ProductDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Radix unmounts Content on close, so the form is freshly seeded on
          every open and needs no reset effect. */}
      <DialogContent size="lg" className="max-h-[90vh]">
        <ProductForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ onDone }: { onDone: () => void }) {
  const { actions } = useSalon();

  const [name, setName] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [type, setType] = React.useState<ProductType>("RETAIL");
  const [brand, setBrand] = React.useState("");
  const [unit, setUnit] = React.useState<string>("pc");
  const [costPrice, setCostPrice] = React.useState("");
  const [retailPrice, setRetailPrice] = React.useState("");
  const [stock, setStock] = React.useState("0");
  const [lowStockThreshold, setLowStockThreshold] = React.useState("5");
  const [supplier, setSupplier] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const cost = Number(costPrice);
  const retail = Number(retailPrice);
  const marginReady = costPrice !== "" && retailPrice !== "" && cost > 0 && retail > 0;
  const margin = marginReady ? ((retail - cost) / retail) * 100 : 0;
  const sellingBelowCost = marginReady && retail < cost;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    // Cheap checks first so the obvious mistakes never cost a round trip.
    // The server re-validates all of this — this is convenience, not a gate.
    if (name.trim().length < 2) return setError("Enter a product name.");
    if (sku.trim().length < 2) return setError("Enter a SKU.");
    if (!brand.trim()) return setError("Enter a brand.");
    if (costPrice === "" || Number.isNaN(cost) || cost < 0)
      return setError("Enter a valid cost price.");
    if (retailPrice === "" || Number.isNaN(retail) || retail < 0)
      return setError("Enter a valid retail price.");

    setError("");
    setSaving(true);
    try {
      const created = await actions.addProduct({
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        type,
        brand: brand.trim(),
        unit,
        costPrice: cost,
        retailPrice: retail,
        stock: Number(stock) || 0,
        lowStockThreshold: Number(lowStockThreshold) || 0,
        supplier: supplier.trim() || undefined,
      });

      if (!created) {
        setError(actions.lastError ?? "Couldn't save that product.");
        return;
      }

      toast.success(`${created.name} added to inventory.`);
      onDone();
    } finally {
      // In a finally block so a thrown action cannot strand the button in its
      // disabled state with no way back other than a reload.
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>New product</DialogTitle>
        <DialogDescription>
          Add retail shelf stock or a back-bar consumable. Opening stock is recorded as a
          movement so the ledger reconciles.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="product-name">Product name</Label>
            <Input
              id="product-name"
              autoFocus
              placeholder="Argan Oil Shampoo 500ml"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-sku">SKU</Label>
            <Input
              id="product-sku"
              placeholder="SKU-SHM-500"
              value={sku}
              // Uppercased on the way in so the unique index cannot be
              // defeated by casing alone.
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-brand">Brand</Label>
            <Input
              id="product-brand"
              placeholder="L'Oreal Pro"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ProductType)}>
              <SelectTrigger id="product-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RETAIL">Retail — sold at the counter</SelectItem>
                <SelectItem value="CONSUMABLE">Consumable — back-bar use</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-unit">Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger id="product-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-cost">Cost price</Label>
            <Input
              id="product-cost"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="1800"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className="tabular"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-retail">Retail price</Label>
            <Input
              id="product-retail"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="3200"
              value={retailPrice}
              onChange={(e) => setRetailPrice(e.target.value)}
              className="tabular"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-stock">Opening stock</Label>
            <Input
              id="product-stock"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="tabular"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-low">Low-stock alert at</Label>
            <Input
              id="product-low"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              className="tabular"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="product-supplier">
              Supplier <span className="text-faint">(optional)</span>
            </Label>
            <Input
              id="product-supplier"
              placeholder="Beauty Depot Lahore"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
        </div>

        {/* Live margin. Priced-below-cost is legitimate for clearance, so this
            warns rather than blocks — but a transposed cost/retail pair is the
            far likelier explanation, and this catches it before saving. */}
        {marginReady && (
          <div
            className={
              sellingBelowCost
                ? "flex items-center justify-between rounded-lg border border-warning/25 bg-warning/[0.06] p-3"
                : "flex items-center justify-between rounded-lg border border-hairline bg-obsidian-elevated p-3"
            }
          >
            <span className="flex items-center gap-2 text-sm text-muted">
              {sellingBelowCost && <TrendingDown className="size-4 text-warning" />}
              {sellingBelowCost ? "Selling below cost" : "Margin per unit"}
            </span>
            <span className="text-right">
              <span
                className={
                  sellingBelowCost
                    ? "tabular block font-semibold text-warning"
                    : "tabular block font-semibold text-gold"
                }
              >
                {formatMoney(Math.round(retail - cost))}
              </span>
              <span className="tabular block text-xs text-faint">{margin.toFixed(1)}%</span>
            </span>
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
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Saving…" : "Add product"}
        </Button>
      </DialogFooter>
    </form>
  );
}
