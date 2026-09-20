import type { Metadata } from "next";
import { TrackView } from "./track-view";

/**
 * Client-facing location confirmation.
 *
 * Lives outside the `(app)` route group on purpose: the person opening this
 * link is a salon customer, not a user of the management system, so they get
 * no sidebar, no session and no salon data — just the confirmation. See the
 * matcher note in `src/middleware.ts` for why it is exempt from auth.
 */
export const metadata: Metadata = {
  title: "Confirm your location",
  robots: { index: false, follow: false },
};

/** The link is unique per client, so it must never be cached or prerendered. */
export const dynamic = "force-dynamic";

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string | string[] }>;
}) {
  const params = await searchParams;

  // A repeated `?client=` yields an array; take the first rather than
  // stringifying the whole thing into a nonsense identifier.
  const raw = Array.isArray(params.client) ? params.client[0] : params.client;

  return <TrackView clientRef={raw?.trim() ?? ""} />;
}
