import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import { Textarea } from "../../components/Textarea";
import { TextInput } from "../../components/TextInput";
import { useConfig } from "../../api/config";
import type { ApiError } from "../../api/errors";
import type { components } from "../../api/generated/schema";
import { randomUuidV4 } from "../../lib/uuid";
import { resolveTimezoneChoice } from "../../lib/timezones";
import {
  createGroupMutationOptions,
  toGroupCreate,
  type CreateGroupAttempt,
} from "./createGroup";
import { InviteLinkPanel } from "./InviteLinkPanel";
import {
  WINDOW_END_DEFAULT,
  WINDOW_START_DEFAULT,
  windowOptions,
} from "./windowOptions";
import {
  validateGroupForm,
  type GroupFormErrors,
  type GroupFormField,
  type GroupFormValues,
} from "./validateGroupForm";

type Config = components["schemas"]["Config"];

/** The GroupCreate property names, so a server errors[] entry can be matched against them. */
const GROUP_CREATE_FIELDS: readonly GroupFormField[] = [
  "name",
  "description",
  "timezone",
  "date_start",
  "date_end",
  "window_start_minute",
  "window_end_minute",
];

function isGroupCreateField(field: string): field is GroupFormField {
  return (GROUP_CREATE_FIELDS as readonly string[]).includes(field);
}

interface ServerErrors {
  fields: GroupFormErrors;
  formLevel: string[];
}

const NO_SERVER_ERRORS: ServerErrors = { fields: {}, formLevel: [] };

/**
 * Server errors, by kind and by code only, never by title, detail or status (CLAUDE.md rule 4).
 *
 * The contract types Problem.errors[].field as a bare string and does not say how a field is
 * spelled, so only an exact match against a GroupCreate property name is treated as a field
 * error; anything else (a dotted path, a nested key, an unknown property) is shown at form
 * level rather than silently dropped.
 */
function readServerErrors(
  error: ApiError | null,
  config: Config,
): ServerErrors {
  if (error === null || error.kind !== "problem") {
    return NO_SERVER_ERRORS;
  }

  if (error.code === "range_too_long") {
    return {
      fields: {
        date_end: `The range cannot be longer than ${config.max_range_days} days.`,
      },
      formLevel: [],
    };
  }

  if (error.code === "validation_failed") {
    const fields: GroupFormErrors = {};
    const formLevel: string[] = [];
    for (const entry of error.errors ?? []) {
      if (
        isGroupCreateField(entry.field) &&
        fields[entry.field] === undefined
      ) {
        fields[entry.field] = entry.message;
      } else {
        formLevel.push(entry.message);
      }
    }
    if (Object.keys(fields).length === 0 && formLevel.length === 0) {
      formLevel.push("Please check the form and try again.");
    }
    return { fields, formLevel };
  }

  return NO_SERVER_ERRORS;
}

/** True when the failure has no field-level or date-level rendering of its own. */
function needsNotice(error: ApiError | null): boolean {
  if (error === null) {
    return false;
  }
  return (
    error.kind !== "problem" ||
    (error.code !== "validation_failed" && error.code !== "range_too_long")
  );
}

function initialValues(): GroupFormValues {
  return {
    name: "",
    description: "",
    timezone: resolveTimezoneChoice(
      Intl.supportedValuesOf("timeZone"),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ).selected,
    dateStart: "",
    dateEnd: "",
    windowStartMinute: WINDOW_START_DEFAULT,
    windowEndMinute: WINDOW_END_DEFAULT,
  };
}

