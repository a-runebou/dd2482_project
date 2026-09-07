import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import { setSession } from "../../api/session";
import type { components } from "../../api/generated/schema";

type SessionCreateRequest = components["schemas"]["SessionCreateRequest"];

/** Exchange a magic-link token for a session, storing the result in memory. */
export async function exchangeMagicLinkToken(token: string): Promise<void> {
  const session = await unwrap(
    apiClient.POST("/auth/session", {
      body: { token } satisfies SessionCreateRequest,
    }),
  );
  setSession(session.access_token, session.user);
}

/**
 * The exchange as a query rather than a mutation, because a magic-link token is single use and
 * the callback must spend it exactly once: a query is deduplicated per QueryClient, so
 * StrictMode's double effects and a remount share one request, where two mutations would be two.
 * Nothing retries, for the same reason.
 *
 * The query resolves to true, never to the SessionResponse: the access token goes to the module
 * store and must not also sit in the query cache (CLAUDE.md rule 10). The key deliberately omits
 * the token, which would put it in the cache too; the page is reached by a full page load from a
 * mail link, so a second exchange within one QueryClient does not arise.
 */
export function sessionExchangeQueryOptions(token: string) {
  return queryOptions({
    queryKey: ["auth", "exchange"],
    queryFn: async () => {
      await exchangeMagicLinkToken(token);
      return true;
    },
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
