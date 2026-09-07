import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  suggestedProposalFixture,
  unknownVoterProposalFixture,
} from "../../mocks/fixtures";
import { UNKNOWN_MEMBER } from "./members";
import { membersFixtureIndex } from "./testHarness";
import { VoteTally } from "./VoteTally";
import { NOBODY_YET } from "./votes";

describe("VoteTally", () => {
  it("names the voters of each value, resolved through the roster", () => {
    render(
      <VoteTally
        votes={suggestedProposalFixture.votes}
        members={membersFixtureIndex}
      />,
    );

    expect(screen.getByText("Yes (2)")).toBeInTheDocument();
    expect(
      screen.getByText("Grace Hopper and Alan Turing"),
    ).toBeInTheDocument();
    expect(screen.getByText("Maybe (1)")).toBeInTheDocument();
    expect(screen.getByText("Edsger Dijkstra")).toBeInTheDocument();
    expect(screen.getByText("No (0)")).toBeInTheDocument();
    expect(screen.getAllByText(NOBODY_YET).length).toBeGreaterThan(0);
  });

  it("lists the members who have not voted at all", () => {
    render(
      <VoteTally
        votes={suggestedProposalFixture.votes}
        members={membersFixtureIndex}
      />,
    );

    // Ada Lovelace is the only member of the roster in none of the three arrays.
    expect(screen.getByText("Not voted yet (1)")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("renders a voter the roster does not know as an unknown member", () => {
    render(
      <VoteTally
        votes={unknownVoterProposalFixture.votes}
        members={membersFixtureIndex}
      />,
    );

    expect(screen.getByText("Yes (1)")).toBeInTheDocument();
    expect(screen.getByText(UNKNOWN_MEMBER)).toBeInTheDocument();
    // The unknown id is never rendered raw.
    expect(screen.queryByText(/b6e1d1d0/)).toBeNull();
  });
});
