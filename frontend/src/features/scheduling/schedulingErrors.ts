import type { ApiError } from "../../api/errors";

/**
 * How a failed suggestion or proposal request is presented. Chosen by `kind` and, for a problem,
 * by `code` alone (CLAUDE.md rule 4): the problem document's title, detail and status are never
 * shown to anyone.
 */
export type SchedulingOutcome =
  /** The group is not visible, or does not exist. The whole screen becomes the panel. */
  | { kind: "not-found" }
  /** Owner-only. On a read this hides the controls; on an action it is a sentence. */
  | { kind: "not-owner" }
  /** The group is confirmed: the list stays on screen and stops accepting changes. */
  | { kind: "confirmed" }
  /** The group already has as many proposals as it may have. */
  | { kind: "limit" }
  /** The window is outside the group's range or daily window. */
  | { kind: "outside-window" }
  /** The thing being removed is already gone; the caller refetches and shows nothing. */
  | { kind: "gone" }
  /** No wording of its own; ApiErrorNotice already says the right thing for these. */
  | { kind: "notice" };

export const NOT_OWNER_MESSAGE =
  "Only the group's owner can add or remove proposals.";

export const CONFIRMED_MESSAGE =
  "This group is confirmed, so proposals can no longer be changed.";

export const OUTSIDE_WINDOW_MESSAGE =
  "That window is outside the group's date range or daily window.";

export function limitMessage(maxProposals: number): string {
  return `This group already has the most proposals it may have, which is ${maxProposals}. Delete one before adding another.`;
}

interface Options {
  /**
   * True for a deletion, where a 404 means the proposal has already gone: that is the outcome
   * the user wanted, not a failure. Elsewhere a 404 is a group that is not visible.
   */
  notFoundIsGone?: boolean;
}

export function describeSchedulingError(
  error: ApiError,
  { notFoundIsGone = false }: Options = {},
): SchedulingOutcome {
  if (error.kind !== "problem") {
    return { kind: "notice" };
  }
  switch (error.code) {
    case "not_owner":
    case "forbidden":
      return { kind: "not-owner" };
    case "group_confirmed":
      return { kind: "confirmed" };
    case "proposal_limit_reached":
      return { kind: "limit" };
    case "slot_not_in_window":
      return { kind: "outside-window" };
    case "group_not_found":
    case "not_found":
      return notFoundIsGone ? { kind: "gone" } : { kind: "not-found" };
    default:
      // unauthenticated, token_expired, db_circuit_open and service_unavailable all already
      // have wording in ApiErrorNotice; anything else is the generic failure.
      return { kind: "notice" };
  }
}
