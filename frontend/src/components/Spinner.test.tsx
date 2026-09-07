import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("is hidden from assistive technology, because the text beside it carries the meaning", () => {
    render(
      <p role="status">
        <Spinner />
        Loading…
      </p>,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("appends a caller's className", () => {
    render(
      <p role="status">
        <Spinner className="me-2" />
        Loading…
      </p>,
    );

    const spinner = screen.getByRole("status").querySelector("span");
    expect(spinner?.className).toContain("me-2");
  });
});
