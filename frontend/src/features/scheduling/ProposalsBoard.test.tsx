import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  dstGroupFixture,
  proposalsConfirmedGroupFixture,
  proposalsGroupFixture,
  roleUnknownGroupFixture,
  unauthenticatedProblem,
  dbCircuitOpenProblem,
  groupNotFoundProblem,
  notOwnerProblem,
} from "../../mocks/fixtures";
import {
  resetMockAvailability,
  resetMockGroups,
  resetMockProposals,
} from "../../mocks/handlers";
import { ProposalsBoard } from "./ProposalsBoard";
import { pathCounter, renderWithProviders } from "./testHarness";

const SLUG = proposalsGroupFixture.slug;
const SUGGESTED_WINDOW = "Sun 25 Oct 2026, 01:00 to 02:30";

const proposals = pathCounter(mockUrl(`/groups/${SLUG}/proposals`));

function problem(body: { status: number }) {
  return HttpResponse.json(body, {
    status: body.status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

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

const OWNER_CONTROLS = [
  /propose this window/i,
  /add proposal/i,
  /delete proposal/i,
  /confirm this proposal/i,
];

async function expectOwnerControls(present: boolean): Promise<void> {
  for (const name of OWNER_CONTROLS) {
    if (present) {
      expect(
        (await screen.findAllByRole("button", { name })).length,
      ).toBeGreaterThan(0);
    } else {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  }
}

describe("ProposalsBoard", () => {
  it("shows every owner control to the owner", async () => {
    renderWithProviders(<ProposalsBoard slug={SLUG} />);

    await screen.findByText(SUGGESTED_WINDOW);
    await expectOwnerControls(true);
  });

  it("shows no owner control to an ordinary member", async () => {
    renderWithProviders(<ProposalsBoard slug={dstGroupFixture.slug} />);

    expect(
      await screen.findByRole("heading", { name: "Proposals" }),
    ).toBeInTheDocument();
    await screen.findByText(/no proposals yet/i);
    await expectOwnerControls(false);
  });

  it("shows no owner control when my_role is absent", async () => {
    renderWithProviders(<ProposalsBoard slug={roleUnknownGroupFixture.slug} />);

    await screen.findByRole("heading", { name: "Proposals" });
    await screen.findByText(/no proposals yet/i);
    await expectOwnerControls(false);
  });

  it("says a confirmed group can no longer be changed and withdraws the controls", async () => {
    renderWithProviders(
      <ProposalsBoard slug={proposalsConfirmedGroupFixture.slug} />,
    );

    expect(
      await screen.findByText(/this group is confirmed/i),
    ).toBeInTheDocument();
    await expectOwnerControls(false);
  });

  it("offers voting on an open group", async () => {
    renderWithProviders(<ProposalsBoard slug={SLUG} />);

    await screen.findByText(SUGGESTED_WINDOW);
    expect(
      (await screen.findAllByRole("radio", { name: "Yes" })).length,
    ).toBeGreaterThan(0);
    expect(proposals.count()).toBe(1);
  });

  it("offers no voting on a confirmed group", async () => {
    renderWithProviders(
      <ProposalsBoard slug={proposalsConfirmedGroupFixture.slug} />,
    );

    await screen.findByText(/this group is confirmed/i);
    expect(screen.queryByRole("radio", { name: "Yes" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /withdraw my vote/i }),
    ).toBeNull();
  });

  it("hides the owner controls rather than showing an error when a read answers not_owner", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/proposals"), () =>
        problem(notOwnerProblem),
      ),
      http.get(mockUrl("/groups/:slug/suggestions"), () =>
        problem(notOwnerProblem),
      ),
    );

    renderWithProviders(<ProposalsBoard slug={SLUG} />);

    await screen.findByRole("heading", { name: "Proposals" });
    await expectOwnerControls(false);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("becomes the not-found panel for a group that is not visible", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug"), () => problem(groupNotFoundProblem)),
    );

    renderWithProviders(<ProposalsBoard slug={SLUG} />);

    expect(
      await screen.findByRole("heading", { name: "Group not found" }),
    ).toBeInTheDocument();
  });

  it("asks an unauthenticated visitor to sign in", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug"), () => problem(unauthenticatedProblem)),
    );

    renderWithProviders(<ProposalsBoard slug={SLUG} />);

    expect(
      await screen.findByText(/please sign in to see this/i),
    ).toBeInTheDocument();
  });

  it("offers a retry when the database circuit is open", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/proposals"), () =>
        problem(dbCircuitOpenProblem),
      ),
    );

    renderWithProviders(<ProposalsBoard slug={SLUG} />);

    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("keeps the proposals list rendered when the suggestions query fails", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/suggestions"), () =>
        problem(dbCircuitOpenProblem),
      ),
    );

    renderWithProviders(<ProposalsBoard slug={SLUG} />);

    expect(await screen.findByText(SUGGESTED_WINDOW)).toBeInTheDocument();
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(proposals.count()).toBe(1);
  });

  it("keeps the suggestions rendered when the proposals query fails", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/proposals"), () =>
        problem(dbCircuitOpenProblem),
      ),
    );

    renderWithProviders(<ProposalsBoard slug={SLUG} />);

    expect(
      await screen.findByText("Sun 25 Oct 2026, 01:30 to 02:30"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
  });

  it("never renders a problem document's title, detail or status", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/proposals"), () =>
        problem(dbCircuitOpenProblem),
      ),
    );

    renderWithProviders(<ProposalsBoard slug={SLUG} />);

    await screen.findByText(/temporarily unavailable/i);
    expect(screen.queryByText(dbCircuitOpenProblem.detail!)).toBeNull();
    expect(screen.queryByText(dbCircuitOpenProblem.title)).toBeNull();
  });
});
