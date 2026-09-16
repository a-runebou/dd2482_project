import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageContainer } from "./PageContainer";

describe("PageContainer", () => {
  it("renders a main landmark around its children", () => {
    render(
      <PageContainer>
        <p>Body</p>
      </PageContainer>,
    );

    expect(screen.getByRole("main")).toHaveTextContent("Body");
  });

  it("forwards a role, so a page can stay a status or an alert region", () => {
    render(
      <PageContainer role="status">
        <p>Loading…</p>
      </PageContainer>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("appends a caller's className", () => {
    render(<PageContainer className="text-center">Body</PageContainer>);

    const main = screen.getByRole("main");
    expect(main.className).toContain("text-center");
    expect(main.className.split(" ").length).toBeGreaterThan(1);
  });
});
