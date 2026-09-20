import "server-only";

/**
 * Approximate location for a request IP.
 *
 * Two sources, deliberately in this order:
 *
 *   1. Vercel's own edge headers. Free, already on the request, and add no
 *      latency — the platform resolved the address before the function ran.
 *   2. An external lookup (ipapi.co by default). Slower and rate-limited, but
 *      the only one of the two that knows the carrier, and the only one that
 *      works at all in local development.
 *
 * Nothing here throws. This runs on the path that saves a client's capture,
 * and a geolocation service having a bad day must not be the reason a real
 * location is lost — a row with no city is worth far more than no row.
 */

export interface IpLocation {
  city?: string;
  region?: string;
  country?: string;
  isp?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Swappable without a code change, because the free tiers here are small and
 * the one that fits changes with volume. Anything returning ipapi.co's field
 * names works; `{ip}` is substituted.
 */
const LOOKUP_URL = process.env.IP_GEOLOCATION_URL ?? "https://ipapi.co/{ip}/json/";

/** Past this, the capture is saved without a city rather than kept waiting. */
const LOOKUP_TIMEOUT_MS = 2_000;

/* ------------------------------------------------------------ Client address */

/**
 * The originating client address.
 *
 * `x-forwarded-for` accumulates left to right as a request crosses proxies,
 * so the client is the FIRST entry — later ones are infrastructure. Behind
 * Vercel the list is set by the platform; anywhere the header can be set by
 * the caller it is a claim, not a fact, and this address is therefore only
 * ever used for coarse location and rate limiting.
 */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

/**
 * Addresses that can never resolve to a place: loopback, RFC1918 private
 * ranges, link-local, and IPv6 equivalents. Sending these to a lookup service
 * spends a request to be told what we already know, and in development every
 * request is one of them.
 */
export function isPrivateAddress(ip: string): boolean {
  if (ip === "::1" || ip === "0.0.0.0" || ip.toLowerCase() === "unknown") return true;
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  // Unique-local and link-local IPv6.
  if (/^f[cd]/i.test(ip) || /^fe80:/i.test(ip)) return true;
  return false;
}

/* ------------------------------------------------------------ Vercel headers */

function numberOrUndefined(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * What the platform already worked out.
 *
 * Present on every Vercel deployment and absent everywhere else, which is why
 * the external lookup still exists. City and region arrive percent-encoded
 * ("Rawalpindi" is fine, "New%20York" is not) — decoding can throw on a
 * malformed value, so it is guarded.
 */
function fromVercelHeaders(headers: Headers): IpLocation {
  const decode = (value: string | null) => {
    if (!value) return undefined;
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return value;
    }
  };

  return {
    city: decode(headers.get("x-vercel-ip-city")),
    region: decode(headers.get("x-vercel-ip-country-region")),
    country: decode(headers.get("x-vercel-ip-country")),
    latitude: numberOrUndefined(headers.get("x-vercel-ip-latitude")),
    longitude: numberOrUndefined(headers.get("x-vercel-ip-longitude")),
  };
}

/* ----------------------------------------------------------- External lookup */

interface LookupResponse {
  city?: string;
  region?: string;
  country_name?: string;
  country?: string;
  org?: string;
  isp?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
  error?: boolean;
  reason?: string;
}

/**
 * Accepts either of the two common response shapes — ipapi.co's
 * (`country_name`, `org`, `latitude`) and ip-api.com's (`country`, `isp`,
 * `lat`) — so `IP_GEOLOCATION_URL` can point at either without a code change.
 */
async function fromLookupService(ip: string): Promise<IpLocation> {
  try {
    const response = await fetch(LOOKUP_URL.replace("{ip}", encodeURIComponent(ip)), {
      headers: { Accept: "application/json", "User-Agent": "sanas-salon/1.0" },
      // This is a per-visitor value; caching it would hand one client's city
      // to the next.
      cache: "no-store",
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`[ip-lookup] ${response.status} for ${ip}`);
      return {};
    }

    const data = (await response.json()) as LookupResponse;
    // Rate limiting arrives as HTTP 200 with an error flag, not as a status
    // code — treating the body as a location would store "undefined" cities.
    if (data.error) {
      console.warn(`[ip-lookup] service refused: ${data.reason ?? "unknown"}`);
      return {};
    }

    return {
      city: data.city || undefined,
      region: data.region || undefined,
      country: data.country_name || data.country || undefined,
      isp: data.org || data.isp || undefined,
      latitude: data.latitude ?? data.lat,
      longitude: data.longitude ?? data.lon,
    };
  } catch (error) {
    // Includes the timeout. Logged, never rethrown.
    console.warn("[ip-lookup] failed:", error instanceof Error ? error.message : error);
    return {};
  }
}

/* -------------------------------------------------------------------- Merge */

/**
 * Best available approximate location, or an empty object.
 *
 * Vercel's answer wins on any field both provide: it comes from the same
 * network that accepted the request, and it cost nothing. The lookup fills
 * the gaps — in practice the carrier, which Vercel does not report.
 *
 * The lookup is skipped entirely when the headers already answer everything
 * except the carrier AND the caller says the carrier is not needed, which is
 * how a deployment avoids a per-request round trip once it outgrows a free
 * tier: set `IP_GEOLOCATION_URL=off`.
 */
export async function lookupIpLocation(
  ip: string | null,
  headers: Headers,
): Promise<IpLocation> {
  const fromHeaders = fromVercelHeaders(headers);

  if (!ip || isPrivateAddress(ip) || LOOKUP_URL === "off") return fromHeaders;

  const fromService = await fromLookupService(ip);

  return {
    city: fromHeaders.city ?? fromService.city,
    region: fromHeaders.region ?? fromService.region,
    country: fromHeaders.country ?? fromService.country,
    isp: fromService.isp,
    latitude: fromHeaders.latitude ?? fromService.latitude,
    longitude: fromHeaders.longitude ?? fromService.longitude,
  };
}
