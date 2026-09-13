import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { normalizeError, unwrap, type ApiError } from "../../api/errors";
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
 * `unwrap` deliberately returns only the body, so the ETag would be lost. This is the same
 * contract — data or a thrown ApiError — with the response header kept.
 */
async function readGroup(slug: string): Promise<GroupRead> {
  let result;
  try {
    result = await apiClient.GET("/groups/{slug}", {
      params: { path: { slug } },
    });
  } catch (thrown) {
    const error: ApiError =
      thrown instanceof TypeError
        ? { kind: "network" }
        : { kind: "unexpected" };
    throw error;
  }
  if (!result.response.ok) {
    throw normalizeError(result.response, result.error);
  }
  return {
    group: result.data as Group,
    etag: result.response.headers.get("etag") ?? undefined,
  };
}

export function groupQueryOptions(slug: string) {
  return queryOptions({
    queryKey: groupDetailKey(slug),
    queryFn: () => readGroup(slug),
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
