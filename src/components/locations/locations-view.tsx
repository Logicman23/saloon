"use client";

import * as React from "react";
import { Crosshair, ExternalLink, MapPin, Search, Target, UserCheck, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/misc";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ProtectedRoute } from "@/lib/auth/context";
import { formatDateTime, formatRelative } from "@/lib/date";
import { describeDevice } from "@/lib/device";
import { cn } from "@/lib/utils";
import type { ClientLocation } from "@/lib/types";

/** True when there is a coordinate pair worth putting on a map. */
function hasCoords(
  location: ClientLocation,
): location is ClientLocation & { latitude: number; longitude: number } {
  return location.latitude !== undefined && location.longitude !== undefined;
}

/** Opens the coordinates in Google Maps — the link the salon actually acts on. */
function mapsUrl(location: ClientLocation & { latitude: number; longitude: number }) {
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

/** `Rawalpindi, Punjab` — the IP-derived place, as much of it as is known. */
function describePlace(location: ClientLocation) {
  return [location.city, location.region, location.country].filter(Boolean).join(", ");
}

/**
 * Embeddable map for the preview pane.
 *
 * `output=embed` is used rather than the Maps Embed API because the latter
 * requires a billed API key. This form needs none, which keeps the preview
 * from becoming a deployment prerequisite — if Google ever drops it, the
 * "Open in Google Maps" link is unaffected and remains the primary action.
 */
function embedUrl(location: ClientLocation & { latitude: number; longitude: number }) {
  return `https://maps.google.com/maps?q=${location.latitude},${location.longitude}&z=16&output=embed`;
}

/** `31.520370, 74.358749` — six decimals, which is where GPS precision ends. */
function formatCoords(location: ClientLocation) {
  // A dash, not "No coordinates" — the Map cell in the same row already says
  // that, and the phrase twice across one row reads like a rendering fault.
  if (!hasCoords(location)) return "—";
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

/**
 * The badge that stops someone driving to the wrong address.
 *
 * An IP fix routinely lands tens of kilometres out — on a mobile network the
 * address can belong to a carrier gateway in another city — so the two are
 * coloured as far apart as the palette allows rather than shaded by degree.
 */
function SourceBadge({ type }: { type: ClientLocation["locationType"] }) {
  return type === "GPS_PRECISE" ? (
    <Badge variant="success">
      <Crosshair className="size-3" />
      GPS Precise
    </Badge>
  ) : (
    <Badge variant="warning">
      <MapPin className="size-3" />
      IP Approx
    </Badge>
  );
}

export function LocationsView({ locations }: { locations: ClientLocation[] }) {
  return (
    <ProtectedRoute requires={["locations.view"]}>
      <Locations locations={locations} />
    </ProtectedRoute>
  );
}

function Locations({ locations }: { locations: ClientLocation[] }) {
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // `new Date()` once per mount rather than per row, so every "3 hours ago" on
  // the screen is measured from the same instant.
  const now = React.useMemo(() => new Date(), []);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return locations;
    // Digits are matched separately so "0331 272" finds a capture stored as
    // "923312721327" — the same mismatch the API route resolves against.
    const digits = needle.replace(/\D/g, "");
    return locations.filter((location) => {
      const haystack = [
        location.clientName,
        location.clientPhone,
        location.clientRef,
        location.city,
        location.region,
        location.country,
        location.deviceType,
        location.os,
        location.browser,
        location.deviceModel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (haystack.includes(needle)) return true;
      return digits.length >= 3 && haystack.replace(/\D/g, "").includes(digits);
    });
  }, [locations, query]);

  const selected = React.useMemo(() => {
    const match = filtered.find((location) => location.id === selectedId);
    // Re-checked rather than trusted from the click: a search that filters the
    // selected row away, or a row with no fix, must not leave a stale preview.
    return match && hasCoords(match) ? match : null;
  }, [filtered, selectedId]);

  const stats = React.useMemo(() => {
    // Distinct *people*, keyed by the resolved client where there is one and
    // by the raw reference otherwise — so one client who confirmed three
    // times counts once, and two unmatched numbers count as two.
    const people = new Set(locations.map((l) => l.clientId ?? `ref:${l.clientRef}`));
    const matched = locations.filter((l) => l.clientId).length;
    const precise = locations.filter((l) => l.locationType === "GPS_PRECISE").length;
    return { people: people.size, matched, precise };
  }, [locations]);

  const latest = locations[0];

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Client Locations"
        description="GPS fixes clients confirmed by opening their tracking link."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Confirmations"
          value={String(locations.length)}
          sublabel={latest ? `Last ${formatRelative(latest.capturedAt, now)}` : "None yet"}
          icon={MapPin}
        />
        <KpiCard
          label="Clients located"
          value={String(stats.people)}
          sublabel="Distinct people who confirmed"
          icon={Target}
          tone="success"
        />
        <KpiCard
          label="Matched to a profile"
          value={`${stats.matched} of ${locations.length}`}
          sublabel="The rest show the number from the link"
          icon={UserCheck}
          tone={stats.matched === locations.length ? "success" : "warning"}
        />
        <KpiCard
          label="GPS confirmed"
          value={`${stats.precise} of ${locations.length}`}
          sublabel="The rest are approximate, from the IP address"
          icon={Crosshair}
          tone={stats.precise === locations.length ? "success" : "warning"}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline p-4">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or number…"
                className="pl-9"
                aria-label="Search client locations"
              />
            </div>
            <p className="text-sm text-faint">
              {filtered.length} of {locations.length}
            </p>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Coordinates</TableHead>
                <TableHead>Recorded</TableHead>
                <TableHead className="text-right">Map</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmpty colSpan={7}>
                  {locations.length === 0
                    ? "No locations confirmed yet. Send a client their /track?client=<phone> link to capture one."
                    : "No capture matches that search."}
                </TableEmpty>
              ) : (
                filtered.map((location) => {
                  const isSelected = location.id === selectedId;
                  return (
                    <TableRow
                      key={location.id}
                      data-state={isSelected ? "selected" : undefined}
                      onClick={() =>
                        hasCoords(location) && setSelectedId(isSelected ? null : location.id)
                      }
                      className={cn(hasCoords(location) && "cursor-pointer")}
                    >
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">
                            {location.clientName ?? location.clientRef}
                          </p>
                          <p className="truncate text-xs text-faint">
                            {location.clientName ? (
                              location.clientPhone ?? location.clientRef
                            ) : (
                              <span className="text-warning">Not matched to a client</span>
                            )}
                          </p>
                        </div>
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        <SourceBadge type={location.locationType} />
                        {location.accuracyM !== undefined && (
                          // 100 m is roughly where a fix stops being a street
                          // address and starts being a neighbourhood.
                          <p
                            className={cn(
                              "mt-1 text-xs",
                              location.accuracyM <= 100 ? "text-success" : "text-warning",
                            )}
                          >
                            ± {location.accuracyM} m
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="max-w-48">
                        <p className="truncate text-ink">
                          {describePlace(location) || <span className="text-faint">Unknown</span>}
                        </p>
                        {location.isp && (
                          <p className="truncate text-xs text-faint">{location.isp}</p>
                        )}
                      </TableCell>

                      <TableCell className="max-w-56">
                        <p className="truncate text-muted">{describeDevice(location)}</p>
                      </TableCell>

                      <TableCell className="tabular whitespace-nowrap text-muted">
                        {formatCoords(location)}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        <p className="text-ink">{formatDateTime(location.capturedAt)}</p>
                        <p className="text-xs text-faint">
                          {formatRelative(location.capturedAt, now)}
                        </p>
                      </TableCell>

                      <TableCell className="text-right">
                        {hasCoords(location) ? (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            // The row toggles the preview; the link must not.
                            onClick={(event) => event.stopPropagation()}
                          >
                            <a
                              href={mapsUrl(location)}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open ${location.clientName ?? location.clientRef}'s location in Google Maps`}
                            >
                              <ExternalLink />
                              Open in Google Maps
                            </a>
                          </Button>
                        ) : (
                          // The IP lookup found nothing and GPS was never
                          // granted. The row still carries the device and the
                          // visit; there is simply nowhere to point a map.
                          <span className="text-xs text-faint">No coordinates</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected && <MapPreview location={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

/**
 * Inline map for the selected row.
 *
 * Rendered only on selection rather than one iframe per row: a table of
 * embedded maps would fire a third-party request for every capture on the
 * screen, which is both slow and more of the salon's client data leaving the
 * page than anyone asked for.
 */
function MapPreview({
  location,
  onClose,
}: {
  location: ClientLocation & { latitude: number; longitude: number };
  onClose: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium text-ink">
                {location.clientName ?? location.clientRef}
              </p>
              <SourceBadge type={location.locationType} />
            </div>
            <p className="tabular truncate text-xs text-faint">
              {formatCoords(location)}
              {location.locationType === "IP_APPROX" &&
                " · approximate, from the IP address"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={mapsUrl(location)} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Open in Google Maps
              </a>
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close map preview">
              <X />
            </Button>
          </div>
        </div>

        <iframe
          key={location.id}
          src={embedUrl(location)}
          title={`Map of ${location.clientName ?? location.clientRef}'s confirmed location`}
          loading="lazy"
          // No-referrer: the embed URL carries a client's coordinates, so the
          // page it was opened from is not Google's to learn.
          referrerPolicy="no-referrer"
          className={cn("h-[320px] w-full border-0 sm:h-[420px]")}
        />
      </CardContent>
    </Card>
  );
}
