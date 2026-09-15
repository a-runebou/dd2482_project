import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { conditionalRead } from "../../api/conditional";
import { unwrap, type ApiError } from "../../api/errors";
import type { components } from "../../api/generated/schema";

type Group = components["schemas"]["Group"];
type MemberPage = components["schemas"]["MemberPage"];

/**
 * A read of a group together with the ETag that validated it.
 *
 * The validator lives in the query cache next to the body rather than in a ref or a module
 * variable, because it belongs to that exact body: a refetch replaces both at once, a remount
 * finds both, and there is no state that can survive a refetch and go stale. `version` is not
 * used for this. The contract calls the ETag "derived from the group version" and defines no
 * derivation, so rebuilding the header from `version` would be inventing a format; the opaque
 * bytes the server sent are sent back unchanged.
 */
export interface GroupRead {
  group: Group;
  etag: string | undefined;
}

export const groupDetailKey = (slug: string) =>
  ["groups", "detail", slug] as const;

export const groupMembersKey = (slug: string) =>
  ["groups", "detail", slug, "members"] as const;

/**
 * The group, read conditionally: the ETag the last 200 carried goes back as If-None-Match, and
 * a 304 puts the identical cached read back rather than fetching a body again. That matters
 * most after a mutation invalidates this query, which is the common case for this screen.
 *
 * The read keeps its own `{ group, etag }` shape rather than the API layer's `CachedRead`,
 * because that is the shape the detail screen already reads (frontend DECISIONS F21) and the
 * conditional read is meant to be invisible to it.
 */
async function readGroup(
  slug: string,
  previous: GroupRead | undefined,
  signal: AbortSignal,
): Promise<GroupRead> {
  const outcome = await conditionalRead<Group>(previous?.etag, (headers) =>
    apiClient.GET("/groups/{slug}", {
      params: { path: { slug } },
      headers,
      signal,
    }),
  );
  if (outcome.kind === "modified") {
    return { group: outcome.data, etag: outcome.etag };
  }
  if (previous === undefined) {
    // A validator that was never sent cannot have matched, and there is no body to fall back
    // on, so this is a broken server rather than an unchanged group.
    const error: ApiError = { kind: "unexpected", status: 304 };
    throw error;
  }
  return previous;
}

export function groupQueryOptions(slug: string) {
  return queryOptions({
    queryKey: groupDetailKey(slug),
    queryFn: ({ client, signal }) =>
      readGroup(
        slug,
        client.getQueryData<GroupRead>(groupDetailKey(slug)),
        signal,
      ),
  });
}

/**
 * The members of a group, as a separate query from the group itself so that one failing leaves
 * the other rendered (frontend DECISIONS F21). The cursor is not followed: the contract caps a
 * group's membership at max_members, so the first page is the roster.
 */
export function membersQueryOptions(slug: string) {
  return queryOptions({
    queryKey: groupMembersKey(slug),
    queryFn: () =>
      unwrap<MemberPage>(
        apiClient.GET("/groups/{slug}/members", {
          params: { path: { slug } },
        }),
      ),
  });
}
