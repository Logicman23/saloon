/**
 * Date helpers.
 *
 * Formatting is hand-rolled rather than delegated to `toLocaleString` because
 * Node and the browser can ship different ICU data, which produces React
 * hydration mismatches on dates rendered during SSR.
 */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const pad = (n: number) => n.toString().padStart(2, "0");

export function toDate(value: Date | string) {
  return typeof value === "string" ? new Date(value) : value;
}

/** Local midnight — the canonical "day bucket" key. */
export function startOfDay(value: Date | string) {
  const d = toDate(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(value: Date | string) {
  const d = startOfDay(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Week starts Monday — standard for salon rosters. */
export function startOfWeek(value: Date | string) {
  const d = startOfDay(value);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function startOfMonth(value: Date | string) {
  const d = toDate(value);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(value: Date | string) {
  const d = toDate(value);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function addDays(value: Date | string, days: number) {
  const d = new Date(toDate(value));
  d.setDate(d.getDate() + days);
  return d;
}

export function addMinutes(value: Date | string, minutes: number) {
  const d = new Date(toDate(value));
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

export function addMonths(value: Date | string, months: number) {
  const d = new Date(toDate(value));
  d.setMonth(d.getMonth() + months);
  return d;
}

export function isSameDay(a: Date | string, b: Date | string) {
  const x = toDate(a);
  const y = toDate(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

export function isSameMonth(a: Date | string, b: Date | string) {
  const x = toDate(a);
  const y = toDate(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth();
}

/** `2026-08-13` — stable key for grouping and for <input type="date">. */
export function dateKey(value: Date | string) {
  const d = toDate(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `2026-08-13T14:30` — value for <input type="datetime-local">. */
export function dateTimeLocalValue(value: Date | string) {
  const d = toDate(value);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `2:30 PM` */
export function formatTime(value: Date | string) {
  const d = toDate(value);
  const h24 = d.getHours();
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(d.getMinutes())} ${suffix}`;
}

/** `2 PM` / `2:30 PM` — compact axis + gutter labels. */
export function formatHour(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${suffix}`;
}

/** `13 Aug 2026` */
export function formatDate(value: Date | string) {
  const d = toDate(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `Thu, 13 Aug` */
export function formatDateShort(value: Date | string) {
  const d = toDate(value);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** `Thursday, 13 August 2026` */
export function formatDateLong(value: Date | string) {
  const d = toDate(value);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** `13 Aug 2026, 2:30 PM` */
export function formatDateTime(value: Date | string) {
  return `${formatDate(value)}, ${formatTime(value)}`;
}

/** `August 2026` */
export function formatMonthYear(value: Date | string) {
  const d = toDate(value);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** `3 days ago` / `in 2 hours` — relative to `now`, which the caller supplies. */
export function formatRelative(value: Date | string, now: Date) {
  const diffMs = toDate(value).getTime() - now.getTime();
  const past = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60000);

  const phrase = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

  let text: string;
  if (mins < 1) return "just now";
  else if (mins < 60) text = phrase(mins, "min");
  else if (mins < 60 * 24) text = phrase(Math.round(mins / 60), "hour");
  else if (mins < 60 * 24 * 30) text = phrase(Math.round(mins / (60 * 24)), "day");
  else if (mins < 60 * 24 * 365) text = phrase(Math.round(mins / (60 * 24 * 30)), "month");
  else text = phrase(Math.round(mins / (60 * 24 * 365)), "year");

  return past ? `${text} ago` : `in ${text}`;
}

/** Inclusive list of day-start dates covering [from, to]. */
export function eachDay(from: Date, to: Date) {
  const days: Date[] = [];
  let cursor = startOfDay(from);
  const last = startOfDay(to);
  while (cursor <= last) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** 6x7 grid of dates covering the month, padded with neighbouring days. */
export function monthGrid(month: Date) {
  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function minutesSinceMidnight(value: Date | string) {
  const d = toDate(value);
  return d.getHours() * 60 + d.getMinutes();
}
