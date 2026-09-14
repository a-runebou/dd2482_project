import { useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmPanel } from "../../components/ConfirmPanel";
import { Spinner } from "../../components/Spinner";
import type { components } from "../../api/generated/schema";
import { durationMinutes, formatWindow } from "../../lib/instants";
import { randomUuidV4 } from "../../lib/uuid";
import type { ApiError } from "../../api/errors";
import { proposalsKey, type ProposalsRead } from "./schedulingQueries";
import { deleteProposalMutationOptions } from "./schedulingMutations";
import {
  CONFIRMED_MESSAGE,
  NOT_OWNER_MESSAGE,
  describeSchedulingError,
} from "./schedulingErrors";
import { durationLabel } from "./windows";

type Proposal = components["schemas"]["Proposal"];

const ORIGIN_LABELS: Record<Proposal["origin"], string> = {
  suggested: "From a suggestion",
  manual: "Entered manually",
};

export const EMPTY_PROPOSALS_MESSAGE =
  "No proposals yet. The group's owner can add one from a suggestion above, or enter a window by hand.";

/** The tally, by count only: this screen shows how a group is leaning, it does not collect votes. */
function tally(votes: Proposal["votes"]): string {
  return `${votes.yes.length} yes, ${votes.maybe.length} maybe, ${votes.no.length} no`;
}

interface RowProps {
  slug: string;
  proposal: Proposal;
  timezone: string;
  canManage: boolean;
}

/**
 * One proposal, and for an owner the deletion behind the shared confirmation.
 *
 * Each row owns its own mutation so that a failure names the proposal it belongs to rather than
 * appearing once for the list. A deletion answering `not_found` is the outcome the user wanted:
 * the proposal has already gone, so the list is refetched and nothing is reported.
 */
function ProposalRow({ slug, proposal, timezone, canManage }: RowProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation(
    deleteProposalMutationOptions(queryClient, slug),
  );
  const [confirming, setConfirming] = useState(false);
  // One key for this proposal's deletion, so a retry after a failure is the same request.
  const key = useRef(randomUuidV4());
  const deleting = useRef(false);

  const window = formatWindow(proposal.start_at, proposal.end_at, timezone);
  const outcome =
    mutation.error === null
      ? undefined
      : describeSchedulingError(mutation.error, { notFoundIsGone: true });

  function remove(): void {
    if (deleting.current) {
      return;
    }
    deleting.current = true;
    mutation.mutate(
      { proposalId: proposal.id, idempotencyKey: key.current },
      {
        // A proposal that is already gone is the outcome the user asked for, not a failure:
        // clear the error, close the confirmation and re-read the list.
        onError: (error) => {
          if (
            describeSchedulingError(error, { notFoundIsGone: true }).kind ===
            "gone"
          ) {
            mutation.reset();
            setConfirming(false);
            void queryClient.invalidateQueries({
              queryKey: proposalsKey(slug),
            });
          }
        },
        onSettled: () => {
          deleting.current = false;
        },
      },
    );
  }

  const sentence =
    outcome?.kind === "confirmed"
      ? CONFIRMED_MESSAGE
      : outcome?.kind === "not-owner"
        ? NOT_OWNER_MESSAGE
        : undefined;

  return (
    <li>
      <Card>
        <p className="font-semibold">{window}</p>
        <p className="mt-1 text-sm text-neutral-600">
          {durationLabel(durationMinutes(proposal.start_at, proposal.end_at))}
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          {ORIGIN_LABELS[proposal.origin]}
        </p>
        <p className="mt-2">{tally(proposal.votes)}</p>

        {canManage &&
          (confirming ? (
            <ConfirmPanel
              heading={`Delete the proposal for ${window}?`}
              description="The proposal and any votes on it are removed for every member."
              confirmLabel="Delete permanently"
              pendingLabel="Deleting…"
              destructive
              isPending={mutation.isPending}
              onConfirm={remove}
              onCancel={() => {
                setConfirming(false);
                mutation.reset();
              }}
            />
          ) : (
            <Button
              className="mt-3 border-danger text-danger hover:bg-danger hover:text-white"
              onClick={() => {
                mutation.reset();
                setConfirming(true);
              }}
            >
              Delete proposal
            </Button>
          ))}

        {mutation.error !== null && outcome?.kind !== "gone" && (
          <div className="mt-3">
            {sentence === undefined ? (
              <ApiErrorNotice
                error={mutation.error}
                retry={remove}
                isRetrying={mutation.isPending}
              />
            ) : (
              <p role="alert" className="text-danger">
                {sentence}
              </p>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}

interface ProposalsListProps {
  slug: string;
  timezone: string;
  /**
   * The read, owned by the board. It is passed in rather than started here because the board
   * also needs it — a read that answers not_owner withdraws controls the list does not own —
   * and two observers of one key would each refetch on mount, which is two requests for one
   * list. The members panel on the group detail screen is arranged the same way.
   */
  query: UseQueryResult<ProposalsRead, ApiError>;
  /** Whether the reader may delete a proposal. Withdrawn rather than shown and refused. */
  canManage: boolean;
}

/**
 * The group's proposals, earliest first.
 *
 * The order is imposed here rather than assumed of the server: the contract says nothing about
 * the order of `ProposalPage.data`, and a list of candidate windows that is not in time order is
 * unreadable. The list owns its own query, so a failing suggestions panel leaves it standing.
 */
export function ProposalsList({
  slug,
  timezone,
  query,
  canManage,
}: ProposalsListProps) {
  const outcome =
    query.error === null ? undefined : describeSchedulingError(query.error);
  const proposals = [...(query.data?.data.data ?? [])].sort(
    (left, right) => Date.parse(left.start_at) - Date.parse(right.start_at),
  );

  return (
    <section aria-labelledby="proposals-heading" className="mt-8">
      <h2 id="proposals-heading" className="text-lg font-semibold">
        Proposed windows
      </h2>

      {query.isPending ? (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 text-neutral-600"
        >
          <Spinner />
          Loading the proposals…
        </p>
      ) : query.data === undefined ? (
        outcome?.kind === "not-owner" ? null : (
          <div className="mt-4">
            <ApiErrorNotice
              error={query.error}
              retry={() => void query.refetch()}
              isRetrying={query.isFetching}
            />
          </div>
        )
      ) : proposals.length === 0 ? (
        <p className="mt-4 text-neutral-600">{EMPTY_PROPOSALS_MESSAGE}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {proposals.map((proposal) => (
            <ProposalRow
              key={proposal.id}
              slug={slug}
              proposal={proposal}
              timezone={timezone}
              canManage={canManage && outcome?.kind !== "not-owner"}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
