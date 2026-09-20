/**
 * What kind of device is looking at the tracking page.
 *
 * Browser-only — it reads `navigator` and `screen`, so it must not be imported
 * from a Server Component.
 *
 * Two sources, in order of trust:
 *
 *   1. `navigator.userAgentData` (Chromium). Structured, and the only place
 *      an Android phone will tell you it is a Pixel 8 running Android 14 —
 *      Chrome froze that detail out of the UA string years ago.
 *   2. The UA string. Universally available, ambiguous by design, and the
 *      only option on Safari and Firefox.
 *
 * Everything here is self-reported by the client and trivially forged. It is
 * for "which phone should I talk them through", never for anything that
 * decides access.
 */

export interface DeviceInfo {
  type: "Mobile" | "Tablet" | "Desktop" | "Unknown";
  /** `Android 14`, `iOS 17.4`, `Windows 11`. Omitted rather than guessed. */
  os?: string;
  /** `Chrome 131`, `Safari 17.4`. */
  browser?: string;
  /** `Pixel 8`, `SM-G991B`. Chromium on Android only; nobody else reports it. */
  model?: string;
  /** Physical pixels, narrow side first: `1080x2400`. */
  screen?: string;
}

/* ----------------------------------------------------- Client-hints source */

/**
 * The subset of `NavigatorUAData` used here.
 *
 * Declared locally because TypeScript's DOM library still does not ship it,
 * and widening `Navigator` globally would assert it exists on browsers where
 * it does not.
 */
interface UADataBrand {
  brand: string;
  version: string;
}
interface UAData {
  mobile: boolean;
  brands: UADataBrand[];
  getHighEntropyValues?: (hints: string[]) => Promise<{
    platform?: string;
    platformVersion?: string;
    model?: string;
    fullVersionList?: UADataBrand[];
  }>;
}

/**
 * Chromium pads every brand list with a deliberately nonsensical entry (the
 * "GREASE" brand) to stop anyone hard-coding a fixed shape, and lists the
 * generic engine alongside the real product. Neither is the browser's name.
 */
function realBrand(brands: UADataBrand[] | undefined): UADataBrand | undefined {
  return brands?.find(
    (b) => !/not.?a.?brand/i.test(b.brand) && !/^chromium$/i.test(b.brand),
  );
}

/**
 * Windows reports a platform version that is not the Windows version.
 *
 * Chromium maps the OS build onto a scale of its own where 1–12 is Windows 10
 * and 13+ is Windows 11 — so the raw value ("15.0.0") is not something to
 * show anyone. Everything else reports its version honestly.
 */
function formatPlatform(platform: string | undefined, version: string | undefined) {
  if (!platform) return undefined;
  const major = Number.parseInt(version ?? "", 10);

  if (platform === "Windows") {
    if (!Number.isFinite(major)) return "Windows";
    return major >= 13 ? "Windows 11" : "Windows 10";
  }

  // Trailing ".0" groups are noise on every other platform: "Android 14.0.0"
  // is how the hint arrives and "Android 14" is how a person writes it.
  const trimmed = version?.replace(/(\.0)+$/, "");
  return trimmed ? `${platform} ${trimmed}` : platform;
}

/* -------------------------------------------------------- UA string source */

