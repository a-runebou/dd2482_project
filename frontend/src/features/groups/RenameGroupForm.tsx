import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { TextInput } from "../../components/TextInput";
import { randomUuidV4 } from "../../lib/uuid";
import { groupDetailKey } from "./groupQueries";
import {
  patchGroupMutationOptions,
  type PatchGroupVariables,
} from "./groupMutations";
import { GroupMutationError } from "./GroupMutationError";

interface RenameGroupFormProps {
  slug: string;
  name: string;
  etag: string | undefined;
}

/**
 * Renaming, as an inline form. Only the changed property is sent, so a patch never restates
 * values the user did not touch. The typed value is never reset by a refetch: after a
 * version_conflict the user refreshes the group and their input is still there to resubmit.
 */
export function RenameGroupForm({ slug, name, etag }: RenameGroupFormProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation(patchGroupMutationOptions(queryClient, slug));
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  // The key and the body it was minted for, as on creation: a resubmission of an identical
  // body is the same request to the server, and any edit mints a new key.
  const attemptRef = useRef<{
    serialized: string;
    variables: PatchGroupVariables;
  }>(null);

  function open(): void {
    setValue(name);
    mutation.reset();
    setEditing(true);
  }

  function cancel(): void {
    setEditing(false);
    setValue(name);
    mutation.reset();
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = value.trim();
    // UX only: the length limits are the backend's (CLAUDE.md rule 6).
    if (trimmed === "" || trimmed === name) {
      cancel();
      return;
    }
    const body = { name: trimmed };
    const serialized = JSON.stringify(body);
    const variables: PatchGroupVariables =
      attemptRef.current?.serialized === serialized
        ? { ...attemptRef.current.variables, etag }
        : { body, etag, idempotencyKey: randomUuidV4() };
    attemptRef.current = { serialized, variables };

    mutation.mutate(variables, {
      onSuccess: () => {
        setEditing(false);
      },
    });
  }

  function refreshGroup(): void {
    void queryClient
      .refetchQueries({ queryKey: groupDetailKey(slug), exact: true })
      .then(() => {
        mutation.reset();
      });
  }

  if (!editing) {
    return (
      <div>
        <Button onClick={open}>Rename</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label="Group name">
        {(control) => (
          <TextInput
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            {...control}
          />
        )}
      </Field>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button type="submit" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending && <Spinner />}
          {mutation.isPending ? "Saving…" : "Save name"}
        </Button>
        <Button onClick={cancel} disabled={mutation.isPending}>
          Cancel
        </Button>
      </div>
      {mutation.error !== null && (
        <GroupMutationError
          error={mutation.error}
          onRefresh={refreshGroup}
          retry={() => {
            const previous = attemptRef.current?.variables;
            if (previous !== undefined) {
              mutation.mutate(
                { ...previous, etag },
                {
                  onSuccess: () => {
                    setEditing(false);
                  },
                },
              );
            }
          }}
          isRetrying={mutation.isPending}
        />
      )}
    </form>
  );
}
