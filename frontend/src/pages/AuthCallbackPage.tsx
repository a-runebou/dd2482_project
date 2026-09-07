import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { ApiError } from "../api/errors";
import { ApiErrorNotice } from "../components/ApiErrorNotice";
import { PageContainer } from "../components/PageContainer";
import { PageHeading } from "../components/PageHeading";
import { Spinner } from "../components/Spinner";
import { LINK } from "../components/cx";
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
      <PageContainer>
        <PageHeading title="Sign in" />
        <p className="mt-4 text-neutral-600">
          This sign-in link is invalid, has already been used, or has expired.
        </p>
        <Link className={`mt-6 inline-block ${LINK}`} to="/sign-in">
          Request a new sign-in link
        </Link>
      </PageContainer>
    );
  }

  if (exchange.isError) {
    return (
      <PageContainer>
        <PageHeading title="Sign in" />
        <div className="mt-6">
          <ApiErrorNotice
            error={exchange.error}
            retry={() => {
              void exchange.refetch();
            }}
            isRetrying={exchange.isFetching}
          />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer role="status" className="text-center">
      <p className="flex items-center justify-center gap-2 text-neutral-600">
        <Spinner />
        Signing you in…
      </p>
    </PageContainer>
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
