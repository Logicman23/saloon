"use client";

import * as React from "react";
import { toast } from "sonner";
import { Clock, Layers, Pencil, Plus, Search, Sparkles, Tag, Trash2 } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, SectionHeading } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { useAuth } from "@/lib/auth/context";
import { ServiceDialog } from "@/components/services/service-dialog";
import { PackageDialog } from "@/components/services/package-dialog";
import { SERVICE_CATEGORIES, type Service, type ServicePackage } from "@/lib/types";
import { cn, formatDuration, formatMoney } from "@/lib/utils";

export default function ServicesPage() {
  const { services, packages, appointments, actions } = useSalon();
  const { can } = useAuth();
  const canManage = can("services.manage");
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [serviceOpen, setServiceOpen] = React.useState(false);
  const [packageOpen, setPackageOpen] = React.useState(false);
  const [editingDeal, setEditingDeal] = React.useState<ServicePackage | null>(null);
  const [removingDeal, setRemovingDeal] = React.useState<ServicePackage | null>(null);
  const [editingService, setEditingService] = React.useState<Service | null>(null);
  const [removingService, setRemovingService] = React.useState<Service | null>(null);

  /**
   * The two dependencies `archiveServiceAction` refuses on, surfaced before
   * the click rather than after it.
   *
   * The server is still the authority — the store only holds a calendar
   * window, so a booking further out would be missed here and caught there.
   * This exists so the common case explains itself instead of failing.
   */
  const serviceBlockers = React.useMemo(() => {
    if (!removingService) return null;
    const now = new Date().toISOString();
    return {
      upcoming: appointments.filter(
        (a) =>
          a.serviceIds.includes(removingService.id) &&
          a.start >= now &&
          (a.status === "SCHEDULED" || a.status === "IN_PROGRESS"),
      ).length,
      deals: packages.filter((p) => p.serviceIds.includes(removingService.id)),
    };
  }, [removingService, appointments, packages]);

  const q = query.trim().toLowerCase();

  /**
   * The catalogue, minus anything archived.
   *
   * `services` deliberately still carries archived rows — the calendar and the
   * revenue analytics resolve historical bookings through it — so every view
   * that presents the *current* catalogue filters them here.
   */
  const live = React.useMemo(() => services.filter((s) => !s.archived), [services]);

  const filtered = React.useMemo(
    () =>
      live.filter(
        (s) =>
          (category === "all" || s.category === category) &&
          (!q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)),
      ),
    [live, category, q],
  );

  const byCategory = React.useMemo(
    () =>
      SERVICE_CATEGORIES.map((cat) => {
        const own = live.filter((s) => s.category === cat);
        return {
          category: cat,
          count: own.length,
          avgPrice: own.length ? own.reduce((sum, s) => sum + s.price, 0) / own.length : 0,
        };
      }),
    [live],
  );

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Service catalogue"
        description="Pricing, chair time and bundled package deals."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input
                className="w-56 pl-9"
                placeholder="Search services…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {/* Presentation only — createServiceAction re-checks the same
                capability, since a server action is a callable endpoint. */}
            {canManage && (
              <>
                <Button variant="outline" onClick={() => setPackageOpen(true)}>
                  <Layers />
                  New deal
                </Button>
                <Button onClick={() => setServiceOpen(true)}>
                  <Plus />
                  New service
                </Button>
              </>
            )}
          </div>
        }
      />

      <ServiceDialog open={serviceOpen} onOpenChange={setServiceOpen} />
      <ServiceDialog
        service={editingService}
        open={Boolean(editingService)}
        onOpenChange={(open) => !open && setEditingService(null)}
      />

      <ConfirmDialog
        open={Boolean(removingService)}
        onOpenChange={(open) => !open && setRemovingService(null)}
        title="Delete this service?"
        description={
          removingService
            ? `${removingService.name} will come off the booking menu, the POS catalogue and the deal builder.`
            : undefined
        }
        confirmLabel="Delete service"
        pendingLabel="Deleting…"
        // Blocked outright when something still depends on it. The modal says
        // what, so the button being dead is an instruction rather than a bug.
        confirmDisabled={Boolean(
          serviceBlockers && (serviceBlockers.upcoming > 0 || serviceBlockers.deals.length > 0),
        )}
        onConfirm={async () => {
          if (!removingService) return;
          const result = await actions.archiveService(removingService.id);
          if (!result.ok) return result.error;
          toast.success(`${result.data.name} removed from the catalogue.`);
        }}
      >
        <p className="text-sm text-muted">
          Past appointments and invoices keep it — the service is retired, not erased, so the
          calendar history and the category revenue split still read correctly.
        </p>

        {serviceBlockers && serviceBlockers.upcoming > 0 && (
          <p className="rounded-lg border border-danger/25 bg-danger/[0.06] p-3 text-sm text-danger">
            {serviceBlockers.upcoming === 1
              ? "1 upcoming booking still includes this service."
              : `${serviceBlockers.upcoming} upcoming bookings still include this service.`}{" "}
            Complete or cancel {serviceBlockers.upcoming === 1 ? "it" : "them"} first.
          </p>
        )}

        {serviceBlockers && serviceBlockers.deals.length > 0 && (
          <div className="rounded-lg border border-danger/25 bg-danger/[0.06] p-3">
            <p className="text-sm text-danger">
              Bundled into {serviceBlockers.deals.length === 1 ? "a deal" : "deals"} — remove it
              there first, or the bundle keeps selling a service that is gone:
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {serviceBlockers.deals.map((deal) => (
                <li key={deal.id} className="text-xs text-muted">
                  · {deal.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {serviceBlockers &&
          serviceBlockers.upcoming === 0 &&
          serviceBlockers.deals.length === 0 &&
          removingService?.active && (
            <p className="rounded-lg border border-hairline bg-obsidian-elevated p-3 text-xs text-faint">
              To take it off the menu temporarily instead, edit the service and switch{" "}
              <span className="text-muted">Bookable now</span> off — it stays on this page and can
              be switched back on.
            </p>
          )}
      </ConfirmDialog>

      <PackageDialog open={packageOpen} onOpenChange={setPackageOpen} />
      <PackageDialog
        deal={editingDeal}
        open={Boolean(editingDeal)}
        onOpenChange={(open) => !open && setEditingDeal(null)}
      />

      <ConfirmDialog
        open={Boolean(removingDeal)}
        onOpenChange={(open) => !open && setRemovingDeal(null)}
        title="Delete this deal?"
        description={
          removingDeal
            ? `${removingDeal.name} will come off the deals grid and the POS catalogue.`
            : undefined
        }
        confirmLabel="Delete deal"
        pendingLabel="Deleting…"
        onConfirm={async () => {
          if (!removingDeal) return;
          const result = await actions.archivePackage(removingDeal.id);
          if (!result.ok) return result.error;
          toast.success(`${result.data.name} removed from deals.`);
        }}
      >
        <p className="text-sm text-muted">
          The bundle record is kept, so an invoice already raised against it still shows what
          was sold. The member services are untouched and stay individually bookable.
        </p>
        {removingDeal?.active && (
          <p className="rounded-lg border border-hairline bg-obsidian-elevated p-3 text-xs text-faint">
            To pause it for a season instead, edit the deal and switch{" "}
            <span className="text-muted">Sellable now</span> off — it stays on this page and can
            be switched back on.
          </p>
        )}
      </ConfirmDialog>

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
            <Sparkles className="size-3.5" /> Services ({live.length})
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
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableEmpty colSpan={7}>No service matches “{query}”.</TableEmpty>
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
                    <TableCell className="text-right">
                      {canManage && (
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingService(service)}
                          >
                            <Pencil />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={`Delete ${service.name}`}
                            className="hover:bg-danger/10 hover:text-danger"
                            onClick={() => setRemovingService(service)}
                          >
                            <Trash2 />
                            <span className="sr-only">Delete {service.name}</span>
                          </Button>
                        </div>
                      )}
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
                      <div className="flex shrink-0 items-center gap-1.5">
                        {/* Paused deals stay on this page but are off the POS.
                            Without this the only difference between a paused
                            deal and a live one is invisible. */}
                        {!pkg.active && <Badge variant="neutral">Paused</Badge>}
                        {saving > 0 && <Badge variant="success">Save {savingPct.toFixed(0)}%</Badge>}
                      </div>
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

                  {canManage && (
                    <CardFooter className="justify-end gap-1 border-gold/15 px-5 py-3">
                      <Button variant="ghost" size="sm" onClick={() => setEditingDeal(pkg)}>
                        <Pencil />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={`Delete ${pkg.name}`}
                        className="hover:bg-danger/10 hover:text-danger"
                        onClick={() => setRemovingDeal(pkg)}
                      >
                        <Trash2 />
                        <span className="sr-only">Delete {pkg.name}</span>
                      </Button>
                    </CardFooter>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
