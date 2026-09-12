import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
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

  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const descriptionId = `${fieldId}-description`;
  const timezoneId = `${fieldId}-timezone`;
  const dateStartId = `${fieldId}-date-start`;
  const dateEndId = `${fieldId}-date-end`;
  const windowStartId = `${fieldId}-window-start`;
  const windowEndId = `${fieldId}-window-end`;

  if (configQuery.data === undefined) {
    return (
      <p role="status" className="mt-4">
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

  function fieldProps(field: GroupFormField, id: string) {
    const message = errors[field];
    return {
      "aria-invalid": message === undefined ? undefined : true,
      "aria-describedby": message === undefined ? undefined : `${id}-error`,
    };
  }

  function fieldError(field: GroupFormField, id: string) {
    const message = errors[field];
    return message === undefined ? null : (
      <p id={`${id}-error`} className="mt-1 text-sm">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4">
      <div className="mt-4">
        <label htmlFor={nameId} className="block font-medium">
          Group name
        </label>
        <input
          id={nameId}
          type="text"
          value={values.name}
          onChange={(event) => update({ name: event.target.value })}
          className="mt-1 w-full rounded border px-3 py-2"
          {...fieldProps("name", nameId)}
        />
        {fieldError("name", nameId)}
      </div>

      <div className="mt-4">
        <label htmlFor={descriptionId} className="block font-medium">
          Description (optional)
        </label>
        <textarea
          id={descriptionId}
          value={values.description}
          onChange={(event) => update({ description: event.target.value })}
          className="mt-1 w-full rounded border px-3 py-2"
          {...fieldProps("description", descriptionId)}
        />
        {fieldError("description", descriptionId)}
      </div>

      <div className="mt-4">
        <label htmlFor={timezoneId} className="block font-medium">
          Timezone
        </label>
        <select
          id={timezoneId}
          value={values.timezone}
          onChange={(event) => update({ timezone: event.target.value })}
          className="mt-1 w-full rounded border px-3 py-2"
          {...fieldProps("timezone", timezoneId)}
        >
          {timezones.options.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        {fieldError("timezone", timezoneId)}
      </div>

      <div className="mt-4">
        <label htmlFor={dateStartId} className="block font-medium">
          Start date
        </label>
        <input
          id={dateStartId}
          type="date"
          value={values.dateStart}
          onChange={(event) => update({ dateStart: event.target.value })}
          className="mt-1 rounded border px-3 py-2"
          {...fieldProps("date_start", dateStartId)}
        />
        {fieldError("date_start", dateStartId)}
      </div>

      <div className="mt-4">
        <label htmlFor={dateEndId} className="block font-medium">
          End date
        </label>
        <input
          id={dateEndId}
          type="date"
          value={values.dateEnd}
          onChange={(event) => update({ dateEnd: event.target.value })}
          className="mt-1 rounded border px-3 py-2"
          {...fieldProps("date_end", dateEndId)}
        />
        <p className="mt-1 text-sm">The end date is included in the range.</p>
        {fieldError("date_end", dateEndId)}
      </div>

      <div className="mt-4">
        <label htmlFor={windowStartId} className="block font-medium">
          Day starts at
        </label>
        <select
          id={windowStartId}
          value={values.windowStartMinute}
          onChange={(event) =>
            update({ windowStartMinute: Number(event.target.value) })
          }
          className="mt-1 rounded border px-3 py-2"
          {...fieldProps("window_start_minute", windowStartId)}
        >
          {startOptions.map((option) => (
            <option key={option.minute} value={option.minute}>
              {option.label}
            </option>
          ))}
        </select>
        {fieldError("window_start_minute", windowStartId)}
      </div>

      <div className="mt-4">
        <label htmlFor={windowEndId} className="block font-medium">
          Day ends at
        </label>
        <select
          id={windowEndId}
          value={values.windowEndMinute}
          onChange={(event) =>
            update({ windowEndMinute: Number(event.target.value) })
          }
          className="mt-1 rounded border px-3 py-2"
          {...fieldProps("window_end_minute", windowEndId)}
        >
          {endOptions.map((option) => (
            <option key={option.minute} value={option.minute}>
              {option.label}
            </option>
          ))}
        </select>
        {fieldError("window_end_minute", windowEndId)}
      </div>

      {serverErrors.formLevel.length > 0 && (
        <ul role="alert" className="mt-4">
          {serverErrors.formLevel.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        className="mt-6 rounded border px-4 py-2 disabled:opacity-50"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Creating…" : "Create group"}
      </button>

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
