import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card";

describe("Card", () => {
  it("renders its children", () => {
    render(
      <Card>
        <p>Team offsite</p>
      </Card>,
    );

    expect(screen.getByText("Team offsite")).toBeInTheDocument();
  });

  it("forwards its props to the underlying element", () => {
    render(<Card data-testid="card">Body</Card>);

    expect(screen.getByTestId("card")).toHaveTextContent("Body");
  });

  it("appends a caller's className", () => {
    render(
      <Card data-testid="card" className="mt-4">
        Body
      </Card>,
    );

    const card = screen.getByTestId("card");
    expect(card.className).toContain("mt-4");
    expect(card.className.split(" ").length).toBeGreaterThan(1);
  });
});
