import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import type { ApiError } from "../../api/errors";
import { describeMutationError } from "./groupMutationErrors";

interface GroupMutationErrorProps {
  error: ApiError;
  /** A 404 means "already gone" rather than a failure; see describeMutationError. */
  notFoundIsGone?: boolean;
  /** Refetches the group. Offered only for version_conflict, which a refetch resolves. */
  onRefresh: () => void;
  retry: () => void;
  isRetrying: boolean;
}

/**
 * A failed group mutation, rendered by code alone. Nothing here reads title, detail or status
 * (CLAUDE.md rule 4); an error with no wording of its own falls through to ApiErrorNotice.
 */
export function GroupMutationError({
  error,
  notFoundIsGone = false,
  onRefresh,
  retry,
  isRetrying,
}: GroupMutationErrorProps) {
  const outcome = describeMutationError(error, { notFoundIsGone });

  if (outcome.kind === "gone") {
    return null;
  }

  if (outcome.kind === "notice") {
    return (
      <div className="mt-3">
        <ApiErrorNotice error={error} retry={retry} isRetrying={isRetrying} />
      </div>
    );
  }

  return (
    <div role="alert" className="mt-3 text-sm text-danger">
      <p>{outcome.message}</p>
      {outcome.kind === "conflict" && (
        <Button className="mt-2" onClick={onRefresh}>
          Refresh the group
        </Button>
      )}
    </div>
  );
}
