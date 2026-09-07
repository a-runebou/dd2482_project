import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";
import { availabilityKey } from "./availabilityQueries";

type AvailabilitySelection = components["schemas"]["AvailabilitySelection"];

export interface SaveAvailabilityVariables {
  body: AvailabilitySelection;
  /** Minted per distinct body, as on group creation: a retry is the same request, an edit is not. */
  idempotencyKey: string;
}

/**
 * PUT /groups/{slug}/availability/me. A full replacement of the caller's rows, so the body is
 * the whole selection every time and there is nothing to merge (CLAUDE.md rule 9).
 *
 * The invalidation is a prefix match on purpose: the matrix and the caller's own selection both
 * change, and the own-selection key sits underneath the matrix key. The group itself is not
 * invalidated — its `version` moves, but nothing the detail view renders does.
 */
export function putMyAvailabilityMutationOptions(
  queryClient: QueryClient,
  slug: string,
) {
  return {
    mutationFn: ({ body, idempotencyKey }: SaveAvailabilityVariables) =>
      unwrap<AvailabilitySelection>(
        apiClient.PUT("/groups/{slug}/availability/me", {
          body,
          params: {
            path: { slug },
            header: { "Idempotency-Key": idempotencyKey },
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: availabilityKey(slug) });
    },
  };
}
