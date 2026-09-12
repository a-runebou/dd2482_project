import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { clearSession } from "../../api/session";
import { configQueryOptions } from "../../api/config";

/**
 * Sign out: revoke the refresh-token family server-side, then drop everything held locally.
 * The clearing is in a finally, so a failed or unreachable request still signs the user out of
 * this tab rather than leaving a token in memory and stale user data in the cache.
 *
 * The configuration query is excluded: GET /config needs no authentication and is fetched once
 * per session (ARCHITECTURE section 8), so removing it here would send the boot gate in
 * RootLayout back to its loading state for no reason. Removing by predicate, rather than
 * enumerating every feature's keys, means a future query needs no change here.
 */
export async function signOut(queryClient: QueryClient): Promise<void> {
  try {
    await apiClient.DELETE("/auth/session");
  } finally {
    clearSession();
    queryClient.removeQueries({
      predicate: (query) =>
        query.queryKey[0] !== configQueryOptions.queryKey[0],
    });
  }
}

export function signOutMutationOptions(queryClient: QueryClient) {
  return {
    mutationKey: ["auth", "sign-out"],
    mutationFn: () => signOut(queryClient),
  };
}