function osFromUserAgent(ua: string, platform: string): string | undefined {
  // Checked before Android: some Android builds put "Linux" in the UA too.
  const ios = /(?:iPhone|iPad|iPod).*?OS (\d+)[_.](\d+)/.exec(ua);
  if (ios) return `iOS ${ios[1]}.${ios[2]}`;

  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return `Android ${android[1]}`;

  // An iPad in desktop mode claims to be a Mac and gives no iOS version.
  if (isIpadInDesktopMode(ua, platform)) return "iPadOS";

  const mac = /Mac OS X (\d+)[_.](\d+)/.exec(ua);
  if (mac) return `macOS ${mac[1]}.${mac[2]}`;

  // "Windows NT 10.0" is sent by both Windows 10 and 11 — the UA cannot tell
  // them apart, and only client hints can. Saying "Windows 10" here would be
  // wrong for most machines now, so the version is simply left off.
  if (/Windows NT/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return undefined;
}

/**
 * Order matters and is the whole difficulty: every Chromium browser still
 * carries "Chrome" and "Safari" in its UA, so the specific brand has to be
 * ruled out before the generic one. Reversing any two lines here silently
 * turns every Edge user into a Chrome user.
 */
const BROWSER_PATTERNS: Array<[name: string, pattern: RegExp]> = [
  ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
  ["Opera", /(?:OPR|OPiOS)\/(\d+)/],
  ["Samsung Internet", /SamsungBrowser\/(\d+)/],
  ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
  // On iOS every browser is Safari underneath and must declare itself first;
  // by here, the ones that do have already matched above.
  ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
  ["Safari", /Version\/(\d+(?:\.\d+)?).*Safari/],
];

function browserFromUserAgent(ua: string): string | undefined {
  for (const [name, pattern] of BROWSER_PATTERNS) {
    const match = pattern.exec(ua);
    if (match) return `${name} ${match[1]}`;
  }
  return undefined;
}

/**
 * Android is the only platform that still puts the handset in the UA, in a
 * build-tag segment: `...; en-gb; SM-G991B Build/...)` or `...; Pixel 8)`.
 */
function modelFromUserAgent(ua: string): string | undefined {
  const build = /;\s*([^;()]+?)\s+Build\//.exec(ua);
  if (build) return build[1].trim();

  const android = /Android[^;)]*;\s*([^;)]+)\)/.exec(ua);
  if (android) {
    const candidate = android[1].trim();
    // Locale tags and the generic "K" that Chrome now substitutes for the
    // real model are not device names.
    if (candidate && candidate !== "K" && !/^[a-z]{2}(-[a-z]{2})?$/i.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/* -------------------------------------------------------------- Form factor */

/**
 * An iPad set to "Request Desktop Website" — the default for years — sends a
 * UA indistinguishable from a MacBook's. The one tell is that a Mac has no
 * touchscreen, so a "Mac" reporting multiple touch points is an iPad.
 */
function isIpadInDesktopMode(ua: string, platform: string): boolean {
  return (
    /Mac/.test(platform) &&
    typeof navigator !== "undefined" &&
    navigator.maxTouchPoints > 1 &&
    !/iPhone/.test(ua)
  );
}

function deviceTypeFrom(ua: string, platform: string, uaData: UAData | undefined): DeviceInfo["type"] {
  if (/iPad/.test(ua) || isIpadInDesktopMode(ua, platform)) return "Tablet";
  if (/Tablet|PlayBook|Silk/.test(ua)) return "Tablet";

  // Android's own convention: a phone includes "Mobile", a tablet omits it.
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Mobile" : "Tablet";

  // Client hints answer phone-or-not but never phone-or-tablet, so this comes
  // after the checks that can tell them apart.
  if (uaData?.mobile) return "Mobile";

  if (/iPhone|iPod/.test(ua) || /Mobi/.test(ua)) return "Mobile";
  if (ua) return "Desktop";
  return "Unknown";
}

/**
 * Physical pixels, narrow side first.
 *
 * `screen.width` is in CSS pixels and swaps with orientation, so a phone
 * reports 360x800 upright and 800x360 on its side. Multiplying by the pixel
 * ratio gives the number the handset is actually sold as (1080x2400), and
 * ordering the pair makes it the same string whichever way the phone is held
 * — otherwise one device produces two "resolutions" and neither groups.
 */
function screenResolution(): string | undefined {
  if (typeof window === "undefined" || !window.screen?.width) return undefined;
  const ratio = window.devicePixelRatio || 1;
  const a = Math.round(window.screen.width * ratio);
  const b = Math.round(window.screen.height * ratio);
  if (!a || !b) return undefined;
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

/* --------------------------------------------------------------- Collector */

/**
 * Best available reading of the current device. Never throws and never
 * rejects: a missing field is omitted, because this is telemetry attached to
 * a location capture and must not be the reason one fails to save.
 */
export async function collectDeviceInfo(): Promise<DeviceInfo> {
  if (typeof navigator === "undefined") return { type: "Unknown" };

  const ua = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;

  const info: DeviceInfo = {
    type: deviceTypeFrom(ua, platform, uaData),
    os: osFromUserAgent(ua, platform),
    browser: browserFromUserAgent(ua),
    model: modelFromUserAgent(ua),
    screen: screenResolution(),
  };

  // Client hints are strictly better where they exist, so they overwrite the
  // UA reading rather than filling its gaps. Requesting them can reject (a
  // permissions policy, or a browser that has the object but not the method),
  // and the UA-derived answer above is the fallback.
  if (uaData?.getHighEntropyValues) {
    try {
      const hints = await uaData.getHighEntropyValues([
        "platform",
        "platformVersion",
        "model",
        "fullVersionList",
      ]);

      const os = formatPlatform(hints.platform, hints.platformVersion);
      if (os) info.os = os;

      const brand = realBrand(hints.fullVersionList) ?? realBrand(uaData.brands);
      if (brand) info.browser = `${brand.brand} ${brand.version.split(".")[0]}`;

      if (hints.model) info.model = hints.model;
    } catch {
      /* Keep the UA-derived reading. */
    }
  }

  return info;
}

/* ------------------------------------------------------------- Presentation */

/** `Android 14 · Chrome 131 · 1080x2400` — one line for the dashboard table. */
export function describeDevice(parts: {
  deviceType?: string;
  os?: string;
  browser?: string;
  deviceModel?: string;
  screenResolution?: string;
}): string {
  // The model already implies the OS family, so showing "Pixel 8" beats
  // "Android 14" when both exist; the OS version stays as the second part.
  const head = parts.deviceModel ?? parts.os ?? parts.deviceType;
  const segments = [head, parts.deviceModel ? parts.os : undefined, parts.browser, parts.screenResolution];
  return segments.filter(Boolean).join(" · ") || "Unknown device";
}
