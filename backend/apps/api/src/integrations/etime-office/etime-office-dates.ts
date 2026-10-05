/**
 * Date and time handling for the e-Time Office API (API Documentation.pdf).
 *
 * - Request date-time parameters: `dd/MM/yyyy_HH:mm` (documented for all date parameters).
 * - DownloadInOutPunchData's example uses date-only `dd/MM/yyyy`; which one the endpoint
 *   accepts is PROVIDER CONFIRMATION REQUIRED, so the format is chosen per endpoint by
 *   configuration (`ETIME_INOUT_DATE_FORMAT`) instead of being guessed silently.
 * - Response `PunchDate`: `dd/MM/yyyy HH:mm:ss`; `DateString`: `dd/MM/yyyy`;
 *   `INTime`/`OUTTime`/`WorkTime`/...: `HH:mm`, with `--:--` meaning "no value".
 *
 * No timezone is documented for provider times, so they are kept as wall-clock values.
 */

const REQUEST_DATE_TIME = /^(\d{2})\/(\d{2})\/(\d{4})_(\d{2}):(\d{2})$/;
const REQUEST_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const PUNCH_DATE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;
const CLOCK = /^(\d{2}):(\d{2})$/;
export const EMPTY_PROVIDER_TIME = "--:--";

export type InOutDateFormat = "date" | "datetime";

function isRealDate(day: number, month: number, year: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const pad = (value: number, length = 2): string => String(value).padStart(length, "0");

/** True for a real calendar date-time in `dd/MM/yyyy_HH:mm`. */
export function isProviderDateTime(value: string): boolean {
  const match = REQUEST_DATE_TIME.exec(value);
  if (!match) return false;
  const [, day, month, year, hour, minute] = match.map(Number) as [number, number, number, number, number, number];
  return isRealDate(day, month, year) && hour <= 23 && minute <= 59;
}

/** True for a real calendar date in `dd/MM/yyyy`. */
export function isProviderDate(value: string): boolean {
  const match = REQUEST_DATE.exec(value);
  if (!match) return false;
  const [, day, month, year] = match.map(Number) as [number, number, number, number];
  return isRealDate(day, month, year);
}

export interface CalendarDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/** Formats a wall-clock date-time as the provider request format `dd/MM/yyyy_HH:mm`. */
export function formatProviderDateTime(value: CalendarDateTime): string {
  const formatted = `${pad(value.day)}/${pad(value.month)}/${pad(value.year, 4)}_${pad(value.hour)}:${pad(value.minute)}`;
  if (!isProviderDateTime(formatted)) throw new RangeError(`Invalid date-time: ${formatted}`);
  return formatted;
}

/** Formats a wall-clock date as `dd/MM/yyyy`. */
export function formatProviderDate(value: Pick<CalendarDateTime, "year" | "month" | "day">): string {
  const formatted = `${pad(value.day)}/${pad(value.month)}/${pad(value.year, 4)}`;
  if (!isProviderDate(formatted)) throw new RangeError(`Invalid date: ${formatted}`);
  return formatted;
}

/** Parses an ISO calendar date `YYYY-MM-DD` (CRM API input) into its parts. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  return isRealDate(day, month, year) ? { year, month, day } : null;
}

/**
 * Converts `PunchDate` (`dd/MM/yyyy HH:mm:ss`) to an ISO wall-clock timestamp
 * `YYYY-MM-DD HH:mm:ss`, or null when it is not a real date-time.
 */
export function parsePunchDate(value: string): string | null {
  const match = PUNCH_DATE.exec(value);
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match.map(Number) as [number, number, number, number, number, number, number];
  if (!isRealDate(day, month, year) || hour > 23 || minute > 59 || second > 59) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/** Converts `DateString` (`dd/MM/yyyy`) to ISO `YYYY-MM-DD`, or null. */
export function parseDateString(value: string): string | null {
  const match = REQUEST_DATE.exec(value);
  if (!match) return null;
  const [, day, month, year] = match.map(Number) as [number, number, number, number];
  return isRealDate(day, month, year) ? `${pad(year, 4)}-${pad(month)}-${pad(day)}` : null;
}

/**
 * A clock time (`INTime`, `OUTTime`): `HH:mm` → `HH:mm:00`, `--:--` → null.
 * Throws on any other value so it can never reach a SQL `time` column as a string.
 */
export function parseClockTime(value: string): string | null {
  if (value === EMPTY_PROVIDER_TIME) return null;
  const match = CLOCK.exec(value);
  if (!match) throw new RangeError(`Invalid provider time: ${value}`);
  const [, hour, minute] = match.map(Number) as [number, number, number];
  if (hour > 23 || minute > 59) throw new RangeError(`Invalid provider time: ${value}`);
  return `${pad(hour)}:${pad(minute)}:00`;
}

/** A duration (`WorkTime`, `OverTime`, `Late_In`, `Erl_Out`): `HH:mm` → minutes, `--:--` → null. */
export function parseDurationMinutes(value: string): number | null {
  if (value === EMPTY_PROVIDER_TIME) return null;
  const match = /^(\d{2,}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid provider duration: ${value}`);
  const [, hours, minutes] = match.map(Number) as [number, number, number];
  if (minutes > 59) throw new RangeError(`Invalid provider duration: ${value}`);
  return hours * 60 + minutes;
}
