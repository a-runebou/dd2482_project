const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function requireGroup(value: string | undefined, date: string): string {
  if (value === undefined) {
    throw new Error(`Not a calendar date: ${date}`);
  }
  return value;
}

/**
 * Format a contract calendar date (YYYY-MM-DD) as "1 Oct 2026". Parses the three components and
 * formats a Date.UTC value through Intl so the result never depends on the runtime's local
 * timezone (CLAUDE.md rule 3: a calendar date is never converted through an instant).
 */
export function formatCalendarDate(date: string): string {
  const match = CALENDAR_DATE_PATTERN.exec(date);
  if (!match) {
    throw new Error(`Not a calendar date: ${date}`);
  }
  const year = requireGroup(match[1], date);
  const month = requireGroup(match[2], date);
  const day = requireGroup(match[3], date);
  const utcMillis = Date.UTC(Number(year), Number(month) - 1, Number(day));
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
