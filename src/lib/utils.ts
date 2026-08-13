import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Salon operates in Pakistani Rupees. Change here to re-denominate the app. */
export const CURRENCY = { code: "PKR", symbol: "Rs" } as const;

/** `Rs 12,500` — compact money for UI chrome. */
export function formatMoney(value: number, opts?: { decimals?: boolean }) {
  const decimals = opts?.decimals ?? false;
  return `${CURRENCY.symbol} ${value.toLocaleString("en-PK", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}

/** `12,500` — bare number for receipts and table cells that already show a header symbol. */
export function formatAmount(value: number, decimals = 0) {
  return value.toLocaleString("en-PK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** `Rs 1.2L` / `Rs 45.0k` — for KPI tiles where space is tight. */
export function formatMoneyCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 10_000_000) return `${CURRENCY.symbol} ${(value / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000) return `${CURRENCY.symbol} ${(value / 100_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${CURRENCY.symbol} ${(value / 1_000).toFixed(1)}k`;
  return formatMoney(value);
}

/** 95 -> "1h 35m" */
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Deterministic id — avoids hydration mismatches from Math.random() during SSR. */
let idCounter = 0;
export function nextId(prefix = "id") {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Rounds to 2dp without float dust (0.1 + 0.2 problems in money math). */
export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function phoneDigits(input: string) {
  return input.replace(/\D/g, "");
}
