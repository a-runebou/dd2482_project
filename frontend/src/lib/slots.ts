/**
 * Slot generation for the availability grid.
 *
 * Framework-free and pure. Every function takes its IANA timezone explicitly and none of them
 * ever consults the runtime's own zone: the group's timezone is what decides where a local day
 * starts, and the machine rendering the grid has nothing to do with it (CLAUDE.md rule 3).
 *
 * The one hard part is that a local day is not always 24 hours long. On 25 October 2026
 * Europe/Stockholm runs 25 hours and on 29 March 2026 it runs 23, so adding a fixed day length
 * to a start instant drifts by an hour and then stays wrong (ARCHITECTURE R7). Instead each
 * local date's window start and window end are resolved to real instants independently, and the
 * slots between them are stepped in UTC. That keeps every slot exactly slot_minutes apart in
 * real time while the local labels do whatever the zone makes them do — repeating an hour in
 * the autumn, skipping one in the spring.
 *
 * Instants are produced in the contract's form, YYYY-MM-DDTHH:MM:SSZ. `new Date` is deliberately
 * absent: reading a timestamp back out goes through Intl with an explicit timeZone, and
 * `Date.parse` handles the other direction, so no value is ever routed through a local-time
 * constructor.
 */

const MILLIS_PER_MINUTE = 60_000;
const MILLIS_PER_DAY = 86_400_000;
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** One local date's worth of cells, padded so every column in a grid is the same height. */
export interface SlotColumn {
  /** The local calendar date, YYYY-MM-DD. */
  date: string;
  /** Slot start instants in order, with `undefined` where this day has no cell for that row. */
  slots: (string | undefined)[];
}