export function CreateGroupForm() {
  const configQuery = useConfig();
  const queryClient = useQueryClient();
  const mutation = useMutation(createGroupMutationOptions(queryClient));

  const [values, setValues] = useState<GroupFormValues>(initialValues);
  const [uxErrors, setUxErrors] = useState<GroupFormErrors>({});

  // The key and the body it was minted for. A resubmission of an identical body reuses the key,
  // so a retry after a failure is the same request to the server; any edit mints a new one,
  // because the same key with a different body is 409 idempotency_key_reuse.
  const attemptRef = useRef<{
    serialized: string;
    attempt: CreateGroupAttempt;
  }>(null);
  // Set synchronously, unlike isPending, so a second click in the same tick cannot start a
  // second request before React has re-rendered the disabled button.
  const inFlightRef = useRef(false);

  if (configQuery.data === undefined) {
    return (
      <p
        role="status"
        className="mt-6 flex items-center gap-2 text-neutral-600"
      >
        <Spinner />
        Loading…
      </p>
    );
  }
  const config = configQuery.data;

  if (mutation.isSuccess) {
    return (
      <InviteLinkPanel
        groupName={mutation.data.name}
        inviteUrl={mutation.data.invite_url}
      />
    );
  }

  const timezones = resolveTimezoneChoice(
    Intl.supportedValuesOf("timeZone"),
    values.timezone,
  );
  const { start: startOptions, end: endOptions } = windowOptions(
    config.slot_minutes,
  );

  const error = mutation.error ?? null;
  const serverErrors = readServerErrors(error, config);
  const errors: GroupFormErrors = { ...serverErrors.fields, ...uxErrors };

  function update(patch: Partial<GroupFormValues>): void {
    setValues((current) => ({ ...current, ...patch }));
    // Stale feedback is worse than none: an edit clears both the UX errors and the failure the
    // server reported about the previous body.
    setUxErrors({});
    mutation.reset();
  }

  function send(attempt: CreateGroupAttempt): void {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    mutation.mutate(attempt, {
      onSettled: () => {
        inFlightRef.current = false;
      },
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const found = validateGroupForm(values, config);
    setUxErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    const body = toGroupCreate(values);
    const serialized = JSON.stringify(body);
    const attempt: CreateGroupAttempt =
      attemptRef.current?.serialized === serialized
        ? attemptRef.current.attempt
        : { body, idempotencyKey: randomUuidV4() };
    attemptRef.current = { serialized, attempt };

    send(attempt);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
      <Field label="Group name" error={errors.name}>
        {(control) => (
          <TextInput
            type="text"
            value={values.name}
            onChange={(event) => update({ name: event.target.value })}
            {...control}
          />
        )}
      </Field>

      <Field label="Description (optional)" error={errors.description}>
        {(control) => (
          <Textarea
            value={values.description}
            onChange={(event) => update({ description: event.target.value })}
            {...control}
          />
        )}
      </Field>

      <Field label="Timezone" error={errors.timezone}>
        {(control) => (
          <Select
            value={values.timezone}
            onChange={(event) => update({ timezone: event.target.value })}
            {...control}
          >
            {timezones.options.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Start date" error={errors.date_start}>
          {(control) => (
            <TextInput
              type="date"
              value={values.dateStart}
              onChange={(event) => update({ dateStart: event.target.value })}
              {...control}
            />
          )}
        </Field>

        <Field
          label="End date"
          description="The end date is included in the range."
          error={errors.date_end}
        >
          {(control) => (
            <TextInput
              type="date"
              value={values.dateEnd}
              onChange={(event) => update({ dateEnd: event.target.value })}
              {...control}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Day starts at" error={errors.window_start_minute}>
          {(control) => (
            <Select
              value={values.windowStartMinute}
              onChange={(event) =>
                update({ windowStartMinute: Number(event.target.value) })
              }
              {...control}
            >
              {startOptions.map((option) => (
                <option key={option.minute} value={option.minute}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Day ends at" error={errors.window_end_minute}>
          {(control) => (
            <Select
              value={values.windowEndMinute}
              onChange={(event) =>
                update({ windowEndMinute: Number(event.target.value) })
              }
              {...control}
            >
              {endOptions.map((option) => (
                <option key={option.minute} value={option.minute}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {serverErrors.formLevel.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-danger">
          {serverErrors.formLevel.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <Button type="submit" variant="primary" disabled={mutation.isPending}>
        {mutation.isPending && <Spinner />}
        {mutation.isPending ? "Creating…" : "Create group"}
      </Button>

      {error !== null && needsNotice(error) && (
        <ApiErrorNotice
          error={error}
          retry={() => {
            const previous = attemptRef.current?.attempt;
            if (previous !== undefined) {
              send(previous);
            }
          }}
          isRetrying={mutation.isPending}
        />
      )}
    </form>
  );
}
