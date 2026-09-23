import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiErrorNotice } from "./ApiErrorNotice";
import type { ApiError } from "../api/errors";

function renderNotice(error: ApiError, isRetrying = false) {
  const retry = vi.fn();
  render(
    <ApiErrorNotice error={error} retry={retry} isRetrying={isRetrying} />,
  );
  return retry;
}

describe("ApiErrorNotice", () => {
  it("shows a sign-in message with no button for unauthenticated", () => {
    renderNotice({
      kind: "problem",
      status: 401,
      code: "unauthenticated",
      title: "x",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/sign in/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a sign-in message with no button for token_expired", () => {
    renderNotice({
      kind: "problem",
      status: 401,
      code: "token_expired",
      title: "x",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/sign in/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a temporarily-unavailable message with a retry button for db_circuit_open", () => {
    renderNotice({
      kind: "problem",
      status: 503,
      code: "db_circuit_open",
      title: "x",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /temporarily unavailable/i,
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows a temporarily-unavailable message with a retry button for service_unavailable", () => {
    renderNotice({
      kind: "problem",
      status: 503,
      code: "service_unavailable",
      title: "x",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /temporarily unavailable/i,
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows a cannot-reach-the-server message with a retry button for kind network", () => {
    renderNotice({ kind: "network" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not reach the server/i,
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows a generic message with a retry button for any other problem code", () => {
    renderNotice({
      kind: "problem",
      status: 500,
      code: "not_found",
      title: "x",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /something went wrong/i,
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows a generic message with a retry button for kind unexpected", () => {
    renderNotice({ kind: "unexpected" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /something went wrong/i,
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("disables the retry button while a retry is in flight", () => {
    renderNotice({ kind: "network" }, true);

    expect(screen.getByRole("button", { name: /retrying/i })).toBeDisabled();
  });

  it("calls retry when the button is clicked", () => {
    const retry = renderNotice({ kind: "network" });

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("never displays the problem's title, detail or status", () => {
    renderNotice({
      kind: "problem",
      status: 500,
      code: "not_found",
      title: "SECRET_TITLE",
      detail: "SECRET_DETAIL",
    });

    expect(screen.queryByText(/SECRET_TITLE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SECRET_DETAIL/)).not.toBeInTheDocument();
    expect(screen.queryByText("500")).not.toBeInTheDocument();
  });
});
