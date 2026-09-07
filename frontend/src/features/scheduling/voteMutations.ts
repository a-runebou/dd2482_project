import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";
import { proposalsKey, type ProposalsRead } from "./schedulingQueries";

type Proposal = components["schemas"]["Proposal"];
type VoteValue = components["schemas"]["VoteValue"];

export interface CastVoteVariables {
  proposalId: string;
  value: VoteValue;
  /** Minted per proposal, as elsewhere: a retry after a failure is the same request. */
  idempotencyKey: string;
}

export interface WithdrawVoteVariables {
  proposalId: string;
  idempotencyKey: string;
}

/**
 * Put the proposal the server just echoed back into the cached page.
 *
 * The validator is dropped along with it. The ETag described the page the server sent, not the
 * page now held, so keeping it would let the next conditional read answer 304 against a body
 * this client has already changed underneath it — and a 304 returns the cached copy, which
 * would then never be corrected. An unconditional read is the honest consequence of a splice.
 */
function spliceProposal(
  queryClient: QueryClient,
  slug: string,
  proposal: Proposal,
): void {
  queryClient.setQueryData<ProposalsRead>(proposalsKey(slug), (previous) =>
    previous === undefined
      ? previous
      : {
          etag: undefined,
          data: {
            ...previous.data,
            data: previous.data.data.map((existing) =>
              existing.id === proposal.id ? proposal : existing,
            ),
          },
        },
  );
}

/**
 * PUT /groups/{slug}/proposals/{proposalId}/vote/me. One vote per member per proposal, and the
 * PUT is a replacement rather than an addition, so changing a vote is this same request.
 *
 * The response is the whole updated proposal, so the new tally is already in hand: it is
 * spliced into the cached page and the reader sees it without waiting for a read. The
 * invalidation that follows is not the source of the tally, it is what puts the list and its
 * validator back in step with the server, since a vote also moves other members' rows.
 */
export function castVoteMutationOptions(
  queryClient: QueryClient,
  slug: string,
) {
  return {
    mutationFn: ({ proposalId, value, idempotencyKey }: CastVoteVariables) =>
      unwrap<Proposal>(
        apiClient.PUT("/groups/{slug}/proposals/{proposalId}/vote/me", {
          body: { value },
          params: {
            path: { slug, proposalId },
            header: { "Idempotency-Key": idempotencyKey },
          },
        }),
      ),
    onSuccess: async (proposal: Proposal) => {
      spliceProposal(queryClient, slug, proposal);
      await queryClient.invalidateQueries({ queryKey: proposalsKey(slug) });
    },
  };
}

/**
 * DELETE /groups/{slug}/proposals/{proposalId}/vote/me. A 204 with no body, so unlike the PUT
 * there is nothing to splice and the refetch is what produces the new tally.
 */
export function withdrawVoteMutationOptions(
  queryClient: QueryClient,
  slug: string,
) {
  return {
    mutationFn: ({ proposalId, idempotencyKey }: WithdrawVoteVariables) =>
      unwrap<void>(
        apiClient.DELETE("/groups/{slug}/proposals/{proposalId}/vote/me", {
          params: {
            path: { slug, proposalId },
            header: { "Idempotency-Key": idempotencyKey },
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: proposalsKey(slug) });
    },
  };
}
