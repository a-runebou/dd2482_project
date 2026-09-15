import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ConfirmPanel } from "../../components/ConfirmPanel";
import { randomUuidV4 } from "../../lib/uuid";
import { groupDetailKey } from "./groupQueries";
import { patchGroupMutationOptions } from "./groupMutations";
import { GroupMutationError } from "./GroupMutationError";
import { InviteLinkPanel } from "./InviteLinkPanel";

interface RotateInviteActionProps {
  slug: string;
  name: string;
  etag: string | undefined;
}

export function RotateInviteAction({
  slug,
  name,
  etag,
}: RotateInviteActionProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation(patchGroupMutationOptions(queryClient, slug));
  const [confirming, setConfirming] = useState(false);
  // The rotated link lives here and nowhere else: not in web storage, not in a URL and not in
  // the query cache (frontend DECISIONS F14 and F21).
  const [inviteUrl, setInviteUrl] = useState<string>();

  function rotate(): void {
    mutation.mutate(
      {
        body: { rotate_invite_token: true },
        etag,
        idempotencyKey: randomUuidV4(),
      },
      {
        onSuccess: (group) => {
          setInviteUrl(group.invite_url);
          setConfirming(false);
          // Drop the mutation's cached result as well, so the link is held in exactly one place.
          mutation.reset();
        },
      },
    );
  }

  if (inviteUrl !== undefined) {
    return (
      <InviteLinkPanel
        heading="New invite link"
        groupName={name}
        inviteUrl={inviteUrl}
        note="Copy it before you leave this page. The previous link no longer works, so anyone who still has it has to be sent this one."
      />
    );
  }

  if (!confirming) {
    return (
      <div>
        <Button
          onClick={() => {
            mutation.reset();
            setConfirming(true);
          }}
        >
          Rotate invite link
        </Button>
      </div>
    );
  }

  return (
    <div>
      <ConfirmPanel
        heading="Rotate the invite link?"
        description="A new link is issued and shown once. The previous link stops working immediately, so anyone who has not joined yet will need the new one."
        confirmLabel="Rotate the link"
        pendingLabel="Rotating…"
        isPending={mutation.isPending}
        onConfirm={rotate}
        onCancel={() => {
          setConfirming(false);
          mutation.reset();
        }}
      />
      {mutation.error !== null && (
        <GroupMutationError
          error={mutation.error}
          onRefresh={() => {
            void queryClient
              .refetchQueries({ queryKey: groupDetailKey(slug), exact: true })
              .then(() => {
                mutation.reset();
              });
          }}
          retry={rotate}
          isRetrying={mutation.isPending}
        />
      )}
    </div>
  );
}
