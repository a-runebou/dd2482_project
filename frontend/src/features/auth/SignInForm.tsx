import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiErrorNotice } from "../../components/ApiErrorNotice";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Spinner } from "../../components/Spinner";
import { Card } from "../../components/Card";
import { TextInput } from "../../components/TextInput";
import type { ApiError } from "../../api/errors";
import { requestMagicLinkMutationOptions } from "./requestMagicLink";
import { validateEmail } from "./validateEmail";

interface ServerErrors {
  field: string | undefined;
  formLevel: string[];
}

const NO_SERVER_ERRORS: ServerErrors = { field: undefined, formLevel: [] };

/**
 * Server errors, by kind and by code only, never by title, detail or status (CLAUDE.md rule 4).
 * There is only one field, so an errors[] entry whose field is exactly "email" lands there;
 * anything else, including an unrecognised field name, is shown at form level.
 */
function readServerErrors(error: ApiError | null): ServerErrors {
  if (
    error === null ||
    error.kind !== "problem" ||
    error.code !== "validation_failed"
  ) {
    return NO_SERVER_ERRORS;
  }

  let field: string | undefined;
  const formLevel: string[] = [];
  for (const entry of error.errors ?? []) {
    if (entry.field === "email" && field === undefined) {
      field = entry.message;
    } else {
      formLevel.push(entry.message);
    }
  }
  if (field === undefined && formLevel.length === 0) {
    formLevel.push("Please check your address and try again.");
  }
  return { field, formLevel };
}

/** The wait in whole minutes, rounded up; the general message when Retry-After was not readable. */
function rateLimitedMessage(retryAfterSeconds: number | undefined): string {
  if (retryAfterSeconds === undefined) {
    return "Too many attempts. Please try again later.";
  }
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/** True when the failure has no field-level, form-level or rate-limit rendering of its own. */
function needsNotice(error: ApiError | null): boolean {
  if (error === null) {
    return false;
  }
  return (
    error.kind !== "problem" ||
    (error.code !== "validation_failed" && error.code !== "rate_limited")
  );
}

/**
 * The confirmation deliberately says nothing about whether the address has an account, matching
 * the contract's reason for always answering 202 (CLAUDE.md rule 4, the endpoint's description).
 */
function Confirmation({
  onUseDifferentAddress,
}: {
  onUseDifferentAddress: () => void;
}) {
  return (
    <div role="status" className="mt-6">
      <Card>
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="mt-2 text-neutral-600">
          If that address has an account, a sign-in link is on its way.
        </p>
        <p className="mt-2 text-neutral-600">
          The link expires in fifteen minutes and can be used once.
        </p>
        <Button className="mt-4" onClick={onUseDifferentAddress}>
          Use a different address
        </Button>
      </Card>
    </div>
  );
}

export function SignInForm({ redirectPath }: { redirectPath?: string }) {
  const mutation = useMutation(
    requestMagicLinkMutationOptions(
      redirectPath ?? globalThis.location.pathname,
    ),
  );

  const [email, setEmail] = useState("");
  const [uxError, setUxError] = useState<string | undefined>(undefined);

  // The last address a request was sent for, so ApiErrorNotice's retry resubmits the same
  // address rather than whatever is currently typed in the field.
  const lastSentRef = useRef("");
  // Set synchronously, unlike isPending, so a second click in the same tick cannot start a
  // second request before React has re-rendered the disabled button.
  const inFlightRef = useRef(false);

  if (mutation.isSuccess) {
    return (
      <Confirmation
        onUseDifferentAddress={() => {
          mutation.reset();
          setEmail("");
          setUxError(undefined);
        }}
      />
    );
  }

  const error = mutation.error ?? null;
  const serverErrors = readServerErrors(error);
  const fieldError = uxError ?? serverErrors.field;

  function update(value: string): void {
    setEmail(value);
    setUxError(undefined);
    mutation.reset();
  }

  function send(value: string): void {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    lastSentRef.current = value;
    mutation.mutate(value, {
      onSettled: () => {
        inFlightRef.current = false;
      },
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const found = validateEmail(email);
    setUxError(found);
    if (found !== undefined) {
      return;
    }

    send(email);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6">
      <Field label="Email address" error={fieldError}>
        {(control) => (
          <TextInput
            type="email"
            value={email}
            onChange={(event) => update(event.target.value)}
            {...control}
          />
        )}
      </Field>

      {serverErrors.formLevel.length > 0 && (
        <ul role="alert" className="mt-4 space-y-1 text-sm text-danger">
          {serverErrors.formLevel.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {error !== null &&
        error.kind === "problem" &&
        error.code === "rate_limited" && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {rateLimitedMessage(error.retryAfterSeconds)}
          </p>
        )}

      <Button
        type="submit"
        variant="primary"
        className="mt-6"
        disabled={mutation.isPending}
      >
        {mutation.isPending && <Spinner />}
        {mutation.isPending ? "Sending…" : "Send sign-in link"}
      </Button>

      {error !== null && needsNotice(error) && (
        <div className="mt-6">
          <ApiErrorNotice
            error={error}
            retry={() => send(lastSentRef.current)}
            isRetrying={mutation.isPending}
          />
        </div>
      )}
    </form>
  );
}
