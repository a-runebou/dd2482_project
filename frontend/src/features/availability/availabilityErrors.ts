import type { ApiError } from "../../api/errors";

/**
 * How a failed availability read or write is presented. Chosen by `kind` and, for a problem, by
 * `code` alone (CLAUDE.md rule 4); the problem document's title, detail and status are never
 * shown to anyone.
 */
export type AvailabilityOutcome =
  /** The group is not visible, or does not exist. The whole screen becomes the panel. */
  | { kind: "not-found" }
  /** The group is confirmed: the grid stays on screen but stops accepting changes. */
  | { kind: "confirmed" }
  /** Part of the selection is outside the window. Offer a reload; discard nothing. */
  | { kind: "stale-slots" }
  /** No wording of its own; ApiErrorNotice already says the right thing for these. */
  | { kind: "notice" };

export const CONFIRMED_MESSAGE =
  "This group is confirmed, so availability can no longer be changed.";

/**
 * The freeze arriving mid-edit. The selection is deliberately left on screen rather than
 * discarded: the user did that work, and losing it silently would be worse than being told it
 * can no longer be sent.
 */
export const FROZEN_WHILE_EDITING_MESSAGE =
  "This group was confirmed while you were editing. Your unsaved selection is still shown, but availability can no longer be saved.";

export const STALE_SLOTS_MESSAGE =
  "Part of your selection is no longer inside the group's window. Nothing has been discarded; reload the grid to see the slots the server has now.";

export const OTHERS_CHANGED_MESSAGE =
  "Another member's availability changed while you were editing. The grid shows their latest answer; your unsaved selection is untouched.";

export const STALE_POLL_MESSAGE =
  "The grid could not be refreshed just now, so what is shown may be out of date. Nothing has been lost; the next refresh will catch up.";

/**
 * Which part of an unsaved selection the server's slot vector no longer contains. The slots are
 * named rather than merely counted, and never removed: the grid cannot show a cell that is not
 * in the vector it renders, so saying which they are is the only way the user can act on it.
 */
export function orphanedSelectionMessage(labels: readonly string[]): string {
  const count = labels.length;
  return `${count} slot${count === 1 ? "" : "s"} in your selection ${
    count === 1 ? "is" : "are"
  } no longer offered by the server: ${labels.join(", ")}. Nothing has been discarded, but the server will reject a save that still includes ${count === 1 ? "it" : "them"}.`;
}

export const RECONCILED_MESSAGE =
  "The slot list from the server differs from the slots this browser worked out for this group. The server's list is the one shown.";

export function describeAvailabilityError(
  error: ApiError,
): AvailabilityOutcome {
  if (error.kind !== "problem") {
    return { kind: "notice" };
  }
  switch (error.code) {
    case "group_not_found":
    case "not_found":
      return { kind: "not-found" };
    case "group_confirmed":
      return { kind: "confirmed" };
    case "slot_not_in_window":
      return { kind: "stale-slots" };
    default:
      // unauthenticated, token_expired, db_circuit_open and service_unavailable all already
      // have wording in ApiErrorNotice; anything else is the generic failure.
      return { kind: "notice" };
  }
}
