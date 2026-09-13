import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { ConfirmPanel } from "../../components/ConfirmPanel";
import { Field } from "../../components/Field";
import { TextInput } from "../../components/TextInput";
import { groupDetailKey } from "./groupQueries";
import { deleteGroupMutationOptions } from "./groupMutations";
import { GroupMutationError } from "./GroupMutationError";

interface DeleteGroupActionProps {
  slug: string;
  name: string;
}

/**
 * Deleting a group is irreversible in v1, so the confirmation asks for the group's name to be
 * typed exactly, case included. The comparison is deliberately strict: no trimming and no case
 * folding, because the point is to make the action deliberate rather than convenient.
 */
export function DeleteGroupAction({ slug, name }: DeleteGroupActionProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation(deleteGroupMutationOptions(queryClient, slug));
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  function remove(): void {
    mutation.mutate(undefined, {
      onSuccess: () => {
        void navigate("/groups");
      },
    });
  }

  if (!confirming) {
    return (
      <div>
        <Button
          className="border-danger text-danger hover:bg-danger hover:text-white"
          onClick={() => {
            setTyped("");
            mutation.reset();
            setConfirming(true);
          }}
        >
          Delete group
        </Button>
      </div>
    );
  }

  return (
    <div>
      <ConfirmPanel
        heading={`Delete ${name}?`}
        description="The group, its availability and any proposals are deleted for every member."
        confirmLabel="Delete permanently"
        pendingLabel="Deleting…"
        destructive
        confirmDisabled={typed !== name}
        isPending={mutation.isPending}
        onConfirm={remove}
        onCancel={() => {
          setConfirming(false);
          setTyped("");
          mutation.reset();
        }}
      >
        <div className="mt-4">
          <Field
            label="Type the group name to confirm"
            description={`Type ${name} exactly, including capitals.`}
          >
            {(control) => (
              <TextInput
                type="text"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                {...control}
              />
            )}
          </Field>
        </div>
      </ConfirmPanel>
      {mutation.error !== null && (
        <GroupMutationError
          error={mutation.error}
          onRefresh={() => {
            void queryClient.refetchQueries({
              queryKey: groupDetailKey(slug),
              exact: true,
            });
          }}
          retry={remove}
          isRetrying={mutation.isPending}
        />
      )}
    </div>
  );
}
