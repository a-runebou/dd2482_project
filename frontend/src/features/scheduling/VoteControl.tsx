import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { FOCUS } from "../../components/cx";
import type { ApiError } from "../../api/errors";
import type { components } from "../../api/generated/schema";
import { randomUuidV4 } from "../../lib/uuid";
import { proposalsKey } from "./schedulingQueries";
import {
  castVoteMutationOptions,
  withdrawVoteMutationOptions,
} from "./voteMutations";
import {
  CONFIRMED_VOTE_MESSAGE,
  VOTE_FORBIDDEN_MESSAGE,
  describeSchedulingError,
} from "./schedulingErrors";
import { VOTE_LABELS, VOTE_VALUES } from "./votes";

type Proposal = components["schemas"]["Proposal"];
type VoteValue = components["schemas"]["VoteValue"];

export const VOTE_PENDING_MESSAGE = "Saving your vote…";

/**
 * The caller's own vote on one proposal.
 *
 * Three radio buttons and a withdrawal, rather than three toggle buttons: a vote is one choice
 * out of three, which is what a radio group is, and a real `input type="radio"` inside a
 * `fieldset` already conveys both the grouping and which member of it is chosen. Nothing here
 * relies on colour to say what is selected, and the arrow keys move between the three without
 * any roving-tabindex machinery of our own.
 *
 * There is no optimistic update. The vote is a single small request whose response carries the
 * new tally, so the honest thing is to show that it is in flight and then show what came back;
 * an optimistic tally would have to be rolled back on the one outcome that matters most here,
 * a confirmed group refusing the write.
 */
export function VoteControl({
  slug,
  proposal,
  windowLabel,
}: {
  slug: string;
  proposal: Proposal;
  windowLabel: string;
}) {
  const queryClient = useQueryClient();
  const cast = useMutation(castVoteMutationOptions(queryClient, slug));
  const withdraw = useMutation(withdrawVoteMutationOptions(queryClient, slug));
  // One key per proposal, so a retry after a failure is the same request and a change of mind
  // is a new one; the value is part of the body, which is what makes the second true.
  const key = useRef(randomUuidV4());

  const pending = cast.isPending || withdraw.isPending;
  const error: ApiError | null = cast.error ?? withdraw.error;
  const outcome =
    error === null
      ? undefined
      : describeSchedulingError(error, { notFoundIsGone: true });

  /**
   * A proposal that has gone underneath the voter is not a failure to report: the list is
   * simply out of date, so it is re-read and nothing is said.
   */
  function handled(thrown: ApiError): void {
    if (
      describeSchedulingError(thrown, { notFoundIsGone: true }).kind === "gone"
    ) {
      cast.reset();
      withdraw.reset();
      void queryClient.invalidateQueries({ queryKey: proposalsKey(slug) });
    }
  }

  function choose(value: VoteValue): void {
    if (pending || proposal.my_vote === value) {
      return;
    }
    withdraw.reset();
    cast.mutate(
      { proposalId: proposal.id, value, idempotencyKey: key.current },
      { onError: handled },
    );
  }

  function remove(): void {
    if (pending) {
      return;
    }
    cast.reset();
    withdraw.mutate(
      { proposalId: proposal.id, idempotencyKey: key.current },
      { onError: handled },
    );
  }

  const sentence =
    outcome?.kind === "confirmed"
      ? CONFIRMED_VOTE_MESSAGE
      : outcome?.kind === "not-owner"
        ? VOTE_FORBIDDEN_MESSAGE
        : undefined;

  return (
    <div className="mt-3">
      <fieldset disabled={pending}>
        <legend className="text-sm font-semibold">
          Your vote on {windowLabel}
        </legend>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          {VOTE_VALUES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`vote-${proposal.id}`}
                value={value}
                checked={proposal.my_vote === value}
                onChange={() => choose(value)}
                className={`size-4 accent-accent ${FOCUS}`}
              />
              {VOTE_LABELS[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          disabled={
            pending ||
            proposal.my_vote === null ||
            proposal.my_vote === undefined
          }
          onClick={remove}
        >
          Withdraw my vote
        </Button>
        {pending && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-neutral-600"
          >
            <Spinner />
            {VOTE_PENDING_MESSAGE}
          </p>
        )}
      </div>

      {error !== null && outcome?.kind !== "gone" && (
        <div className="mt-3">
          {sentence === undefined ? (
            <ApiErrorNotice
              error={error}
              // The retry repeats the request that failed, which is the value the reader chose
              // rather than the one the server still believes they hold.
              retry={() => {
                const attempted = cast.variables?.value;
                if (attempted === undefined) {
                  remove();
                } else {
                  choose(attempted);
                }
              }}
              isRetrying={pending}
            />
          ) : (
            <p role="alert" className="text-danger">
              {sentence}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
