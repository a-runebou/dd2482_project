import { useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { ConfirmPanel } from "../../components/ConfirmPanel";
import type { components } from "../../api/generated/schema";
import { randomUuidV4 } from "../../lib/uuid";
import { confirmGroupMutationOptions } from "./confirmationMutations";
import {
  CONFIRMED_MESSAGE,
  NOT_OWNER_CONFIRMATION_MESSAGE,
  describeSchedulingError,
} from "./schedulingErrors";

type Proposal = components["schemas"]["Proposal"];

export const CONFIRM_FREEZE_NOTE =
  "Everyone's availability and every vote are frozen once this group is confirmed. You can unconfirm it later, which reopens it.";

export const REMINDERS_LABEL = "Send reminders";

export const REMINDERS_DESCRIPTION =
  "Members are reminded by e-mail ahead of the meeting. Turn this off to confirm the window quietly.";

/**
 * Confirming one proposal, for the group's owner.
 *
 * It goes through the shared confirmation rather than acting on the first click, because it
 * changes what every other member of the group may do: the window is named in the group's
 * timezone, and the freeze is stated rather than left to be discovered.
 *
 * It is not marked destructive. Confirming is reversible — the owner can unconfirm — and
 * ConfirmPanel's destructive treatment carries the sentence "This cannot be undone", which
 * would be untrue here.
 */
export function ConfirmProposalAction({
  slug,
  proposal,
  windowLabel,
}: {
  slug: string;
  proposal: Proposal;
  windowLabel: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation(confirmGroupMutationOptions(queryClient, slug));
  const [confirming, setConfirming] = useState(false);
  const [sendReminders, setSendReminders] = useState(true);
  const key = useRef(randomUuidV4());
  const descriptionId = useId();

  const outcome =
    mutation.error === null
      ? undefined
      : describeSchedulingError(mutation.error);

  function confirm(): void {
    mutation.mutate(
      {
        proposalId: proposal.id,
        sendReminders,
        idempotencyKey: key.current,
      },
      { onSuccess: () => setConfirming(false) },
    );
  }

  if (!confirming) {
    return (
      <Button
        className="mt-3"
        variant="primary"
        onClick={() => {
          mutation.reset();
          setConfirming(true);
        }}
      >
        Confirm this proposal
      </Button>
    );
  }

  const sentence =
    outcome?.kind === "confirmed"
      ? CONFIRMED_MESSAGE
      : outcome?.kind === "not-owner"
        ? NOT_OWNER_CONFIRMATION_MESSAGE
        : undefined;

  return (
    <div>
      <ConfirmPanel
        heading={`Confirm ${windowLabel}?`}
        description={CONFIRM_FREEZE_NOTE}
        confirmLabel="Confirm this window"
        pendingLabel="Confirming…"
        isPending={mutation.isPending}
        onConfirm={confirm}
        onCancel={() => {
          setConfirming(false);
          mutation.reset();
        }}
      >
        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Checkbox
              checked={sendReminders}
              aria-describedby={descriptionId}
              onChange={(event) => setSendReminders(event.target.checked)}
            />
            {REMINDERS_LABEL}
          </label>
          <p id={descriptionId} className="mt-1 text-sm text-neutral-600">
            {REMINDERS_DESCRIPTION}
          </p>
        </div>
      </ConfirmPanel>

      {mutation.error !== null && (
        <div className="mt-3">
          {sentence === undefined ? (
            <ApiErrorNotice
              error={mutation.error}
              retry={confirm}
              isRetrying={mutation.isPending}
            />
          ) : (
            <p role="alert" className="text-danger">
              {sentence}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
