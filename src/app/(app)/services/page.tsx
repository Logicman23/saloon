"use client";

import * as React from "react";
import { Clock, Layers, Search, Sparkles, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, SectionHeading } from "@/components/ui/misc";
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
import { useSalon } from "@/lib/data/store";
import { SERVICE_CATEGORIES } from "@/lib/types";
import { cn, formatDuration, formatMoney } from "@/lib/utils";

export default function ServicesPage() {
  const { services, packages } = useSalon();
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");

  const q = query.trim().toLowerCase();

  const filtered = React.useMemo(
    () =>
      services.filter(
        (s) =>
          (category === "all" || s.category === category) &&
          (!q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)),
      ),
    [services, category, q],
  );

  const byCategory = React.useMemo(
    () =>
      SERVICE_CATEGORIES.map((cat) => {
        const own = services.filter((s) => s.category === cat);
        return {
          category: cat,
          count: own.length,
          avgPrice: own.length ? own.reduce((sum, s) => sum + s.price, 0) / own.length : 0,
        };
      }),
    [services],
  );

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Service catalogue"
        description="Pricing, chair time and bundled package deals."
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              className="w-56 pl-9"
              placeholder="Search services…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        }
      />

      {/* Category summary */}
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {byCategory.map((row) => (
          <Card key={row.category} interactive className="p-4">
            <p className="text-sm font-medium text-ink">{row.category}</p>
            <p className="tabular mt-1 text-2xl font-semibold text-gold">{row.count}</p>
            <p className="mt-0.5 text-xs text-faint">
              avg {formatMoney(Math.round(row.avgPrice))}
            </p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">
            <Sparkles className="size-3.5" /> Services ({services.length})
          </TabsTrigger>
          <TabsTrigger value="packages">
            <Layers className="size-3.5" /> Packages ({packages.length})
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------ Services */}
        <TabsContent value="services">
          <div className="mb-3 flex flex-wrap gap-1.5">
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

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Rate / hour</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableEmpty colSpan={6}>No service matches “{query}”.</TableEmpty>
                )}
                {filtered.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell>
                      <p className="font-medium text-ink">{service.name}</p>
                      {service.description && (
                        <p className="mt-0.5 max-w-md truncate text-xs text-faint">
                          {service.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{service.category}</Badge>
                    </TableCell>
                    <TableCell className="tabular text-right text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatDuration(service.durationMin)}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-right font-medium text-gold">
                      {formatMoney(service.price)}
                    </TableCell>
                    <TableCell className="tabular text-right text-faint">
                      {formatMoney(Math.round((service.price / service.durationMin) * 60))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={service.active ? "success" : "neutral"}>
                        {service.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------ Packages */}
        <TabsContent value="packages">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {packages.length === 0 && (
              <EmptyState icon={Layers} title="No packages configured" className="col-span-full" />
            )}
            {packages.map((pkg) => {
              const members = pkg.serviceIds
                .map((id) => services.find((s) => s.id === id))
                .filter((s): s is NonNullable<typeof s> => Boolean(s));
              const listPrice = members.reduce((sum, s) => sum + s.price, 0);
              const saving = listPrice - pkg.price;
              const savingPct = listPrice ? (saving / listPrice) * 100 : 0;
              const duration = members.reduce((sum, s) => sum + s.durationMin, 0);

              return (
                <Card
                  key={pkg.id}
                  interactive
                  className="flex flex-col border-gold/20 bg-gradient-to-br from-gold/[0.06] to-transparent"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="font-display text-lg">{pkg.name}</CardTitle>
                      {saving > 0 && (
                        <Badge variant="success" className="shrink-0">
                          Save {savingPct.toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                    {pkg.description && (
                      <p className="text-sm text-muted">{pkg.description}</p>
                    )}
                  </CardHeader>

                  <CardContent className="flex-1 space-y-3">
                    <ul className="space-y-1.5">
                      {members.map((service) => (
                        <li key={service.id} className="flex items-center gap-2 text-sm">
                          <Tag className="size-3 shrink-0 text-gold/60" />
                          <span className="min-w-0 flex-1 truncate text-muted">{service.name}</span>
                          <span className="tabular shrink-0 text-xs text-faint">
                            {formatMoney(service.price)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="space-y-1 border-t border-gold/15 pt-3">
                      <div className="flex items-center justify-between text-xs text-faint">
                        <span>Individually</span>
                        <span className="tabular line-through">{formatMoney(listPrice)}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-muted">Package price</span>
                        <span className="tabular text-xl font-semibold text-gilded">
                          {formatMoney(pkg.price)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-faint">
                          <Clock className="size-3" />
                          {formatDuration(duration)} total
                        </span>
                        {saving > 0 && (
                          <span className="tabular text-success">
                            saves {formatMoney(saving)}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
