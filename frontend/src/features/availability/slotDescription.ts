/**
 * The words a grid cell says. Kept apart from the component because the same sentence is both
 * the cell's accessible description and the text of the detail panel, and because a heatmap that
 * conveys its meaning only by shade would be unreadable to anyone who cannot see the shade.
 */
import type { CellState, SlotDetail } from "./availabilityModel";

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A contract calendar date as UTC midnight, in milliseconds. UTC is a carrier for the three
 * components, never a timezone conversion: a calendar date goes in and a calendar date comes
 * out, as in `lib/date.ts` and for the same reason (frontend DECISIONS F11).
 */
function calendarMillis(date: string): number {
  const match = CALENDAR_DATE_PATTERN.exec(date);
  if (match === null) {
    throw new Error(`Not a calendar date: ${date}`);
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "Sun 25 Oct", for a column header where width is scarce. */
export function formatDayShort(date: string): string {
  return SHORT_DAY.format(calendarMillis(date));
}

/** "Sunday 25 October 2026", for a description where it is read aloud. */
export function formatDayLong(date: string): string {
  return LONG_DAY.format(calendarMillis(date));
}

const OWN_STATE_WORDS: Record<CellState, string> = {
  unselected: "not selected",
  available: "available",
  preferred: "preferred",
};

function list(names: readonly string[]): string {
  return names.join(", ");
}

interface CellContext {
  own: CellState;
  busy: boolean;
}

/**
 * One sentence per fact, so a screen reader can be interrupted at any of them.
 *
 * The denominator is the responded members, so a member who has never answered neither dilutes
 * the count nor appears in any of the three name lists (ARCHITECTURE 5.1). When nobody has
 * responded at all the ratio is omitted rather than rendered as "0 of 0".
 */
export function describeSlot(
  date: string,
  time: string,
  detail: SlotDetail,
  { own, busy }: CellContext,
): string {
  const parts = [`${formatDayLong(date)} at ${time}.`];

  if (detail.respondedCount === 0) {
    parts.push("Nobody has responded yet.");
  } else {
    const yes = detail.availableCount + detail.preferredCount;
    parts.push(
      `${yes} of ${detail.respondedCount} responded members available,` +
        ` ${detail.preferredCount} ${detail.preferredCount === 1 ? "prefers" : "prefer"} it.`,
    );
  }

  if (detail.availableNames.length > 0) {
    parts.push(`Available: ${list(detail.availableNames)}.`);
  }
  if (detail.preferredNames.length > 0) {
    parts.push(`Prefers: ${list(detail.preferredNames)}.`);
  }
  if (detail.missingNames.length > 0) {
    parts.push(`Not available: ${list(detail.missingNames)}.`);
  }
  if (busy) {
    parts.push("Busy in your calendar.");
  }
  parts.push(`Your selection: ${OWN_STATE_WORDS[own]}.`);

  return parts.join(" ");
}
