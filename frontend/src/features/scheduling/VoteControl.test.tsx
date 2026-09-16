import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useQuery } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  groupConfirmedProblem,
  manualProposalFixture,
  notFoundProblem,
  proposalsGroupFixture,
  suggestedProposalFixture,
  unknownVoterProposalFixture,
} from "../../mocks/fixtures";
import {
  resetMockAvailability,
  resetMockGroups,
  resetMockProposals,
} from "../../mocks/handlers";
import { ProposalsList } from "./ProposalsList";
import { proposalsQueryOptions } from "./schedulingQueries";
import { membersFixtureIndex, renderWithProviders } from "./testHarness";

const SLUG = proposalsGroupFixture.slug;
const TIMEZONE = proposalsGroupFixture.timezone;

const path = (suffix: string) => new URL(mockUrl(suffix)).pathname;
const PROPOSALS_PATH = path(`/groups/${SLUG}/proposals`);
const MANUAL_VOTE_PATH = path(
  `/groups/${SLUG}/proposals/${manualProposalFixture.id}/vote/me`,
);
const SUGGESTED_VOTE_PATH = path(
  `/groups/${SLUG}/proposals/${suggestedProposalFixture.id}/vote/me`,
);

const SUGGESTED_WINDOW = "Sun 25 Oct 2026, 01:00 to 02:30";
const MANUAL_WINDOW = "Mon 26 Oct 2026, 01:00 to 02:00";

let counts: Record<string, number>;
let bodies: unknown[];

function countRequest({ request }: { request: Request }) {
  const key = `${request.method} ${new URL(request.url).pathname}`;
  counts[key] = (counts[key] ?? 0) + 1;
  // The body is read from a clone, so the stateful default handler still gets to consume the
  // original: the assertions below want both what was sent and what the server then served.
  if (request.method === "PUT" && key.includes("/vote/me")) {
    void request
      .clone()
      .json()
      .then((body) => bodies.push(body));
  }
}

function countOf(method: string, pathname: string): number {
  return counts[`${method} ${pathname}`] ?? 0;
}

beforeEach(() => {
  counts = {};
  bodies = [];
  server.events.on("request:start", countRequest);
  resetMockGroups();
  resetMockAvailability();
  resetMockProposals();
});

afterEach(() => {
  server.events.removeListener("request:start", countRequest);
});

/** The board owns the read in the application, so the harness owns it here. */
function List({ canVote = true }: { canVote?: boolean }) {
  const query = useQuery(proposalsQueryOptions(SLUG));
  return (
    <ProposalsList
      slug={SLUG}
      timezone={TIMEZONE}
      query={query}
      members={membersFixtureIndex}
      canManage={false}
      canVote={canVote}
      canConfirm={false}
      confirmedProposalId={null}
    />
  );
}

function row(windowLabel: string): HTMLElement {
  const heading = screen.getByText(windowLabel);
  const item = heading.closest("li");
  if (item === null) {
    throw new Error(`No row for ${windowLabel}`);
  }
  return item;
}

