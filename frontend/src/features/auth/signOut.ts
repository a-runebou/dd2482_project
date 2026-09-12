import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { clearSession } from "../../api/session";

/**
 * Sign out: revoke the refresh-token family server-side, then drop everything held locally.
 * The clearing is in a finally, so a failed or unreachable request still signs the user out of
 * this tab rather than leaving a token in memory and stale user data in the cache.
 */
export async function signOut(queryClient: QueryClient): Promise<void> {
  try {
    await apiClient.DELETE("/auth/session");
  } finally {
    clearSession();
    queryClient.clear();
  }
}

export function signOutMutationOptions(queryClient: QueryClient) {
  return {
    mutationKey: ["auth", "sign-out"],
    mutationFn: () => signOut(queryClient),
  };
}
