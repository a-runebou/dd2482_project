/**
 * Rendering UTC instants as local date and time in a given timezone.
 *
 * Pure and framework-free, and, like `slots.ts`, it takes its IANA timezone explicitly and
 * never consults the runtime's own: the group's zone is what a window is read in, and the
 * machine doing the reading has nothing to do with it (CLAUDE.md rule 3).
 *
 * None of the timezone machinery is repeated here. `slotDate` and `slotLabel` from `slots.ts`
 * already turn an instant into a local calendar date and a local HH:MM, and `formatCalendarDate`
 * from `date.ts` already renders a calendar date in British style without routing it through an
 * instant. All that is added is the weekday, which is the one component neither of them
 * produces. `new Date` is absent for the same reason it is absent from `slots.ts`.
 */

import { formatCalendarDate } from "./date";
import { slotDate, slotLabel } from "./slots";

const MILLIS_PER_MINUTE = 60_000;

const weekdayCache = new Map<string, Intl.DateTimeFormat>();

function weekdayFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = weekdayCache.get(timezone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
  });
  weekdayCache.set(timezone, formatter);
  return formatter;
}

function instantMillis(instant: string): number {
  const millis = Date.parse(instant);
  if (Number.isNaN(millis)) {
    throw new Error(`Not an instant: ${instant}`);
  }
  return millis;
}

/** The local date of an instant as "Mon 5 Oct 2026". */
function dateLabel(instant: string, timezone: string): string {
  const weekday = weekdayFormatter(timezone).format(instantMillis(instant));
  return `${weekday} ${formatCalendarDate(slotDate(instant, timezone))}`;
}

/** An instant as a British date and 24-hour time in one zone, for example "Mon 5 Oct 2026, 14:00". */
export function formatInstant(instant: string, timezone: string): string {
  return `${dateLabel(instant, timezone)}, ${slotLabel(instant, timezone)}`;
}

/**
 * A window of two instants, in one zone. The end repeats the date only when the window crosses
 * local midnight, so an ordinary window reads "Mon 5 Oct 2026, 14:00 to 15:30".
 *
 * The comparison is on the local calendar date, not on elapsed time, so the 25 October 2026
 * window that runs 02:30 to 02:30 across the change stays on one line and reads as the two
 * hours it is only once its duration is stated beside it.
 */
export function formatWindow(
  start: string,
  end: string,
  timezone: string,
): string {
  const head = formatInstant(start, timezone);
  return slotDate(start, timezone) === slotDate(end, timezone)
    ? `${head} to ${slotLabel(end, timezone)}`
    : `${head} to ${formatInstant(end, timezone)}`;
}

/**
 * The real time between two instants, in minutes. Real time, not local clock time: an hour that
 * a daylight-saving change repeats counts twice, and one it deletes does not count at all,
 * which is what makes a duration the same number for everyone reading it.
 */
export function durationMinutes(start: string, end: string): number {
  return (instantMillis(end) - instantMillis(start)) / MILLIS_PER_MINUTE;
}
