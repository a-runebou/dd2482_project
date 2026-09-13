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

export const STALE_SLOTS_MESSAGE =
  "Part of your selection is no longer inside the group's window. Nothing has been discarded; reload the grid to see the slots the server has now.";

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
