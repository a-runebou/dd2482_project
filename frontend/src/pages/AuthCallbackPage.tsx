import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { ApiError } from "../api/errors";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { sessionExchangeQueryOptions } from "../features/auth/createSession";
import { safeRedirectPath } from "../features/auth/redirectPath";

/**
 * Where the magic link lands (ARCHITECTURE 6.1). It spends the token in the query string for a
 * session and then leaves, replacing the history entry so that going back cannot resubmit a
 * token that is already used. The token is never rendered, logged or stored: it is read from
 * the URL, sent once, and forgotten.
 */
export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const destination = safeRedirectPath(searchParams.get("redirect"));

  const exchange = useQuery({
    ...sessionExchangeQueryOptions(token ?? ""),
    enabled: token !== null,
  });

  const succeeded = exchange.isSuccess;
  useEffect(() => {
    if (succeeded) {
      void navigate(destination, { replace: true });
    }
  }, [succeeded, destination, navigate]);

  if (token === null || isUnusableLink(exchange.error)) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-3xl font-bold">Sign in</h1>
        <p className="mt-4">
          This sign-in link is invalid, has already been used, or has expired.
        </p>
        <Link className="mt-4 inline-block underline" to="/sign-in">
          Request a new sign-in link
        </Link>
      </main>
    );
  }

  if (exchange.isError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-3xl font-bold">Sign in</h1>
        <ApiErrorNotice
          error={exchange.error}
          retry={() => {
            void exchange.refetch();
          }}
          isRetrying={exchange.isFetching}
        />
      </main>
    );
  }

  return (
    <main role="status" className="mx-auto max-w-md p-6 text-center">
      <p>Signing you in…</p>
    </main>
  );
}

/**
 * A link the user cannot do anything with, as opposed to a failure they could retry. The
 * backend answers a spent, forged or malformed token with 401 unauthenticated or 400
 * validation_failed; the wording deliberately does not say which, because a link that was
 * already used and one that never existed must not be distinguishable.
 */
function isUnusableLink(error: ApiError | null): boolean {
  return (
    error !== null &&
    error.kind === "problem" &&
    (error.code === "unauthenticated" || error.code === "validation_failed")
  );
}
