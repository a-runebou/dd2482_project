import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";
import { groupDetailKey } from "../groups/groupQueries";
import { proposalsKey } from "./schedulingQueries";

type Group = components["schemas"]["Group"];

export interface ConfirmVariables {
  proposalId: string;
  /** Whether the worker should remind members ahead of the meeting. The contract defaults it
   * to true, and so does the control; it is sent explicitly all the same, because a default a
   * caller relies on without stating is a default that can move underneath it. */
  sendReminders: boolean;
  idempotencyKey: string;
}

export interface UnconfirmVariables {
  idempotencyKey: string;
}

/**
 * Both mutations invalidate the group's own read, which is what every screen derives the freeze
 * from: the grid, the proposals board and the detail view all watch `Group.state`, so one
 * invalidation is what makes the freeze arrive everywhere rather than only where it was caused.
 *
 * The proposals list is invalidated with it. Confirming does not change a proposal, but it does
 * change what the list may do with one, and the list's own validator has moved on the server
 * because the confirmed proposal is part of what it now serves.
 */
async function refreshGroup(
  queryClient: QueryClient,
  slug: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: groupDetailKey(slug),
    exact: true,
  });
  await queryClient.invalidateQueries({ queryKey: proposalsKey(slug) });
}

/** POST /groups/{slug}/confirmation, owner only. */
export function confirmGroupMutationOptions(
  queryClient: QueryClient,
  slug: string,
) {
  return {
    mutationFn: ({
      proposalId,
      sendReminders,
      idempotencyKey,
    }: ConfirmVariables) =>
      unwrap<Group>(
        apiClient.POST("/groups/{slug}/confirmation", {
          body: { proposal_id: proposalId, send_reminders: sendReminders },
          params: {
            path: { slug },
            header: { "Idempotency-Key": idempotencyKey },
          },
        }),
      ),
    onSuccess: async () => {
      await refreshGroup(queryClient, slug);
    },
  };
}

/** DELETE /groups/{slug}/confirmation, owner only. Returns the group to open. */
export function unconfirmGroupMutationOptions(
  queryClient: QueryClient,
  slug: string,
) {
  return {
    mutationFn: ({ idempotencyKey }: UnconfirmVariables) =>
      unwrap<Group>(
        apiClient.DELETE("/groups/{slug}/confirmation", {
          params: {
            path: { slug },
            header: { "Idempotency-Key": idempotencyKey },
          },
        }),
      ),
    onSuccess: async () => {
      await refreshGroup(queryClient, slug);
    },
  };
}
