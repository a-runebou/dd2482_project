import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import type { components } from "../../api/generated/schema";
import type { GroupFormValues } from "./validateGroupForm";

type GroupCreate = components["schemas"]["GroupCreate"];
type GroupWithInvite = components["schemas"]["GroupWithInvite"];

export interface CreateGroupAttempt {
  body: GroupCreate;
  idempotencyKey: string;
}

/**
 * The form's state as the contract's request body. timezone is always sent, so the group never
 * silently inherits the schema default; description is omitted rather than sent empty, because
 * the schema has no empty-string case and null is not accepted on create.
 */
export function toGroupCreate(values: GroupFormValues): GroupCreate {
  const description = values.description.trim();
  return {
    name: values.name.trim(),
    ...(description === "" ? {} : { description }),
    timezone: values.timezone,
    date_start: values.dateStart,
    date_end: values.dateEnd,
    window_start_minute: values.windowStartMinute,
    window_end_minute: values.windowEndMinute,
  };
}

/**
 * POST /groups. The key travels as openapi-fetch's typed header parameter, so a rename in the
 * contract is a compile error rather than a silently dropped header. Every "groups" query is
 * invalidated on success; the response itself is not seeded into the cache, because it carries
 * invite_url, which must never reach the query cache (ARCHITECTURE 6.5).
 */
export function createGroupMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ body, idempotencyKey }: CreateGroupAttempt) =>
      unwrap<GroupWithInvite>(
        apiClient.POST("/groups", {
          body,
          params: { header: { "Idempotency-Key": idempotencyKey } },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  };
}
