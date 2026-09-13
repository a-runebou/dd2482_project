/**
 * Everything the availability grid knows that is neither React nor a request: how a cell's own
 * state cycles, how a drag applies one state to many cells, how an aggregate becomes a shade,
 * and who is available, who prefers a slot and who is missing from it.
 *
 * Pure and framework-free. The matrix is read through indices into its own slot vector
 * (ARCHITECTURE 7.3); everything that leaves here for the API is a plain instant.
 */
import type { components } from "../../api/generated/schema";
import { normalizeInstant } from "../../lib/slots";

type AvailabilityMatrix = components["schemas"]["AvailabilityMatrix"];
type AvailabilitySelection = components["schemas"]["AvailabilitySelection"];
type BusyBlock = components["schemas"]["BusyBlock"];

/** A cell is unselected, available, or preferred. Never two of them at once. */
export type CellState = "unselected" | "available" | "preferred";

/**
 * The caller's own selection: an instant maps to the one state it has. Modelling it this way
 * rather than as two arrays makes "a slot present in both counts as preferred" true by
 * construction (CLAUDE.md rule 9) instead of a rule applied at the last moment.
 */
export type Selection = ReadonlyMap<string, Exclude<CellState, "unselected">>;

export const EMPTY_SELECTION: Selection = new Map();

export function cellState(selection: Selection, instant: string): CellState {
  return selection.get(instant) ?? "unselected";
}

/** Clicking a cell walks it round: nothing, available, preferred, nothing. */
export function nextState(state: CellState): CellState {
  if (state === "unselected") return "available";
  if (state === "available") return "preferred";
  return "unselected";
}

/**
 * Set a run of cells to one state, returning a new selection.
 *
 * A drag decides its target from the first cell it touches and then applies that, so dragging
 * paints a region uniformly rather than cycling each cell it crosses a different number of
 * times depending on how the pointer wandered.
 */
export function applyState(
  selection: Selection,
  instants: readonly string[],
  state: CellState,
): Selection {
  const next = new Map(selection);
  for (const instant of instants) {
    if (state === "unselected") {
      next.delete(instant);
    } else {
      next.set(instant, state);
    }
  }
  return next;
}

/** The contract's request body: two disjoint arrays of instants, sorted so a body is stable. */
export function toSelectionBody(selection: Selection): AvailabilitySelection {
  const available: string[] = [];
  const preferred: string[] = [];
  for (const [instant, state] of selection) {
    (state === "preferred" ? preferred : available).push(instant);
  }
  available.sort();
  preferred.sort();
  return { available, preferred };
}

/** A stored selection as the map. A slot the server lists in both arrays is preferred. */
export function selectionFromPayload(
  payload: AvailabilitySelection,
): Selection {
  const selection = new Map<string, Exclude<CellState, "unselected">>();
  for (const instant of payload.available) {
    selection.set(normalizeInstant(instant), "available");
  }
  for (const instant of payload.preferred) {
    selection.set(normalizeInstant(instant), "preferred");
  }
  return selection;
}

/** Whether two selections say the same thing, which is what decides if Save has anything to do. */
export function selectionsEqual(a: Selection, b: Selection): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [instant, state] of a) {
    if (b.get(instant) !== state) {
      return false;
    }
  }
  return true;
}

/** The number of heat levels, including the empty one. */
export const HEAT_LEVELS = 5;

/**
 * How warm a slot is, 0 to 4.
 *
 * The weighting is `(available + 2 x preferred) / (2 x responded)`: a preference counts double,
 * so a slot that the same people merely tolerate never outranks one they actively want. The
 * denominator counts responded members only — someone who has never answered is not evidence of
 * anything and is excluded, as the suggestion scoring excludes them (ARCHITECTURE 5.1). Level 0
 * means nobody at all; the rest divide the range into four.
 */
export function heatLevel(
  available: number,
  preferred: number,
  respondedCount: number,
): number {
  if (respondedCount <= 0 || available + preferred <= 0) {
    return 0;
  }
  const score = (available + 2 * preferred) / (2 * respondedCount);
  return Math.min(HEAT_LEVELS - 1, Math.max(1, Math.ceil(score * 4)));
}

export interface SlotDetail {
  availableNames: string[];
  preferredNames: string[];
  /** Members who have responded to this group but did not mark this slot. */
  missingNames: string[];
  availableCount: number;
  preferredCount: number;
  respondedCount: number;
}

/** What a slot outside the server's vector looks like: nothing known about it. */
const NO_DETAIL: SlotDetail = {
  availableNames: [],
  preferredNames: [],
  missingNames: [],
  availableCount: 0,
  preferredCount: 0,
  respondedCount: 0,
};

/**
 * Index the matrix once into a lookup from instant to detail, rather than scanning every
 * participant again for each of the hundreds of cells a grid draws.
 *
 * The counts come from the server's `aggregate`, which is the authority; the names come from the
 * participants. `responded_count` is the denominator, so a member who has never answered cannot
 * make a slot look colder than it is.
 */
export function indexMatrix(
  matrix: AvailabilityMatrix,
): ReadonlyMap<string, SlotDetail> {
  const slots = matrix.slots.map(normalizeInstant);
  const details = slots.map((): SlotDetail => ({
    availableNames: [],
    preferredNames: [],
    missingNames: [],
    availableCount: 0,
    preferredCount: 0,
    respondedCount: matrix.responded_count,
  }));

  for (const participant of matrix.participants) {
    if (!participant.responded) {
      continue;
    }
    const preferred = new Set(participant.preferred);
    const available = new Set(participant.available);
    for (let index = 0; index < details.length; index += 1) {
      const detail = details[index]!;
      if (preferred.has(index)) {
        detail.preferredNames.push(participant.display_name);
      } else if (available.has(index)) {
        detail.availableNames.push(participant.display_name);
      } else {
        detail.missingNames.push(participant.display_name);
      }
    }
  }

  for (const entry of matrix.aggregate) {
    const detail = details[entry.slot_index];
    if (detail !== undefined) {
      detail.availableCount = entry.available_count;
      detail.preferredCount = entry.preferred_count;
    }
  }

  return new Map(slots.map((instant, index) => [instant, details[index]!]));
}

export function detailFor(
  index: ReadonlyMap<string, SlotDetail>,
  instant: string,
): SlotDetail {
  return index.get(instant) ?? NO_DETAIL;
}

/**
 * The slots an imported calendar already covers. A slot counts as busy when it overlaps a block
 * at all, so a lecture starting mid-slot still marks that slot, but one that merely abuts it
 * does not. This is a hint only and never restricts what can be selected (ARCHITECTURE 6.2).
 */
export function busySlots(
  slots: readonly string[],
  blocks: readonly BusyBlock[],
  slotMinutes: number,
): ReadonlySet<string> {
  const busy = new Set<string>();
  if (blocks.length === 0) {
    return busy;
  }
  const spans = blocks.map((block) => ({
    start: Date.parse(block.start_at),
    end: Date.parse(block.end_at),
  }));
  const slotMillis = slotMinutes * 60_000;
  for (const slot of slots) {
    const start = Date.parse(slot);
    const end = start + slotMillis;
    if (spans.some((span) => span.start < end && span.end > start)) {
      busy.add(slot);
    }
  }
  return busy;
}
