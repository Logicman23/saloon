import type { Metadata } from "next";
import { LocationsView } from "@/components/locations/locations-view";
import { DatabaseUnavailable } from "@/components/layout/database-unavailable";
import { getClientLocations } from "@/lib/db/queries";
import type { ClientLocation } from "@/lib/types";

export const metadata: Metadata = { title: "Location" };

/**
 * Confirmed client locations.
 *
 * Fetched here rather than added to `SalonProvider`, because that store is
 * loaded on every authenticated request — putting a table only this screen
 * reads into it would make every other page pay for it.
 *
 * Access is enforced by middleware via `ROUTE_PERMISSIONS`; `LocationsView`
 * re-checks with `<ProtectedRoute>` so the UI stays coherent, matching how
 * every other module in the app is guarded.
 */
export default async function LocationsPage() {
  let locations: ClientLocation[];
  try {
    locations = await getClientLocations();
  } catch (error) {
    // Same reasoning as `(app)/layout.tsx`: an unmigrated database should name
    // itself rather than throw a stack trace the salon cannot act on. This
    // table arrives in its own migration, so "migration not applied" is the
    // most likely cause of a failure here specifically.
    console.error("[locations] failed to load captures:", error);
    return <DatabaseUnavailable />;
  }

  return <LocationsView locations={locations} />;
}
