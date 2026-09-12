import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";

type MagicLinkRequest = components["schemas"]["MagicLinkRequest"];

/**
 * POST /auth/magic-link, sending only email. redirect_path is not sent: how the user returns
 * after signing in is unsettled (item C2 of docs/coordination/frontend-backend.md). There is no
 * session yet, so no query is invalidated on success.
 */
export function requestMagicLinkMutationOptions() {
  return {
    mutationFn: (email: string) =>
      unwrap<undefined>(
        apiClient.POST("/auth/magic-link", {
          body: { email } satisfies MagicLinkRequest,
        }),
      ),
  };
}
