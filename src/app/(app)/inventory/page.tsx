"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  PackagePlus,
  Search,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label, SectionHeading } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { KpiCard } from "@/components/dashboard/kpi-card";
import { useLookups, useSalon } from "@/lib/data/store";
import { ProtectedRoute, useAuth } from "@/lib/auth/context";
import { ProductDialog } from "@/components/inventory/product-dialog";
import { inventoryValue, lowStockProducts } from "@/lib/data/analytics";
import { formatDateTime } from "@/lib/date";
import { cn, formatMoney, formatMoneyCompact } from "@/lib/utils";
import { STOCK_MOVEMENT_TYPES, type Product, type StockMovementType } from "@/lib/types";

const MOVEMENT_META: Record<
  StockMovementType,
  { label: string; variant: "success" | "warning" | "danger" | "neutral" | "info" }
> = {
  STOCK_IN: { label: "Stock In", variant: "success" },
  SERVICE_USAGE: { label: "Service Usage", variant: "info" },
  RETAIL_SALE: { label: "Retail Sale", variant: "neutral" },
  DAMAGED: { label: "Damaged", variant: "danger" },
  EXPIRED: { label: "Expired", variant: "danger" },
  ADJUSTMENT: { label: "Adjustment", variant: "warning" },
};

export default function InventoryPage() {
  return (
    <ProtectedRoute requires={["inventory.view"]}>
      <InventoryView />
    </ProtectedRoute>
  );
}

