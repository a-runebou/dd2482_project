import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";
import { groupDetailKey, groupMembersKey } from "./groupQueries";

type Group = components["schemas"]["Group"];
type GroupPatch = components["schemas"]["GroupPatch"];

export interface PatchGroupVariables {
  body: GroupPatch;
  /** The ETag of the read this change is based on; omitted when there was none. */
  etag: string | undefined;
  /** Minted per distinct body, as on creation: a retry is the same request, an edit is not. */
  idempotencyKey: string;
}

/**
 * PATCH /groups/{slug}. The response carries the updated group but is deliberately not written
 * into the cache: a rotation answers with an `invite_url`, which must never reach the query
 * cache (ARCHITECTURE 6.5, frontend DECISIONS F14). Invalidating instead means the next read
 * comes from the server, which does not return the invite link.
 *
 * The invalidation is exact, so renaming a group does not also refetch its members: the members
 * key is nested under the detail key and a prefix match would hit it.
 */
export function patchGroupMutationOptions(
  queryClient: QueryClient,
  slug: string,
) {
  return {
    mutationFn: ({ body, etag, idempotencyKey }: PatchGroupVariables) =>
      unwrap<Group>(
        apiClient.PATCH("/groups/{slug}", {
          body,
          params: {
            path: { slug },
            header: {
              ...(etag === undefined ? {} : { "If-Match": etag }),
              "Idempotency-Key": idempotencyKey,
            },
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: groupDetailKey(slug),
        exact: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["groups", "list"] });
    },
  };
}

/**
 * DELETE /groups/{slug}. The group is gone, so its cached entries are removed rather than
 * refetched: an invalidation would send a request for a group that now answers 404.
 */
export function deleteGroupMutationOptions(
  queryClient: QueryClient,
  slug: string,
) {
  return {
    mutationFn: () =>
      unwrap<void>(
        apiClient.DELETE("/groups/{slug}", { params: { path: { slug } } }),
      ),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: groupDetailKey(slug) });
      await queryClient.invalidateQueries({ queryKey: ["groups", "list"] });
    },
  };
}

/**
 * DELETE /groups/{slug}/members/{userId}, which is both "remove a member" and "leave", the
 * difference being whose id is sent. The roster and the group both change, because member_count
 * is part of the group, so both are invalidated; the list is too, for the same reason.
 */
export function removeMemberMutationOptions(
  queryClient: QueryClient,
  slug: string,
) {
  return {
    mutationFn: (userId: string) =>
      unwrap<void>(
        apiClient.DELETE("/groups/{slug}/members/{userId}", {
          params: { path: { slug, userId } },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: groupMembersKey(slug) });
      await queryClient.invalidateQueries({
        queryKey: groupDetailKey(slug),
        exact: true,
      });
      await queryClient.invalidateQueries({ queryKey: ["groups", "list"] });
    },
  };
}
