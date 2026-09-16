import { queryOptions } from "@tanstack/react-query";
import { refreshSession } from "../../api/session";

/**
 * The boot probe. The access token lives only in memory, so a page reload starts signed out;
 * one refresh attempt at boot turns an existing HttpOnly refresh cookie back into a session.
 *
 * Being signed out is the normal outcome, not a failure: refreshSession resolves to undefined
 * rather than rejecting, so this query can never enter an error state and the boot gate has
 * nothing to report. It runs once per QueryClient and is never refetched or retried.
 */
export const sessionProbeQueryOptions = queryOptions({
  queryKey: ["auth", "probe"],
  queryFn: async () => (await refreshSession()) !== undefined,
  retry: false,
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});
