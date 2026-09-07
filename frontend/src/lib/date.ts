const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function requireGroup(value: string | undefined, date: string): string {
  if (value === undefined) {
    throw new Error(`Not a calendar date: ${date}`);
  }
  return value;
}

/**
 * A contract calendar date (YYYY-MM-DD) as the UTC midnight instant of that date, in
 * milliseconds. UTC is a carrier for the three components here, never a timezone
 * conversion: the caller has a calendar date in, and gets a calendar date out.
 */
function toUtcMillis(date: string): number {
  const match = CALENDAR_DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error(`Not a calendar date: ${date}`);
  }
  const year = requireGroup(match[1], date);
  const month = requireGroup(match[2], date);
  const day = requireGroup(match[3], date);
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/**
 * Format a contract calendar date (YYYY-MM-DD) as "1 Oct 2026". Parses the three components and
 * formats a Date.UTC value through Intl so the result never depends on the runtime's local
 * timezone (CLAUDE.md rule 3: a calendar date is never converted through an instant).
 */
export function formatCalendarDate(date: string): string {
  const utcMillis = toUtcMillis(date);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcMillis);
}

/** An inclusive calendar-date range, e.g. "1 Oct 2026 to 31 Oct 2026". */
export function formatDateRange(start: string, end: string): string {
  return `${formatCalendarDate(start)} to ${formatCalendarDate(end)}`;
}

const MILLIS_PER_DAY = 86_400_000;

/**
 * The inclusive number of calendar days between two contract dates, so that a group whose
 * range is a single day counts as 1 (ARCHITECTURE section 5, invariant 2). Both endpoints
 * are UTC midnights, so no daylight-saving transition can shorten or lengthen a day here.
 * A start after the end gives a value below 1; callers order the dates before counting.
 */
export function daysInclusive(start: string, end: string): number {
  return (toUtcMillis(end) - toUtcMillis(start)) / MILLIS_PER_DAY + 1;
}
