import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { ConfirmPanel } from "../../components/ConfirmPanel";
import { randomUuidV4 } from "../../lib/uuid";
import { unconfirmGroupMutationOptions } from "./confirmationMutations";
import {
  NOT_OWNER_CONFIRMATION_MESSAGE,
  describeSchedulingError,
} from "./schedulingErrors";

export const UNCONFIRM_NOTE =
  "The group returns to open, so availability and voting are accepted again, and any reminders that have not been sent are cancelled. The calendar file and the feed stop describing a meeting until a proposal is confirmed again.";

/** Returning a confirmed group to open, for its owner. */
export function UnconfirmAction({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation(
    unconfirmGroupMutationOptions(queryClient, slug),
  );
  const [confirming, setConfirming] = useState(false);
  const key = useRef(randomUuidV4());

  const outcome =
    mutation.error === null
      ? undefined
      : describeSchedulingError(mutation.error);

  function unconfirm(): void {
    mutation.mutate(
      { idempotencyKey: key.current },
      { onSuccess: () => setConfirming(false) },
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
          Unconfirm this group
        </Button>
      </div>
    );
  }

  return (
    <div>
      <ConfirmPanel
        heading="Reopen this group?"
        description={UNCONFIRM_NOTE}
        confirmLabel="Reopen the group"
        pendingLabel="Reopening…"
        isPending={mutation.isPending}
        onConfirm={unconfirm}
        onCancel={() => {
          setConfirming(false);
          mutation.reset();
        }}
      />

      {mutation.error !== null && (
        <div className="mt-3">
          {outcome?.kind === "not-owner" ? (
            <p role="alert" className="text-danger">
              {NOT_OWNER_CONFIRMATION_MESSAGE}
            </p>
          ) : (
            <ApiErrorNotice
              error={mutation.error}
              retry={unconfirm}
              isRetrying={mutation.isPending}
            />
          )}
        </div>
      )}
    </div>
  );
}
