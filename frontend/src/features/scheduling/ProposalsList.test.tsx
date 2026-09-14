import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  manualProposalFixture,
  proposalsBySlugFixture,
  proposalsGroupFixture,
  suggestedProposalFixture,
} from "../../mocks/fixtures";
import {
  resetMockAvailability,
  resetMockGroups,
  resetMockProposals,
} from "../../mocks/handlers";
import { useQuery } from "@tanstack/react-query";
import { ProposalsList } from "./ProposalsList";
import { proposalsQueryOptions } from "./schedulingQueries";
import { pathCounter, renderWithProviders } from "./testHarness";

const SLUG = proposalsGroupFixture.slug;
const TIMEZONE = proposalsGroupFixture.timezone;
const PROPOSALS = mockUrl(`/groups/${SLUG}/proposals`);

const SUGGESTED_WINDOW = "Sun 25 Oct 2026, 01:00 to 02:30";
const MANUAL_WINDOW = "Mon 26 Oct 2026, 01:00 to 02:00";

const proposals = pathCounter(PROPOSALS);

beforeEach(() => {
  proposals.reset();
  server.events.on("request:start", proposals.listener);
  resetMockGroups();
  resetMockAvailability();
  resetMockProposals();
});

afterEach(() => {
  server.events.removeListener("request:start", proposals.listener);
});

/** The board owns the read in the application, so the harness owns it here. */
function List({ canManage }: { canManage: boolean }) {
  const query = useQuery(proposalsQueryOptions(SLUG));
  return (
    <ProposalsList
      slug={SLUG}
      timezone={TIMEZONE}
      query={query}
      canManage={canManage}
    />
  );
}

function list(canManage = false) {
  return <List canManage={canManage} />;
}

describe("ProposalsList", () => {
  it("renders both origins with their windows, durations and vote tallies", async () => {
    renderWithProviders(list());

    expect(await screen.findByText(SUGGESTED_WINDOW)).toBeInTheDocument();
    expect(screen.getByText(MANUAL_WINDOW)).toBeInTheDocument();
    expect(screen.getByText("From a suggestion")).toBeInTheDocument();
    expect(screen.getByText("Entered manually")).toBeInTheDocument();
    expect(screen.getByText("1 hour 30 minutes")).toBeInTheDocument();
    expect(screen.getByText("1 hour")).toBeInTheDocument();
    expect(screen.getByText("2 yes, 1 maybe, 0 no")).toBeInTheDocument();
    expect(screen.getByText("0 yes, 0 maybe, 1 no")).toBeInTheDocument();
    expect(proposals.count()).toBe(1);
  });

  it("offers no vote control, because voting is not part of this screen", async () => {
    renderWithProviders(list(true));

    await screen.findByText(SUGGESTED_WINDOW);
    for (const label of [/^yes$/i, /^maybe$/i, /^no$/i]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("sorts by start time rather than by the order the server sent", async () => {
    // The fixture stores the manual proposal, which starts later, first, so a list that
    // merely echoed the server's order would fail this.
    expect(proposalsBySlugFixture[SLUG]?.map((p) => p.id)).toEqual([
      manualProposalFixture.id,
      suggestedProposalFixture.id,
    ]);

    renderWithProviders(list());

    await screen.findByText(SUGGESTED_WINDOW);
    const rendered = screen
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "");
    expect(rendered[0]).toContain(SUGGESTED_WINDOW);
    expect(rendered[1]).toContain(MANUAL_WINDOW);
  });

  it("explains an empty list", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/proposals"), () =>
        HttpResponse.json({ data: [], next_cursor: null }),
      ),
    );

    renderWithProviders(list());

    expect(await screen.findByText(/no proposals yet/i)).toBeInTheDocument();
  });

  it("offers no deletion to someone who is not the owner", async () => {
    renderWithProviders(list(false));

    await screen.findByText(SUGGESTED_WINDOW);
    expect(
      screen.queryByRole("button", { name: /delete proposal/i }),
    ).toBeNull();
  });

  it("names the window in the confirmation and removes the proposal once", async () => {
    // The stateful handler does the deleting, so the refetch that follows is what proves the
    // proposal is gone rather than merely hidden.
    const deletes = pathCounter(
      mockUrl(`/groups/${SLUG}/proposals/${suggestedProposalFixture.id}`),
    );
    server.events.on("request:start", deletes.listener);
    try {
      renderWithProviders(list(true));

      await screen.findByText(SUGGESTED_WINDOW);
      fireEvent.click(
        screen.getAllByRole("button", { name: "Delete proposal" })[0]!,
      );

      expect(
        screen.getByRole("heading", {
          name: `Delete the proposal for ${SUGGESTED_WINDOW}?`,
        }),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Delete permanently" }),
      );

      await waitFor(() =>
        expect(screen.queryByText(SUGGESTED_WINDOW)).toBeNull(),
      );
      expect(deletes.count()).toBe(1);
      expect(screen.getByText(MANUAL_WINDOW)).toBeInTheDocument();
    } finally {
      server.events.removeListener("request:start", deletes.listener);
    }
  });

  it("treats a not_found deletion as already gone and refetches without an error", async () => {
    server.use(
      http.delete(mockUrl("/groups/:slug/proposals/:proposalId"), () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Not Found",
            status: 404,
            detail: "Gone.",
            code: "not_found",
          },
          {
            status: 404,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    renderWithProviders(list(true));

    await screen.findByText(SUGGESTED_WINDOW);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Delete proposal" })[0]!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    // Two reads: the first render and the refetch the vanished proposal triggered.
    await waitFor(() => expect(proposals.count()).toBe(2));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
