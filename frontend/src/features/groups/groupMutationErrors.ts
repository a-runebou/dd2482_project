import type { ApiError } from "../../api/errors";

/**
 * How a failed group mutation is presented. Chosen by `code` alone (CLAUDE.md rule 4): the
 * problem document's title, detail and status are never shown.
 */
export type MutationOutcome =
  /** The group moved on under us. The caller offers a refetch and keeps the user's input. */
  | { kind: "conflict"; message: string }
  /** A plain sentence; there is nothing to retry. */
  | { kind: "message"; message: string }
  /** The thing being removed is already gone; the caller refetches and shows nothing. */
  | { kind: "gone" }
  /** No wording of its own; the caller falls back to ApiErrorNotice. */
  | { kind: "notice" };

export const CONFLICT_MESSAGE =
  "This group changed somewhere else. Refresh it and try again.";

export const CONFIRMED_MESSAGE =
  "This group is confirmed and can no longer be changed.";

export const FORBIDDEN_MESSAGE = "You are not allowed to do that.";

interface Options {
  /**
   * True for a member removal, where a 404 means the membership has already ended: that is the
   * outcome the user wanted, not a failure. Elsewhere a 404 is an ordinary error.
   */
  notFoundIsGone?: boolean;
}

export function describeMutationError(
  error: ApiError,
  { notFoundIsGone = false }: Options = {},
): MutationOutcome {
  if (error.kind !== "problem") {
    return { kind: "notice" };
  }
  switch (error.code) {
    case "version_conflict":
      return { kind: "conflict", message: CONFLICT_MESSAGE };
    case "group_confirmed":
      return { kind: "message", message: CONFIRMED_MESSAGE };
    case "not_owner":
    case "forbidden":
      return { kind: "message", message: FORBIDDEN_MESSAGE };
    case "group_not_found":
    case "not_found":
      return notFoundIsGone ? { kind: "gone" } : { kind: "notice" };
    default:
      return { kind: "notice" };
  }
}
