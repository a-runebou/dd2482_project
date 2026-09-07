import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { cachedConditionalRead, type CachedRead } from "../../api/conditional";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";

type SuggestionPage = components["schemas"]["SuggestionPage"];
type ProposalPage = components["schemas"]["ProposalPage"];

/**
 * Both reads live under one feature prefix, so a screen can drop everything it holds for a
 * group in one invalidation without touching the group or the availability keys.
 */
export const schedulingKey = (slug: string) => ["scheduling", slug] as const;

/**
 * Suggestions are keyed by every parameter that goes into the request, the requested limit
 * included. Keying on the duration alone would let a change of limit render the previous
 * request's five windows while asking for ten, because TanStack Query would treat the two as
 * one query; the key is the request, so the cache cannot answer a question it was not asked.
 */
export const suggestionsKey = (
  slug: string,
  durationMinutes: number,
  limit: number,
) => ["scheduling", slug, "suggestions", durationMinutes, limit] as const;

export const proposalsKey = (slug: string) =>
  ["scheduling", slug, "proposals"] as const;

/** The proposals list as it is cached: the page, and the ETag that validated it. */
export type ProposalsRead = CachedRead<ProposalPage>;

/**
 * Ranked candidate windows, computed on request and never stored (ARCHITECTURE 5.1).
 *
 * `staleTime: 0` is the whole policy, and it is deliberate rather than merely the default: a
 * suggestion is a function of the availability matrix, which the grid polls and any member can
 * change at any moment, so a cached suggestion is a claim about other people's answers that may
 * already be false. Every mount and every window focus therefore refetches. Nothing is
 * discarded in the meantime — the cached windows stay on screen while the new ones are in
 * flight — but they are never treated as current.
 *
 * The interval is not polled: unlike the grid, this screen is read on purpose rather than
 * watched, and a request per member per few seconds for a computation the backend does not
 * cache would be a poor trade for a list that is re-read when it is looked at.
 */
export function suggestionsQueryOptions(
  slug: string,
  durationMinutes: number,
  limit: number,
) {
  return queryOptions({
    queryKey: suggestionsKey(slug, durationMinutes, limit),
    queryFn: ({ signal }) =>
      unwrap<SuggestionPage>(
        apiClient.GET("/groups/{slug}/suggestions", {
          params: {
            path: { slug },
            query: { duration_minutes: durationMinutes, limit },
          },
          signal,
        }),
      ),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
}

/**
 * The proposals of a group, read conditionally: the list carries an ETag, so a refetch after a
 * creation or a deletion costs a header exchange when nothing else has moved. The validator is
 * cached beside the body it validated, as everywhere else (frontend DECISIONS F21, F23).
 */
export function proposalsQueryOptions(slug: string) {
  return queryOptions({
    queryKey: proposalsKey(slug),
    queryFn: ({ client, signal }) =>
      cachedConditionalRead<ProposalPage>(
        client.getQueryData<ProposalsRead>(proposalsKey(slug)),
        (headers) =>
          apiClient.GET("/groups/{slug}/proposals", {
            params: { path: { slug } },
            headers,
            signal,
          }),
      ),
  });
}
