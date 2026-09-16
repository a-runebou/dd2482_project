import type { ApiError } from "../api/errors";
import { Button } from "./Button";
import { Spinner } from "./Spinner";

interface ApiErrorNoticeProps {
  error: ApiError;
  retry: () => void;
  isRetrying: boolean;
}

interface Presentation {
  message: string;
  showRetry: boolean;
}

function present(error: ApiError): Presentation {
  if (
    error.kind === "problem" &&
    (error.code === "unauthenticated" || error.code === "token_expired")
  ) {
    return { message: "Please sign in to see this.", showRetry: false };
  }
  if (
    error.kind === "problem" &&
    (error.code === "db_circuit_open" || error.code === "service_unavailable")
  ) {
    return {
      message:
        "Schedular is temporarily unavailable. Please try again shortly.",
      showRetry: true,
    };
  }
  if (error.kind === "network") {
    return {
      message:
        "We could not reach the server. Check your connection and try again.",
      showRetry: true,
    };
  }
  return {
    message: "Something went wrong. Please try again.",
    showRetry: true,
  };
}

/** Shared presentational rendering of an ApiError, by kind and, for kind problem, by code only. */
export function ApiErrorNotice({
  error,
  retry,
  isRetrying,
}: ApiErrorNoticeProps) {
  const { message, showRetry } = present(error);

  return (
    <div
      role="alert"
      className="rounded-md border border-danger bg-white p-4 text-danger"
    >
      <p>{message}</p>
      {showRetry && (
        <Button className="mt-3" disabled={isRetrying} onClick={retry}>
          {isRetrying && <Spinner />}
          {isRetrying ? "Retrying…" : "Retry"}
        </Button>
      )}
    </div>
  );
}
