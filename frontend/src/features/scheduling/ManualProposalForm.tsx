import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Field } from "../../components/Field";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import type { components } from "../../api/generated/schema";
import { formatCalendarDate } from "../../lib/date";
import { formatWindow } from "../../lib/instants";
import {
  addMinutes,
  generateSlots,
  slotDate,
  slotLabel,
} from "../../lib/slots";
import { randomUuidV4 } from "../../lib/uuid";
import { createProposalMutationOptions } from "./schedulingMutations";
import {
  CONFIRMED_MESSAGE,
  NOT_OWNER_MESSAGE,
  OUTSIDE_WINDOW_MESSAGE,
  describeSchedulingError,
  limitMessage,
} from "./schedulingErrors";
import {
  DEFAULT_DURATION_MINUTES,
  durationLabel,
  durationOptions,
} from "./windows";

type Config = components["schemas"]["Config"];
type Group = components["schemas"]["Group"];

export const PAST_WINDOW_END_MESSAGE =
  "That window ends after the group's daily window does. Choose an earlier start or a shorter duration.";

interface ManualProposalFormProps {
  group: Group;
  config: Config;
}

/**
 * A proposal entered by hand, owner only.
 *
 * The window is composed from the group's own generated slot set rather than typed, so the
 * client cannot construct an instant that is unaligned, outside the date range or outside the
 * daily window: the date list is the group's local dates, the start list is the slots that
 * local date actually has — eight rather than six on 25 October 2026 — and the duration is a
 * multiple of the slot length between the configured bounds. Converting a local selection to
 * UTC is not done here at all; the slot set is already instants (CLAUDE.md rule 3).
 *
 * The only validation is what the client can know from that set: that the window does not run
 * past the end of the day's window. Everything else is the backend's (CLAUDE.md rule 6).
 */
export function ManualProposalForm({ group, config }: ManualProposalFormProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation(
    createProposalMutationOptions(queryClient, group.slug),
  );

  // Grouped per local date, which is what makes a transition day's extra slots visible as such.
  const byDate = useMemo(() => {
    const slots = generateSlots(
      group.date_start,
      group.date_end,
      group.window_start_minute,
      group.window_end_minute,
      group.slot_minutes,
      group.timezone,
    );
    const grouped = new Map<string, string[]>();
    for (const slot of slots) {
      const date = slotDate(slot, group.timezone);
      const column = grouped.get(date);
      if (column === undefined) {
        grouped.set(date, [slot]);
      } else {
        column.push(slot);
      }
    }
    return grouped;
  }, [group]);

  const dates = [...byDate.keys()];
  const durations = durationOptions(
    group.slot_minutes,
    config.min_duration_minutes,
    config.max_duration_minutes,
  );

  const [date, setDate] = useState(dates[0] ?? "");
  const [duration, setDuration] = useState(
    durations.includes(DEFAULT_DURATION_MINUTES)
      ? DEFAULT_DURATION_MINUTES
      : (durations[0] ?? group.slot_minutes),
  );
  const slots = byDate.get(date) ?? [];
  const [start, setStart] = useState(slots[0] ?? "");
  const [blocked, setBlocked] = useState<string | undefined>(undefined);

  // The selected start belongs to the selected date; changing the date moves it to that day's
  // first slot rather than leaving a start the new day does not have.
  const selectedStart = slots.includes(start) ? start : (slots[0] ?? "");

  const keys = useRef(new Map<string, string>());
  const creating = useRef(false);

  // The instant the day's window closes: one slot past its last slot. Derived from the slot set
  // rather than from window_end_minute, so the 25 October day ends where its slots end.
  const lastSlot = slots.at(-1);
  const dayEnd =
    lastSlot === undefined
      ? undefined
      : addMinutes(lastSlot, group.slot_minutes);
  const end =
    selectedStart === "" ? undefined : addMinutes(selectedStart, duration);
  const fits =
    end !== undefined &&
    dayEnd !== undefined &&
    Date.parse(end) <= Date.parse(dayEnd);

  const outcome =
    mutation.error === null
      ? undefined
      : describeSchedulingError(mutation.error);
  const sentence =
    outcome?.kind === "not-owner"
      ? NOT_OWNER_MESSAGE
      : outcome?.kind === "confirmed"
        ? CONFIRMED_MESSAGE
        : outcome?.kind === "limit"
          ? limitMessage(config.max_proposals_per_group)
          : outcome?.kind === "outside-window"
            ? OUTSIDE_WINDOW_MESSAGE
            : undefined;

  function submit(): void {
    if (creating.current || end === undefined || selectedStart === "") {
      return;
    }
    if (!fits) {
      setBlocked(PAST_WINDOW_END_MESSAGE);
      return;
    }
    setBlocked(undefined);
    creating.current = true;
    const body = {
      start_at: selectedStart,
      end_at: end,
      origin: "manual" as const,
    };
    const serialized = JSON.stringify(body);
    let key = keys.current.get(serialized);
    if (key === undefined) {
      key = randomUuidV4();
      keys.current.set(serialized, key);
    }
    mutation.mutate(
      { body, idempotencyKey: key },
      {
        onSettled: () => {
          creating.current = false;
        },
      },
    );
  }

  return (
    <section aria-labelledby="manual-heading" className="mt-8">
      <h2 id="manual-heading" className="text-lg font-semibold">
        Add a window by hand
      </h2>
      <Card className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-4">
          <Field label="Date">
            {(control) => (
              <Select
                value={date}
                onChange={(event) => setDate(event.target.value)}
                {...control}
              >
                {dates.map((option) => (
                  <option key={option} value={option}>
                    {formatCalendarDate(option)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Start time">
            {(control) => (
              <Select
                value={selectedStart}
                onChange={(event) => setStart(event.target.value)}
                {...control}
              >
                {slots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slotLabel(slot, group.timezone)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Duration"
            error={blocked === undefined ? undefined : blocked}
          >
            {(control) => (
              <Select
                value={String(duration)}
                onChange={(event) => {
                  setDuration(Number(event.target.value));
                  setBlocked(undefined);
                }}
                {...control}
              >
                {durations.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {durationLabel(minutes)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {end !== undefined && selectedStart !== "" && (
          <p className="text-sm text-neutral-600">
            {formatWindow(selectedStart, end, group.timezone)}
          </p>
        )}

        <Button
          variant="primary"
          disabled={mutation.isPending}
          onClick={submit}
        >
          {mutation.isPending && <Spinner />}
          Add proposal
        </Button>

        {mutation.error !== null &&
          (sentence === undefined ? (
            <ApiErrorNotice
              error={mutation.error}
              retry={submit}
              isRetrying={mutation.isPending}
            />
          ) : (
            <p role="alert" className="text-danger">
              {sentence}
            </p>
          ))}
      </Card>
    </section>
  );
}
