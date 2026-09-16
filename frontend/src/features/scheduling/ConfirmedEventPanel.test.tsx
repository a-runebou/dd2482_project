import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import {
  confirmedMemberGroupFixture,
  proposalsConfirmedGroupFixture,
  proposalsGroupFixture,
} from "../../mocks/fixtures";
import { ConfirmedEventPanel } from "./ConfirmedEventPanel";
import { renderWithProviders } from "./testHarness";

const WINDOW = "Sun 25 Oct 2026, 01:00 to 02:30";

describe("ConfirmedEventPanel", () => {
  it("shows the confirmed window in the group's timezone with the download", () => {
    renderWithProviders(
      <ConfirmedEventPanel group={confirmedMemberGroupFixture} />,
    );

    expect(
      screen.getByRole("heading", { name: /confirmed meeting/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(WINDOW)).toBeInTheDocument();
    expect(screen.getByText("1 hour 30 minutes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /calendar file/i }),
    ).toBeInTheDocument();
  });

  it("shows the subscribable feed link when the group carries one", () => {
    renderWithProviders(
      <ConfirmedEventPanel group={proposalsConfirmedGroupFixture} />,
    );

    expect(screen.getByLabelText(/calendar feed link/i)).toHaveValue(
      proposalsConfirmedGroupFixture.feed_url,
    );
  });

  it("shows neither the feed link nor anything else for a group that is not confirmed", () => {
    renderWithProviders(<ConfirmedEventPanel group={proposalsGroupFixture} />);

    expect(
      screen.queryByRole("heading", { name: /confirmed meeting/i }),
    ).toBeNull();
    expect(screen.queryByLabelText(/calendar feed link/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /calendar file/i })).toBeNull();
  });

  it("omits the feed link when the group has none", () => {
    renderWithProviders(
      <ConfirmedEventPanel
        group={{ ...confirmedMemberGroupFixture, feed_url: null }}
      />,
    );

    expect(screen.getByText(WINDOW)).toBeInTheDocument();
    expect(screen.queryByLabelText(/calendar feed link/i)).toBeNull();
  });
});
