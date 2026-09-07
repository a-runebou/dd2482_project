import { infiniteQueryOptions } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";

type GroupPage = components["schemas"]["GroupPage"];

/**
 * Groups the caller belongs to (ARCHITECTURE 7.1: a cursor envelope, never a bare array). The
 * first page omits cursor; each next page passes the previous page's next_cursor. limit is never
 * sent, so the server's default page size applies (CLAUDE.md rule 7).
 */
export const groupsInfiniteQueryOptions = infiniteQueryOptions({
  queryKey: ["groups", "list"] as const,
  queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
    unwrap<GroupPage>(
      apiClient.GET("/groups", {
        params: {
          query: pageParam === undefined ? undefined : { cursor: pageParam },
        },
      }),
    ),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage: GroupPage) => lastPage.next_cursor ?? undefined,
});
