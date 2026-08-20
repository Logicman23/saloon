"use client";

import * as React from "react";
import { AlertTriangle, Clock, Layers, Package, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/misc";
import { useSalon } from "@/lib/data/store";
import { SERVICE_CATEGORIES } from "@/lib/types";
import type { Product, Service, ServicePackage } from "@/lib/types";
import { cn, formatDuration, formatMoney } from "@/lib/utils";

export type CatalogPick =
  | { kind: "SERVICE"; item: Service }
  | { kind: "PRODUCT"; item: Product }
  | { kind: "PACKAGE"; item: ServicePackage };

/**
 * The left half of the POS: a fast, filterable grid of everything that can go
 * on a ticket. Tap adds straight to the cart — no intermediate dialog.
 */
export function Catalog({ onPick }: { onPick: (pick: CatalogPick) => void }) {
  const { services, products, packages } = useSalon();
  const [tab, setTab] = React.useState("services");
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");

  const q = query.trim().toLowerCase();

  const visibleServices = React.useMemo(
    () =>
      services.filter(
        (s) =>
          s.active &&
          // Archived services stay in the store so past bookings can still
          // resolve their names; they must not be sellable.
          !s.archived &&
          (category === "all" || s.category === category) &&
          (!q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)),
      ),
    [services, category, q],
  );

  const visibleProducts = React.useMemo(
    () =>
      products.filter(
        (p) =>
          p.type === "RETAIL" &&
          (!q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
      ),
    [products, q],
  );

  const visiblePackages = React.useMemo(
    () => packages.filter((p) => p.active && (!q || p.name.toLowerCase().includes(q))),
    [packages, q],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Controls */}
      <div className="space-y-3 border-b border-hairline p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={setTab} className="shrink-0">
            <TabsList>
              <TabsTrigger value="services">
                <Sparkles className="size-3.5" /> Services
              </TabsTrigger>
              <TabsTrigger value="packages">
                <Layers className="size-3.5" /> Packages
              </TabsTrigger>
              <TabsTrigger value="products">
                <Package className="size-3.5" /> Retail
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              className="pl-9"
              placeholder="Search the catalogue…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {tab === "services" && (
          <div className="flex flex-wrap gap-1.5">
            {["all", ...SERVICE_CATEGORIES].map((cat) => (
              <button
                key={cat}
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
        )}
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "services" && (
          <Grid empty={visibleServices.length === 0} emptyLabel="No services match your search.">
            {visibleServices.map((service) => (
              <CatalogTile
                key={service.id}
                title={service.name}
                meta={
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatDuration(service.durationMin)}
                  </span>
                }
                tag={service.category}
                price={service.price}
                onClick={() => onPick({ kind: "SERVICE", item: service })}
              />
            ))}
          </Grid>
        )}

        {tab === "packages" && (
          <Grid empty={visiblePackages.length === 0} emptyLabel="No packages match your search.">
            {visiblePackages.map((pkg) => {
              const listPrice = pkg.serviceIds.reduce(
                (sum, id) => sum + (services.find((s) => s.id === id)?.price ?? 0),
                0,
              );
              const saving = listPrice - pkg.price;
              return (
                <CatalogTile
                  key={pkg.id}
                  title={pkg.name}
                  meta={<span>{pkg.serviceIds.length} services included</span>}
                  tag="Package"
                  price={pkg.price}
                  strikePrice={saving > 0 ? listPrice : undefined}
                  highlight
                  onClick={() => onPick({ kind: "PACKAGE", item: pkg })}
                />
              );
            })}
          </Grid>
        )}

        {tab === "products" && (
          <Grid empty={visibleProducts.length === 0} emptyLabel="No retail products match.">
            {visibleProducts.map((product) => {
              const out = product.stock <= 0;
              const low = !out && product.stock <= product.lowStockThreshold;
              return (
                <CatalogTile
                  key={product.id}
                  title={product.name}
                  meta={
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        out && "text-danger",
                        low && "text-warning",
                      )}
                    >
                      {(out || low) && <AlertTriangle className="size-3" />}
                      {out ? "Out of stock" : `${product.stock} ${product.unit} in stock`}
                    </span>
                  }
                  tag={product.brand}
                  price={product.retailPrice}
                  disabled={out}
                  onClick={() => onPick({ kind: "PRODUCT", item: product })}
                />
              );
            })}
          </Grid>
        )}
      </div>
    </div>
  );
}

function Grid({
  children,
  empty,
  emptyLabel,
}: {
  children: React.ReactNode;
  empty: boolean;
  emptyLabel: string;
}) {
  if (empty) return <EmptyState icon={Search} title={emptyLabel} />;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">{children}</div>
  );
}

function CatalogTile({
  title,
  meta,
  tag,
  price,
  strikePrice,
  highlight,
  disabled,
  onClick,
}: {
  title: string;
  meta: React.ReactNode;
  tag: string;
  price: number;
  strikePrice?: number;
  highlight?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex h-full flex-col justify-between gap-2 rounded-xl border p-3 text-left transition-all duration-200 ease-[var(--ease-luxury)]",
        "border-hairline bg-charcoal hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-[0_12px_30px_-18px_rgba(212,175,55,0.6)]",
        highlight && "border-gold/25 bg-gradient-to-br from-gold/[0.07] to-transparent",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <div className="space-y-1.5">
        <Badge variant={highlight ? "default" : "neutral"} className="text-[10px]">
          {tag}
        </Badge>
        <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">{title}</p>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] text-faint">{meta}</p>
        <p className="flex items-baseline gap-1.5">
          <span className="tabular text-sm font-semibold text-gold">{formatMoney(price)}</span>
          {strikePrice && (
            <span className="tabular text-[11px] text-faint line-through">
              {formatMoney(strikePrice)}
            </span>
          )}
        </p>
      </div>
    </button>
  );
}
