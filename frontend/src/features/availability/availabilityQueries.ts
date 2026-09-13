import { queryOptions, skipToken } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";

type AvailabilityMatrix = components["schemas"]["AvailabilityMatrix"];
type AvailabilitySelection = components["schemas"]["AvailabilitySelection"];
type BusyBlockPage = components["schemas"]["BusyBlockPage"];

/**
 * The matrix and the caller's own selection are two reads of the same thing, so the own-selection
 * key is nested under the matrix key: invalidating the prefix after a write refetches both at
 * once, which is exactly what a full replacement changes (CLAUDE.md rule 9).
 */
export const availabilityKey = (slug: string) =>
  ["availability", slug] as const;

export const myAvailabilityKey = (slug: string) =>
  ["availability", slug, "me"] as const;

/**
 * Busy blocks are per user and not per group (ARCHITECTURE section 5, invariant 8), so the key
 * is the window rather than the slug: two groups covering the same dates share one read.
 */
export const busyKey = (from: string, to: string) =>
  ["busy", from, to] as const;

export function availabilityMatrixQueryOptions(slug: string) {
  return queryOptions({
    queryKey: availabilityKey(slug),
    queryFn: () =>
      unwrap<AvailabilityMatrix>(
        apiClient.GET("/groups/{slug}/availability", {
          params: { path: { slug } },
        }),
      ),
  });
}

export function myAvailabilityQueryOptions(slug: string) {
  return queryOptions({
    queryKey: myAvailabilityKey(slug),
    queryFn: () =>
      unwrap<AvailabilitySelection>(
        apiClient.GET("/groups/{slug}/availability/me", {
          params: { path: { slug } },
        }),
      ),
  });
}

/**
 * GET /me/busy over the group's own range. The contract requires both bounds, so there is no
 * request to make until the group has loaded and its slots are known; `skipToken` is what says
 * that in a way the types agree with, rather than an `enabled` flag beside a non-null assertion.
 */
export function busyQueryOptions(
  range: { from: string; to: string } | undefined,
) {
  return queryOptions({
    queryKey: busyKey(range?.from ?? "unknown", range?.to ?? "unknown"),
    queryFn:
      range === undefined
        ? skipToken
        : () =>
            unwrap<BusyBlockPage>(
              apiClient.GET("/me/busy", {
                params: { query: { from: range.from, to: range.to } },
              }),
            ),
  });
}
