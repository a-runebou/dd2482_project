import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { ConfirmPanel } from "../../components/ConfirmPanel";
import { useSession } from "../auth/useSession";
import { removeMemberMutationOptions } from "./groupMutations";
import { describeMutationError } from "./groupMutationErrors";
import { GroupMutationError } from "./GroupMutationError";

interface LeaveGroupActionProps {
  slug: string;
  name: string;
}

/**
 * Leaving is removing yourself: the contract has one endpoint for both, and the difference is
 * whose id is sent. The id comes from the session store rather than from the roster, so leaving
 * cannot depend on the members query having loaded.
 */
export function LeaveGroupAction({ slug, name }: LeaveGroupActionProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useSession();
  const mutation = useMutation(removeMemberMutationOptions(queryClient, slug));
  const [confirming, setConfirming] = useState(false);

  if (session === undefined) {
    return null;
  }
  const userId = session.user.id;

  function leave(): void {
    mutation.mutate(userId, {
      // A 404 means the membership has already ended, which is what leaving is for: treat it
      // as success rather than showing an error about a group the user is no longer in.
      onSettled: (_data, error) => {
        const gone =
          error !== null &&
          describeMutationError(error, { notFoundIsGone: true }).kind ===
            "gone";
        if (error === null || gone) {
          void navigate("/groups");
        }
      },
    });
  }

  if (!confirming) {
    return (
      <div>
        <Button
          className="border-danger text-danger hover:bg-danger hover:text-white"
          onClick={() => {
            mutation.reset();
            setConfirming(true);
          }}
        >
          Leave group
        </Button>
      </div>
    );
  }

  return (
    <div>
      <ConfirmPanel
        heading={`Leave ${name}?`}
        description="Your availability and votes in this group are deleted. You can only rejoin with a new invite link from the owner."
        confirmLabel="Leave"
        pendingLabel="Leaving…"
        destructive
        isPending={mutation.isPending}
        onConfirm={leave}
        onCancel={() => {
          setConfirming(false);
          mutation.reset();
        }}
      />
      {mutation.error !== null && (
        <GroupMutationError
          error={mutation.error}
          notFoundIsGone
          onRefresh={() => {
            void navigate("/groups");
          }}
          retry={leave}
          isRetrying={mutation.isPending}
        />
      )}
    </div>
  );
}