export interface SlotGrid {
  columns: SlotColumn[];
  /**
   * Row labels as HH:MM, taken from the longest local day. A shorter day is padded at the end,
   * so on an ordinary day every label lines up; on a transition day the labels come from the
   * day that actually has those cells. Each cell carries its own date and time in its
   * description, so a label is a guide and never the thing assistive technology relies on.
   */
  rowLabels: string[];
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

/**
 * A formatter that decomposes an instant into wall-clock components in one zone. Cached because
 * a grid asks for thousands of these and constructing an Intl.DateTimeFormat is not cheap.
 */
function partsFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = partsCache.get(timezone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  partsCache.set(timezone, formatter);
  return formatter;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockIn(timezone: string, instantMillis: number): WallClock {
  const parts = partsFormatter(timezone).formatToParts(instantMillis);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    if (part === undefined) {
      throw new Error(`Missing ${type} for timezone ${timezone}`);
    }
    return Number(part.value);
  };
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * The wall-clock components of an instant, re-encoded as if they were UTC. This is a carrier
 * for six numbers, never a timezone conversion: subtracting the instant from it gives the
 * zone's offset at that instant.
 */
function wallMillisIn(timezone: string, instantMillis: number): number {
  const wall = wallClockIn(timezone, instantMillis);
  return Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
}

function offsetMillis(timezone: string, instantMillis: number): number {
  return wallMillisIn(timezone, instantMillis) - instantMillis;
}

/** Which instant a repeated wall-clock time should resolve to when a zone offers two. */
type Ambiguous = "earlier" | "later";

/**
 * The UTC instant of a local wall-clock time, given as its UTC-encoded form.
 *
 * The offsets a day either side of the target are the only two the zone can have around it, so
 * subtracting each gives the complete candidate set. A candidate is real when formatting it back
 * in the zone reproduces the wall-clock time asked for.
 *
 * Two candidates survive for a repeated hour in the autumn; `ambiguous` picks between them.
 * None survives for an hour the spring change deletes, and the later candidate is returned, so a
 * window edge that falls in the gap rolls forward onto the first time that does exist rather
 * than silently landing an hour early.
 */
function wallToInstant(
  wallMillis: number,
  timezone: string,
  ambiguous: Ambiguous,
): number {
  const before = offsetMillis(timezone, wallMillis - MILLIS_PER_DAY);
  const after = offsetMillis(timezone, wallMillis + MILLIS_PER_DAY);
  const candidates =
    before === after
      ? [wallMillis - before]
      : [wallMillis - before, wallMillis - after];
  const real = candidates.filter(
    (candidate) => wallMillisIn(timezone, candidate) === wallMillis,
  );
  if (real.length === 0) {
    return Math.max(...candidates);
  }
  return ambiguous === "earlier" ? Math.min(...real) : Math.max(...real);
}

function calendarDateToUtcMillis(date: string): number {
  const match = CALENDAR_DATE_PATTERN.exec(date);
  if (match === null) {
    throw new Error(`Not a calendar date: ${date}`);
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** An instant in the contract's form: UTC, RFC 3339, whole seconds, trailing Z. */
function toInstant(millis: number): string {
  const wall = wallClockIn("UTC", millis);
  return (
    `${String(wall.year).padStart(4, "0")}-${pad(wall.month)}-${pad(wall.day)}` +
    `T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}Z`
  );
}

/**
 * The ordered slot start instants for a group, inclusive of both dates.
 *
 * Each local date contributes the slots between its window start and its window end, both
 * resolved in `timezone`. A window end of 1440 is the next local midnight, so the last slot of
 * such a day begins at 23:30 local and none follows it.
 */
export function generateSlots(
  dateStart: string,
  dateEnd: string,
  windowStartMinute: number,
  windowEndMinute: number,
  slotMinutes: number,
  timezone: string,
): string[] {
  if (slotMinutes <= 0 || windowEndMinute <= windowStartMinute) {
    return [];
  }
  const slotMillis = slotMinutes * MILLIS_PER_MINUTE;
  const first = calendarDateToUtcMillis(dateStart);
  const last = calendarDateToUtcMillis(dateEnd);
  const slots: string[] = [];

  for (let day = first; day <= last; day += MILLIS_PER_DAY) {
    // The window start takes the earlier of a repeated hour and the window end the later, so a
    // window that brackets a transition covers all of it rather than half.
    const start = wallToInstant(
      day + windowStartMinute * MILLIS_PER_MINUTE,
      timezone,
      "earlier",
    );
    const end = wallToInstant(
      day + windowEndMinute * MILLIS_PER_MINUTE,
      timezone,
      "later",
    );
    for (let at = start; at + slotMillis <= end; at += slotMillis) {
      slots.push(toInstant(at));
    }
  }

  return slots;
}

/** An instant re-spelled in the contract's form, so two spellings of one instant compare equal. */
export function normalizeInstant(instant: string): string {
  const millis = Date.parse(instant);
  if (Number.isNaN(millis)) {
    throw new Error(`Not an instant: ${instant}`);
  }
  return toInstant(millis);
}

export function addMinutes(instant: string, minutes: number): string {
  return toInstant(Date.parse(instant) + minutes * MILLIS_PER_MINUTE);
}

/** The local calendar date an instant falls on, in the given zone. */
export function slotDate(instant: string, timezone: string): string {
  const wall = wallClockIn(timezone, Date.parse(instant));
  return `${String(wall.year).padStart(4, "0")}-${pad(wall.month)}-${pad(wall.day)}`;
}

/** The local time of day of an instant as HH:MM, in the given zone. */
export function slotLabel(instant: string, timezone: string): string {
  const wall = wallClockIn(timezone, Date.parse(instant));
  return `${pad(wall.hour)}:${pad(wall.minute)}`;
}

/** The instants as a set in normalized form, for membership tests. */
export function slotSet(instants: readonly string[]): ReadonlySet<string> {
  return new Set(instants.map(normalizeInstant));
}

/** Whether a selected instant is one of the slots the group's window actually contains. */
export function isGeneratedSlot(
  instant: string,
  allowed: ReadonlySet<string>,
): boolean {
  try {
    return allowed.has(normalizeInstant(instant));
  } catch {
    return false;
  }
}

/**
 * Arrange instants into columns of local dates and rows of local times of day.
 *
 * The row count comes from the longest local day, because a transition day has more or fewer
 * cells than its neighbours and dropping the extras would hide exactly the slots this whole
 * exercise exists to get right. Shorter days are padded at the end with `undefined`.
 */
export function buildSlotGrid(
  instants: readonly string[],
  timezone: string,
): SlotGrid {
  const byDate = new Map<string, string[]>();
  for (const instant of instants) {
    const date = slotDate(instant, timezone);
    const column = byDate.get(date);
    if (column === undefined) {
      byDate.set(date, [instant]);
    } else {
      column.push(instant);
    }
  }

  const dates = [...byDate.keys()].sort();
  const rowCount = Math.max(
    0,
    ...dates.map((date) => byDate.get(date)!.length),
  );
  const longest = dates.find((date) => byDate.get(date)!.length === rowCount);
  const rowLabels =
    longest === undefined
      ? []
      : byDate.get(longest)!.map((instant) => slotLabel(instant, timezone));

  return {
    columns: dates.map((date) => {
      const slots = byDate.get(date)!;
      return {
        date,
        slots: Array.from({ length: rowCount }, (_, row) => slots[row]),
      };
    }),
    rowLabels,
  };
}
