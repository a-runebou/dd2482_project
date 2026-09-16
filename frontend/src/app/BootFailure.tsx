import { useEffect, useRef } from "react";
import type { ApiError } from "../api/errors";
import { Button } from "../components/Button";
import { PageContainer } from "../components/PageContainer";
import { PageHeading } from "../components/PageHeading";
import { Spinner } from "../components/Spinner";

interface BootFailureProps {
  error: ApiError;
  /** Changes whenever a new error is recorded, so the auto-retry effect re-arms per failure. */
  errorUpdatedAt: number;
  /** True while a (re)fetch is in flight; keeps the failure state visible and the button disabled. */
  isFetching: boolean;
  /** Re-runs the same config query the boot gate uses; never a second query. */
  refetch: () => void;
}

interface Presentation {
  heading: string;
  message: string;
  /** Seconds until an automatic retry, when the server gave a readable Retry-After. */
  autoRetrySeconds?: number;
}

function present(error: ApiError): Presentation {
  if (
    error.kind === "problem" &&
    (error.code === "db_circuit_open" || error.code === "service_unavailable")
  ) {
    return {
      heading: "Temporarily unavailable",
      message:
        "Schedular is temporarily unavailable. Please try again shortly.",
      autoRetrySeconds: error.retryAfterSeconds,
    };
  }
  if (error.kind === "network") {
    return {
      heading: "Cannot reach the server",
      message:
        "We could not reach the server. Check your connection and try again.",
    };
  }
  return {
    heading: "Something went wrong",
    message: "Something went wrong while starting Schedular. Please try again.",
  };
}

export function BootFailure({
  error,
  errorUpdatedAt,
  isFetching,
  refetch,
}: BootFailureProps) {
  const { heading, message, autoRetrySeconds } = present(error);

  // Read the latest refetch and in-flight flag inside the timer without re-arming the effect
  // on every render; the effect re-arms only when a new failure is recorded (errorUpdatedAt).
  // Refs are synced in an effect, not during render, so the timer sees the latest values.
  const refetchRef = useRef(refetch);
  const isFetchingRef = useRef(isFetching);
  useEffect(() => {
    refetchRef.current = refetch;
    isFetchingRef.current = isFetching;
  });

  useEffect(() => {
    if (autoRetrySeconds === undefined) {
      return;
    }
    const timer = setTimeout(() => {
      // Skip if a fetch is already in flight, so the timer cannot stack a second request.
      if (!isFetchingRef.current) {
        refetchRef.current();
      }
    }, autoRetrySeconds * 1000);
    // Clearing on cleanup means StrictMode's double-invoke leaves exactly one timer armed.
    return () => clearTimeout(timer);
  }, [errorUpdatedAt, autoRetrySeconds]);

  return (
    <PageContainer role="alert" className="text-center">
      <PageHeading title={heading} />
      <p className="mt-4 text-neutral-600">{message}</p>
      {autoRetrySeconds !== undefined && (
        <p className="mt-2 text-neutral-600">
          Retrying automatically in {autoRetrySeconds}{" "}
          {autoRetrySeconds === 1 ? "second" : "seconds"}…
        </p>
      )}
      <Button
        variant="primary"
        className="mt-6"
        disabled={isFetching}
        onClick={() => refetch()}
      >
        {isFetching && <Spinner />}
        {isFetching ? "Retrying…" : "Retry"}
      </Button>
    </PageContainer>
  );
}
