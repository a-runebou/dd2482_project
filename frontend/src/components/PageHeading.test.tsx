import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeading } from "./PageHeading";

describe("PageHeading", () => {
  it("renders the title as a level-one heading", () => {
    render(<PageHeading title="Your groups" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your groups" }),
    ).toBeInTheDocument();
  });

  it("renders an optional description below the title", () => {
    render(
      <PageHeading title="Create a group" description="Pick the dates." />,
    );

    expect(screen.getByText("Pick the dates.")).toBeInTheDocument();
  });

  it("renders the heading at a caller's level, for a heading inside a page", () => {
    render(<PageHeading level={2} title="Check your email" />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Check your email" }),
    ).toBeInTheDocument();
  });
});
