import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";
import { proposalsKey } from "./schedulingQueries";

type Proposal = components["schemas"]["Proposal"];
type ProposalCreate = components["schemas"]["ProposalCreate"];

export interface CreateProposalVariables {
  body: ProposalCreate;
  /** Minted per distinct body, as elsewhere: a retry is the same request, a new window is not. */
  idempotencyKey: string;
}

export interface DeleteProposalVariables {
  proposalId: string;
  idempotencyKey: string;
}

/**
 * POST /groups/{slug}/proposals, owner only. The response is the created proposal, but it is not
 * written into the cache: the list is a conditional read whose body and validator belong
 * together, and splicing a proposal into the body would leave the ETag describing something the
 * client no longer holds. Invalidating instead re-reads both at once, which after a creation is
 * a real 200 because the list's validator has moved.
 */
export function createProposalMutationOptions(
  queryClient: QueryClient,
  slug: string,
) {
  return {
    mutationFn: ({ body, idempotencyKey }: CreateProposalVariables) =>
      unwrap<Proposal>(
        apiClient.POST("/groups/{slug}/proposals", {
          body,
          params: {
            path: { slug },
            header: { "Idempotency-Key": idempotencyKey },
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: proposalsKey(slug) });
    },
  };
}

/** DELETE /groups/{slug}/proposals/{proposalId}, owner only. */
export function deleteProposalMutationOptions(
  queryClient: QueryClient,
  slug: string,
) {
  return {
    mutationFn: ({ proposalId, idempotencyKey }: DeleteProposalVariables) =>
      unwrap<void>(
        apiClient.DELETE("/groups/{slug}/proposals/{proposalId}", {
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
