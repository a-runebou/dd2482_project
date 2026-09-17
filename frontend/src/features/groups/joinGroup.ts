import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";

type Group = components["schemas"]["Group"];
type JoinRequest = components["schemas"]["JoinRequest"];

export function joinGroupMutationOptions(slug: string) {
  return {
    mutationFn: (inviteToken: string) =>
      unwrap<Group>(
        apiClient.POST("/groups/{slug}/join", {
          body: { invite_token: inviteToken } satisfies JoinRequest,
          params: { path: { slug } },
        }),
      ),
  };
}
