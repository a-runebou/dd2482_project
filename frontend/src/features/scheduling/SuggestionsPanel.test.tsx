import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  configFixture,
  proposalsGroupFixture,
  dstGroupFixture,
} from "../../mocks/fixtures";
import {
  resetMockAvailability,
  resetMockGroups,
  resetMockProposals,
} from "../../mocks/handlers";
import { limitMessage } from "./schedulingErrors";
import { SuggestionsPanel } from "./SuggestionsPanel";
import {
  membersFixtureIndex,
  pathCounter,
  renderWithProviders,
} from "./testHarness";

const SLUG = proposalsGroupFixture.slug;
const TIMEZONE = proposalsGroupFixture.timezone;
const SUGGESTIONS = mockUrl(`/groups/${SLUG}/suggestions`);
const PROPOSALS = mockUrl(`/groups/${SLUG}/proposals`);

const suggestions = pathCounter(SUGGESTIONS);
const proposals = pathCounter(PROPOSALS);

/** The query strings every suggestions request carried, in order. */
let queries: string[];

function recordQuery({ request }: { request: Request }): void {
  const url = new URL(request.url);
  if (url.pathname === new URL(SUGGESTIONS).pathname) {
    queries.push(url.search);
  }
}

beforeEach(() => {
  suggestions.reset();
  proposals.reset();
  queries = [];
  server.events.on("request:start", suggestions.listener);
  server.events.on("request:start", proposals.listener);
  server.events.on("request:start", recordQuery);
  resetMockGroups();
  resetMockAvailability();
  resetMockProposals();
});

afterEach(() => {
  server.events.removeListener("request:start", suggestions.listener);
  server.events.removeListener("request:start", proposals.listener);
  server.events.removeListener("request:start", recordQuery);
});

function panel(canPropose = false) {
  return (
    <SuggestionsPanel
      slug={SLUG}
      timezone={TIMEZONE}
      members={membersFixtureIndex}
      config={configFixture}
      canPropose={canPropose}
    />
  );
}

describe("SuggestionsPanel", () => {
  it("renders the windows, the counts and the missing members in the group's timezone", async () => {
    renderWithProviders(panel());

    // 2026-10-24T23:30Z to 2026-10-25T00:30Z, both CEST, so 01:30 to 02:30 in Stockholm.
    expect(
      await screen.findByText("Sun 25 Oct 2026, 01:30 to 02:30"),
    ).toBeInTheDocument();
    // The window that straddles the change: 00:00Z is 02:00 CEST and 01:00Z is 02:00 CET,
    // so the same local label opens and closes an hour of real time.
    expect(
      screen.getByText("Sun 25 Oct 2026, 02:00 to 02:00"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/2 members available/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/Edsger Dijkstra/).length).toBeGreaterThan(0);
    expect(suggestions.count()).toBe(1);
  });

  it("marks the first suggestion as the best fit and the rest relative to it", async () => {
    renderWithProviders(panel());

    expect(await screen.findByText("Best fit")).toBeInTheDocument();
    expect(screen.getAllByText(/% of the best fit/).length).toBeGreaterThan(0);
    // The raw score is never shown.
    expect(screen.queryByText(/2\.5/)).not.toBeInTheDocument();
  });

  it("refetches with the new duration and no other changed value", async () => {
    renderWithProviders(panel());

    await screen.findByText("Sun 25 Oct 2026, 01:30 to 02:30");
    expect(queries).toEqual(["?duration_minutes=60&limit=5"]);

    fireEvent.change(screen.getByLabelText("Duration to look for"), {
      target: { value: "90" },
    });

    await waitFor(() => expect(queries.length).toBe(2));
    expect(queries[1]).toBe("?duration_minutes=90&limit=5");
  });

  it("offers only multiples of the slot length between the configured bounds", async () => {
    renderWithProviders(panel());

    const control = await screen.findByLabelText("Duration to look for");
    const values = [...control.querySelectorAll("option")].map(
      (option) => option.value,
    );
    // configFixture allows 30 to 90 in steps of 30.
    expect(values).toEqual(["30", "60", "90"]);
  });

  it("explains an empty result rather than showing nothing", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/suggestions"), () =>
        HttpResponse.json({ data: [], next_cursor: null }),
      ),
    );

    renderWithProviders(panel());

    expect(
      await screen.findByText(/no window works for everyone yet/i),
    ).toBeInTheDocument();
    expect(suggestions.count()).toBe(1);
  });

  it("renders a member id with no matching member as an unknown member", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/suggestions"), () =>
        HttpResponse.json({
          data: [
            {
              start_at: "2026-10-24T23:00:00Z",
              end_at: "2026-10-25T00:00:00Z",
              score: 1,
              available_user_ids: [],
              preferred_user_ids: [],
              missing_user_ids: ["b6e1d1d0-1f0a-4a3b-8c2e-eeeeeeeeeeee"],
            },
          ],
          next_cursor: null,
        }),
      ),
    );

    renderWithProviders(panel());

    expect(await screen.findByText(/an unknown member/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/b6e1d1d0-1f0a-4a3b-8c2e-eeeeeeeeeeee/),
    ).not.toBeInTheDocument();
  });

  it("offers no proposal control to someone who is not the owner", async () => {
    renderWithProviders(panel(false));

    await screen.findByText("Sun 25 Oct 2026, 01:30 to 02:30");
    expect(
      screen.queryByRole("button", { name: /propose this window/i }),
    ).not.toBeInTheDocument();
  });

  it("sends the suggestion's exact instants, origin suggested and an idempotency key", async () => {
    const bodies: unknown[] = [];
    const keys: (string | null)[] = [];
    server.use(
      http.post(mockUrl("/groups/:slug/proposals"), async ({ request }) => {
        bodies.push(await request.json());
        keys.push(request.headers.get("Idempotency-Key"));
        return HttpResponse.json(
          {
            id: "d4c3b2a1-0000-4000-8000-00000000000f",
            start_at: "2026-10-24T23:30:00Z",
            end_at: "2026-10-25T00:30:00Z",
            origin: "suggested",
            created_by: dstGroupFixture.owner_id,
            votes: { yes: [], maybe: [], no: [] },
            my_vote: null,
            created_at: "2026-09-14T09:00:00Z",
          },
          { status: 201 },
        );
      }),
    );

    renderWithProviders(panel(true));

    const buttons = await screen.findAllByRole("button", {
      name: /propose this window/i,
    });
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[0]!);

    await waitFor(() => expect(bodies.length).toBe(1));
    expect(bodies[0]).toEqual({
      start_at: "2026-10-24T23:30:00Z",
      end_at: "2026-10-25T00:30:00Z",
      origin: "suggested",
    });
    expect(keys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("says the limit from the configuration when the group already has enough proposals", async () => {
    server.use(
      http.post(mockUrl("/groups/:slug/proposals"), () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "Too many.",
            code: "proposal_limit_reached",
          },
          {
            status: 409,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    renderWithProviders(panel(true));

    fireEvent.click(
      (
        await screen.findAllByRole("button", { name: /propose this window/i })
      )[0]!,
    );

    expect(
      await screen.findByText(
        limitMessage(configFixture.max_proposals_per_group),
      ),
    ).toBeInTheDocument();
  });
});