function InventoryView() {
  const { products, stockMovements, staff, actions } = useSalon();
  const { productById, staffById } = useLookups();
  const { can } = useAuth();
  const canManage = can("inventory.manage");

  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [adjusting, setAdjusting] = React.useState<Product | null>(null);
  const [productOpen, setProductOpen] = React.useState(false);

  const q = query.trim().toLowerCase();

  const filtered = React.useMemo(
    () =>
      products.filter(
        (p) =>
          (typeFilter === "all" || p.type === typeFilter) &&
          (!q ||
            p.name.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q)),
      ),
    [products, typeFilter, q],
  );

  const lowStock = React.useMemo(() => lowStockProducts(products), [products]);
  const stockValue = React.useMemo(() => inventoryValue(products), [products]);
  const retailValue = React.useMemo(
    () =>
      products
        .filter((p) => p.type === "RETAIL")
        .reduce((sum, p) => sum + p.stock * p.retailPrice, 0),
    [products],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total SKUs" value={String(products.length)} icon={Boxes} tone="gold" />
        <KpiCard
          label="Stock value (cost)"
          value={formatMoneyCompact(stockValue)}
          icon={Wallet}
          tone="gold"
        />
        <KpiCard
          label="Retail value"
          value={formatMoneyCompact(retailValue)}
          icon={TrendingDown}
          tone="success"
        />
        <KpiCard
          label="Low stock alerts"
          value={String(lowStock.length)}
          icon={AlertTriangle}
          tone={lowStock.length ? "danger" : "success"}
        />
      </div>

      {lowStock.length > 0 && (
        <Card className="border-danger/25 bg-danger/[0.04] p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="size-4 text-danger" />
            <p className="text-sm font-medium text-danger">
              {lowStock.length} item{lowStock.length === 1 ? "" : "s"} at or below the reorder
              threshold
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((product) => (
              <button
                key={product.id}
                onClick={() => canManage && setAdjusting(product)}
                disabled={!canManage}
                className="flex items-center gap-2 rounded-lg border border-danger/25 bg-obsidian-elevated px-2.5 py-1.5 text-xs transition-colors enabled:hover:border-danger/50 disabled:cursor-default"
              >
                <span className="text-ink">{product.name}</span>
                <Badge variant="danger" className="text-[10px]">
                  {product.stock}/{product.lowStockThreshold}
                </Badge>
              </button>
            ))}
          </div>
        </Card>
      )}

      <SectionHeading
        title="Inventory"
        description="Retail shelf stock and back-bar consumables with a full movement log."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input
                className="w-56 pl-9"
                placeholder="Name, brand or SKU…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {/* Presentation only — createProductAction re-checks the same
                capability, since a server action is a callable endpoint. */}
            {canManage && (
              <Button onClick={() => setProductOpen(true)}>
                <PackagePlus />
                New product
              </Button>
            )}
          </div>
        }
      />

      <ProductDialog open={productOpen} onOpenChange={setProductOpen} />

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock levels</TabsTrigger>
          <TabsTrigger value="log">
            <ArrowDownUp className="size-3.5" /> Movement log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              { key: "all", label: "All items" },
              { key: "RETAIL", label: "Retail" },
              { key: "CONSUMABLE", label: "Back-bar" },
            ].map((option) => (
              <button
                key={option.key}
                onClick={() => setTypeFilter(option.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  typeFilter === option.key
                    ? "border-gold/50 bg-gold/12 text-gold-light"
                    : "border-hairline text-muted hover:border-hairline-strong hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Retail</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">In stock</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableEmpty colSpan={9}>No product matches “{query}”.</TableEmpty>
                )}
                {filtered.map((product) => {
                  const out = product.stock <= 0;
                  const low = !out && product.stock <= product.lowStockThreshold;
                  const margin =
                    product.retailPrice > 0
                      ? ((product.retailPrice - product.costPrice) / product.retailPrice) * 100
                      : 0;

                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <p className="font-medium text-ink">{product.name}</p>
                        <p className="text-xs text-faint">{product.brand}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-faint">{product.sku}</TableCell>
                      <TableCell>
                        <Badge variant={product.type === "RETAIL" ? "default" : "neutral"}>
                          {product.type === "RETAIL" ? "Retail" : "Back-bar"}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular text-right text-muted">
                        {formatMoney(product.costPrice)}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted">
                        {product.retailPrice > 0 ? formatMoney(product.retailPrice) : "—"}
                      </TableCell>
                      <TableCell className="tabular text-right text-faint">
                        {product.retailPrice > 0 ? `${margin.toFixed(0)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "tabular font-medium",
                            out ? "text-danger" : low ? "text-warning" : "text-ink",
                          )}
                        >
                          {product.stock} {product.unit}
                        </span>
                        {(out || low) && (
                          <p className="text-[10px] text-faint">min {product.lowStockThreshold}</p>
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted">
                        {formatMoney(product.stock * product.costPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <Button variant="ghost" size="sm" onClick={() => setAdjusting(product)}>
                            Adjust
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockMovements.slice(0, 80).map((movement) => {
                  const meta = MOVEMENT_META[movement.type];
                  return (
                    <TableRow key={movement.id}>
                      <TableCell className="tabular whitespace-nowrap text-xs text-muted">
                        {formatDateTime(movement.at)}
                      </TableCell>
                      <TableCell className="text-ink">
                        {productById.get(movement.productId)?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "tabular text-right font-medium",
                          movement.qty > 0 ? "text-success" : "text-danger",
                        )}
                      >
                        {movement.qty > 0 ? "+" : ""}
                        {movement.qty}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-faint">
                        {movement.note ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted">
                        {movement.staffId ? staffById.get(movement.staffId)?.name : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="border-t border-hairline px-4 py-2.5 text-xs text-faint">
              Showing the 80 most recent movements of {stockMovements.length} recorded.
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      <AdjustStockDialog
        product={adjusting}
        open={Boolean(adjusting)}
        onOpenChange={(open) => !open && setAdjusting(null)}
        staff={staff}
        onSubmit={actions.adjustStock}
      />
    </div>
  );
}

/* --------------------------------------------------------- Adjust stock */

function AdjustStockDialog({
  product,
  open,
  onOpenChange,
  staff,
  onSubmit,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: ReturnType<typeof useSalon>["staff"];
  onSubmit: ReturnType<typeof useSalon>["actions"]["adjustStock"];
}) {
  if (!product) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="default">
        {/* Keyed on the product so opening a different item resets the form. */}
        <AdjustStockForm
          key={product.id}
          product={product}
          staff={staff}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

function AdjustStockForm({
  product,
  staff,
  onCancel,
  onSubmit,
}: {
  product: Product;
  staff: ReturnType<typeof useSalon>["staff"];
  onCancel: () => void;
  onSubmit: ReturnType<typeof useSalon>["actions"]["adjustStock"];
}) {
  const [type, setType] = React.useState<StockMovementType>("STOCK_IN");
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");
  const [staffId, setStaffId] = React.useState("stf_rabia");

  const amount = Number(qty) || 0;
  const outbound = type !== "STOCK_IN" && type !== "ADJUSTMENT";
  const projected = outbound
    ? Math.max(0, product.stock - amount)
    : product.stock + amount;

  return (
    <>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <p className="text-sm text-muted">
            {product.name} · currently {product.stock} {product.unit}
          </p>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label>Movement type</Label>
            <Select value={type} onValueChange={(v) => setType(v as StockMovementType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_MOVEMENT_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {MOVEMENT_META[option].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Quantity ({product.unit})</Label>
            <Input
              type="number"
              min={0}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className="tabular"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Recorded by</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Purchase order number, reason for write-off…"
            />
          </div>

          {amount > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-hairline bg-obsidian-elevated p-3 text-sm">
              <span className="text-muted">Stock after adjustment</span>
              <span className="tabular font-semibold text-gold">
                {projected} {product.unit}
              </span>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={amount <= 0}
            onClick={async () => {
              // `staffId` is taken from the session on the server, not sent
              // from here — the browser cannot attribute a write to someone
              // else.
              await onSubmit({
                productId: product.id,
                type,
                qty: amount,
                note: note.trim() || undefined,
              });
              toast.success(`${product.name} updated — ${projected} ${product.unit} on hand.`);
              onCancel();
            }}
          >
            <PackagePlus /> Record movement
          </Button>
        </DialogFooter>
    </>
  );
}