describe("voting on a proposal", () => {
  it("sends the chosen value and moves the tally", async () => {
    renderWithProviders(<List />);

    await screen.findByText(SUGGESTED_WINDOW);
    fireEvent.click(
      within(row(SUGGESTED_WINDOW)).getByRole("radio", { name: "Yes" }),
    );

    await waitFor(() =>
      expect(
        within(row(SUGGESTED_WINDOW)).getByText("Yes (3)"),
      ).toBeInTheDocument(),
    );
    await waitFor(() => expect(bodies).toEqual([{ value: "yes" }]));
    expect(countOf("PUT", SUGGESTED_VOTE_PATH)).toBe(1);
    // The first read, and the one the invalidation triggered.
    expect(countOf("GET", PROPOSALS_PATH)).toBe(2);
  });

  it("replaces a vote rather than adding a second one", async () => {
    renderWithProviders(<List />);

    await screen.findByText(MANUAL_WINDOW);
    expect(within(row(MANUAL_WINDOW)).getByText("No (1)")).toBeInTheDocument();

    fireEvent.click(
      within(row(MANUAL_WINDOW)).getByRole("radio", { name: "Maybe" }),
    );

    await waitFor(() =>
      expect(
        within(row(MANUAL_WINDOW)).getByText("Maybe (1)"),
      ).toBeInTheDocument(),
    );
    const rendered = row(MANUAL_WINDOW);
    expect(within(rendered).getByText("No (0)")).toBeInTheDocument();
    expect(
      within(rendered).getByText("0 yes, 1 maybe, 0 no"),
    ).toBeInTheDocument();
    expect(countOf("PUT", MANUAL_VOTE_PATH)).toBe(1);
  });

  it("withdraws the caller's vote and removes them from the tally", async () => {
    renderWithProviders(<List />);

    await screen.findByText(MANUAL_WINDOW);
    fireEvent.click(
      within(row(MANUAL_WINDOW)).getByRole("button", {
        name: /withdraw my vote/i,
      }),
    );

    await waitFor(() =>
      expect(
        within(row(MANUAL_WINDOW)).getByText("No (0)"),
      ).toBeInTheDocument(),
    );
    expect(countOf("DELETE", MANUAL_VOTE_PATH)).toBe(1);
    expect(countOf("GET", PROPOSALS_PATH)).toBe(2);
    // Ada Lovelace has gone back to having no vote at all.
    expect(
      within(row(MANUAL_WINDOW)).getByText("Not voted yet (4)"),
    ).toBeInTheDocument();
  });

  it("conveys the caller's current choice through the control's own state", async () => {
    renderWithProviders(<List />);

    await screen.findByText(MANUAL_WINDOW);
    const scope = within(row(MANUAL_WINDOW));
    expect(scope.getByRole("radio", { name: "No" })).toBeChecked();
    expect(scope.getByRole("radio", { name: "Yes" })).not.toBeChecked();
    expect(scope.getByRole("radio", { name: "Maybe" })).not.toBeChecked();

    // A proposal the caller has not voted on has nothing selected and nothing to withdraw.
    const untouched = within(row(SUGGESTED_WINDOW));
    expect(untouched.getByRole("radio", { name: "Yes" })).not.toBeChecked();
    expect(
      untouched.getByRole("button", { name: /withdraw my vote/i }),
    ).toBeDisabled();
  });

  it("refetches rather than reporting an error when the proposal has gone", async () => {
    server.use(
      http.put(mockUrl("/groups/:slug/proposals/:proposalId/vote/me"), () =>
        HttpResponse.json(notFoundProblem, {
          status: 404,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );
    renderWithProviders(<List />);

    await screen.findByText(SUGGESTED_WINDOW);
    fireEvent.click(
      within(row(SUGGESTED_WINDOW)).getByRole("radio", { name: "Yes" }),
    );

    await waitFor(() => expect(countOf("GET", PROPOSALS_PATH)).toBe(2));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when the server refuses the vote because the group is confirmed", async () => {
    // The freeze in the interface is a courtesy; the backend is authoritative, so a 409 that
    // arrives anyway has to be legible rather than a generic failure.
    server.use(
      http.put(mockUrl("/groups/:slug/proposals/:proposalId/vote/me"), () =>
        HttpResponse.json(groupConfirmedProblem, {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );
    renderWithProviders(<List />);

    await screen.findByText(SUGGESTED_WINDOW);
    fireEvent.click(
      within(row(SUGGESTED_WINDOW)).getByRole("radio", { name: "Yes" }),
    );

    expect(
      await screen.findByText(/confirmed, so votes can no longer be changed/i),
    ).toBeInTheDocument();
    expect(countOf("PUT", SUGGESTED_VOTE_PATH)).toBe(1);
    // Nothing was refetched: the list is not what is wrong.
    expect(countOf("GET", PROPOSALS_PATH)).toBe(1);
  });

  it("offers no vote control at all when voting is unavailable", async () => {
    renderWithProviders(<List canVote={false} />);

    await screen.findByText(SUGGESTED_WINDOW);
    for (const name of [/^yes$/i, /^maybe$/i, /^no$/i]) {
      expect(screen.queryByRole("radio", { name })).toBeNull();
    }
    expect(
      screen.queryByRole("button", { name: /withdraw my vote/i }),
    ).toBeNull();
    expect(countOf("GET", PROPOSALS_PATH)).toBe(1);
  });

  it("resolves an unknown voter to an unknown member rather than a raw id", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/proposals"), () =>
        HttpResponse.json(
          { data: [unknownVoterProposalFixture], next_cursor: null },
          { headers: { ETag: 'W/"unknown-voter"' } },
        ),
      ),
    );
    renderWithProviders(<List />);

    expect(await screen.findByText("an unknown member")).toBeInTheDocument();
    expect(countOf("GET", PROPOSALS_PATH)).toBe(1);
  });
});
