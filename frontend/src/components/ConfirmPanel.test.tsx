import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmPanel } from "./ConfirmPanel";

describe("ConfirmPanel", () => {
  it("renders the heading, the description and both buttons", () => {
    render(
      <ConfirmPanel
        heading="Remove Alan Turing?"
        description="They lose their availability in this group."
        confirmLabel="Remove"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Remove Alan Turing?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("They lose their availability in this group."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("calls onConfirm and onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmPanel
        heading="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("says in words that a destructive action cannot be undone", () => {
    render(
      <ConfirmPanel
        heading="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it("does not claim irreversibility when the action is not destructive", () => {
    render(
      <ConfirmPanel
        heading="Rotate?"
        description="A new link is issued."
        confirmLabel="Rotate"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();
  });

  it("marks a destructive confirm button with the danger treatment", () => {
    render(
      <ConfirmPanel
        heading="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Delete" }).className).toContain(
      "danger",
    );
  });

  it("disables confirm, but never cancel, while the caller says it is not ready", () => {
    render(
      <ConfirmPanel
        heading="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        confirmDisabled
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("renders extra content between the description and the buttons", () => {
    render(
      <ConfirmPanel
        heading="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        <p>Type the name.</p>
      </ConfirmPanel>,
    );

    expect(screen.getByText("Type the name.")).toBeInTheDocument();
  });

  it("shows a pending label and disables confirm while the action runs", () => {
    render(
      <ConfirmPanel
        heading="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        isPending
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /Deleting/ })).toBeDisabled();
  });
});
