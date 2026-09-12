// The number of minutes in a day. A fact about the clock, not a configurable limit, so it is
// written here rather than fetched from GET /config (CLAUDE.md rule 7).
const MINUTES_PER_DAY = 1440;

/** 08:00, the default start of the group's daily window. */
export const WINDOW_START_DEFAULT = 480;

/** 18:00, the default end of the group's daily window. */
export const WINDOW_END_DEFAULT = 1080;

export interface WindowOption {
  minute: number;
  label: string;
}

export interface WindowOptions {
  start: WindowOption[];
  end: WindowOption[];
}

/**
 * A 24-hour clock label for minutes from midnight. The contract stores the window as minutes
 * from local midnight in the group's timezone, so a label is a rendering of that number and
 * never a wall-clock instant (CLAUDE.md rule 3). The final end option, 1440, reads "24:00"
 * because "00:00" would suggest the previous midnight.
 */
function label(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function range(from: number, to: number, step: number): WindowOption[] {
  const options: WindowOption[] = [];
  for (let minute = from; minute <= to; minute += step) {
    options.push({ minute, label: label(minute) });
  }
  return options;
}

/**
 * The selectable window boundaries, in steps of the configured slot length: a start from
 * midnight up to one slot before the end of the day, and an end from one slot in up to
 * midnight itself.
 */
export function windowOptions(slotMinutes: number): WindowOptions {
  return {
    start: range(0, MINUTES_PER_DAY - slotMinutes, slotMinutes),
    end: range(slotMinutes, MINUTES_PER_DAY, slotMinutes),
  };
}
