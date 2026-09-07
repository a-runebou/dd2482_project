import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmPanel } from "../../components/ConfirmPanel";
import { Spinner } from "../../components/Spinner";
import type { components } from "../../api/generated/schema";
import { groupMembersKey } from "./groupQueries";
import { removeMemberMutationOptions } from "./groupMutations";
import { describeMutationError } from "./groupMutationErrors";
import { GroupMutationError } from "./GroupMutationError";

type Member = components["schemas"]["Member"];
type MemberPage = components["schemas"]["MemberPage"];

const ROLE_LABELS: Record<Member["role"], string> = {
  owner: "Owner",
  member: "Member",
};

interface MembersPanelProps {
  slug: string;
  /** Owned by GroupDetail, so the roster is fetched in parallel with the group itself. */
  query: UseQueryResult<MemberPage>;
  /** The owner may remove anyone but themselves; nobody else sees a removal control at all. */
  canRemove: boolean;
}

export function MembersPanel({ slug, query, canRemove }: MembersPanelProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation(removeMemberMutationOptions(queryClient, slug));
  const [confirmingUserId, setConfirmingUserId] = useState<string>();

  function remove(userId: string): void {
    mutation.mutate(userId, {
      onSettled: (_data, error) => {
        // A 404 means the membership has already ended, which is the outcome the user asked
        // for: close the confirmation and let the roster refetch say so, with no error shown.
        const gone =
          error !== null &&
          describeMutationError(error, { notFoundIsGone: true }).kind ===
            "gone";
        if (error === null || gone) {
          setConfirmingUserId(undefined);
        }
        if (gone) {
          void queryClient.invalidateQueries({
            queryKey: groupMembersKey(slug),
          });
        }
      },
    });
  }

  return (
    <Card className="mt-6">
      <h2 className="text-lg font-semibold">Members</h2>

      {query.isPending && (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 text-neutral-600"
        >
          <Spinner />
          Loading the members…
        </p>
      )}

      {query.data === undefined && query.error && (
        <div className="mt-3">
          <ApiErrorNotice
            error={query.error}
            retry={() => {
              void query.refetch();
            }}
            isRetrying={query.isFetching}
          />
        </div>
      )}

      {query.data !== undefined && (
        <ul aria-label="Members" className="mt-3 divide-y divide-neutral-200">
          {query.data.data.map((member) => (
            <li key={member.user_id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div>
                  <p className="font-semibold">{member.display_name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-neutral-600">
                    <span>{ROLE_LABELS[member.role]}</span>
                    <span>
                      {member.responded ? "Responded" : "Not responded"}
                    </span>
                  </div>
                </div>
                {canRemove &&
                  member.role !== "owner" &&
                  confirmingUserId !== member.user_id && (
                    <Button
                      className="border-danger text-danger hover:bg-danger hover:text-white"
                      onClick={() => {
                        mutation.reset();
                        setConfirmingUserId(member.user_id);
                      }}
                    >
                      {`Remove ${member.display_name}`}
                    </Button>
                  )}
              </div>

              {confirmingUserId === member.user_id && (
                <>
                  <ConfirmPanel
                    heading={`Remove ${member.display_name}?`}
                    description={`${member.display_name} loses access to this group, and their availability and votes here are deleted.`}
                    confirmLabel="Remove"
                    pendingLabel="Removing…"
                    destructive
                    isPending={mutation.isPending}
                    onConfirm={() => {
                      remove(member.user_id);
                    }}
                    onCancel={() => {
                      setConfirmingUserId(undefined);
                      mutation.reset();
                    }}
                  />
                  {mutation.error !== null && (
                    <GroupMutationError
                      error={mutation.error}
                      notFoundIsGone
                      onRefresh={() => {
                        void query.refetch();
                      }}
                      retry={() => {
                        remove(member.user_id);
                      }}
                      isRetrying={mutation.isPending}
                    />
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
