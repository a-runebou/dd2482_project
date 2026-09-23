import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its children inside a button", () => {
    render(<Button>Send sign-in link</Button>);

    expect(
      screen.getByRole("button", { name: "Send sign-in link" }),
    ).toBeInTheDocument();
  });

  it("defaults to type button, so it cannot submit a form by accident", () => {
    render(<Button>Copy</Button>);

    expect(screen.getByRole("button", { name: "Copy" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it.each(["primary", "secondary", "quiet"] as const)(
    "renders the %s variant",
    (variant) => {
      render(<Button variant={variant}>Retry</Button>);

      expect(screen.getByRole("button", { name: "Retry" })).toHaveAttribute(
        "data-variant",
        variant,
      );
    },
  );

  it("defaults to the secondary variant", () => {
    render(<Button>Retry</Button>);

    expect(screen.getByRole("button", { name: "Retry" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("does not fire onClick while disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Retrying…
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Retrying…" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards the remaining props to the underlying button", () => {
    const onClick = vi.fn();
    render(
      <Button type="submit" onClick={onClick} aria-describedby="hint">
        Create group
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Create group" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("aria-describedby", "hint");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("appends a caller's className rather than replacing its own", () => {
    render(<Button className="mt-6">Retry</Button>);

    const button = screen.getByRole("button", { name: "Retry" });
    expect(button.className).toContain("mt-6");
    expect(button.className.split(" ").length).toBeGreaterThan(1);
  });
});
