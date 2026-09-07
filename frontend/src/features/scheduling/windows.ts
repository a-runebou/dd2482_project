/**
 * Small pure helpers shared by the suggestions panel, the manual form and the proposals list.
 * Nothing here consults a clock or a timezone; instants are rendered by `lib/instants.ts`.
 */

/**
 * The smallest and largest number of suggestions the contract allows per request. These are
 * bounds on a query parameter rather than server-enforced limits, so they come from
 * `contracts/openapi.yaml` and not from `GET /config` (CLAUDE.md rule 7 governs the latter).
 */
export const SUGGESTION_LIMIT_MIN = 1;
export const SUGGESTION_LIMIT_MAX = 20;

/** The contract's default for both parameters, used until the reader chooses otherwise. */
export const DEFAULT_DURATION_MINUTES = 60;
export const DEFAULT_SUGGESTION_LIMIT = 5;

const MINUTES_PER_HOUR = 60;

/**
 * The durations a group can be asked about: multiples of its slot length, between the
 * configured minimum and maximum. Both bounds come from `GET /config`, so nothing here decides
 * how long a meeting may be.
 */
export function durationOptions(
  slotMinutes: number,
  minimumMinutes: number,
  maximumMinutes: number,
): number[] {
  if (slotMinutes <= 0) {
    return [];
  }
  const first = Math.ceil(minimumMinutes / slotMinutes) * slotMinutes;
  const options: number[] = [];
  for (let minutes = first; minutes <= maximumMinutes; minutes += slotMinutes) {
    options.push(minutes);
  }
  return options;
}

/** The limits a reader may ask for, as the contract bounds them. */
export function limitOptions(): number[] {
  const options: number[] = [];
  for (
    let limit = SUGGESTION_LIMIT_MIN;
    limit <= SUGGESTION_LIMIT_MAX;
    limit++
  ) {
    options.push(limit);
  }
  return options;
}

/** A duration in words: "30 minutes", "1 hour", "1 hour 30 minutes". */
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  const hourPart =
    hours === 0 ? "" : `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const minutePart = rest === 0 ? "" : `${rest} minutes`;
  return (
    [hourPart, minutePart].filter((part) => part !== "").join(" ") ||
    "0 minutes"
  );
}

/**
 * How one suggestion's score compares with the best in the same response, as a fraction.
 *
 * A score is "comparable only within one response" (the contract), so the number itself says
 * nothing a reader can use: 2.5 is meaningless without the 3 beside it. What is meaningful is
 * the ratio, which is what the panel renders. A best score of zero means nobody is available
 * for anything, in which case every window is equally poor rather than infinitely worse.
 */
export function relativeFit(score: number, best: number): number {
  if (best <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, score / best));
}
