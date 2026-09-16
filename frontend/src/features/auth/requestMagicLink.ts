import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";

type MagicLinkRequest = components["schemas"]["MagicLinkRequest"];

/** POST /auth/magic-link. There is no session yet, so no query is invalidated on success. */
export function requestMagicLinkMutationOptions(redirectPath = "/") {
  return {
    mutationFn: (email: string) =>
      unwrap<undefined>(
        apiClient.POST("/auth/magic-link", {
          body: { email, redirect_path: redirectPath } satisfies MagicLinkRequest,
        }),
      ),
  };
}
