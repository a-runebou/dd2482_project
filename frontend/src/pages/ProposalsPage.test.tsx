import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createQueryClient } from "../api/queryClient";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import { proposalsGroupFixture } from "../mocks/fixtures";
import {
  resetMockAvailability,
  resetMockGroups,
  resetMockProposals,
} from "../mocks/handlers";
import { ProposalsPage } from "./ProposalsPage";

const SLUG = proposalsGroupFixture.slug;
const PROPOSALS_PATH = new URL(mockUrl(`/groups/${SLUG}/proposals`)).pathname;

let proposalsRequests: number;

function count({ request }: { request: Request }) {
  if (new URL(request.url).pathname === PROPOSALS_PATH) {
    proposalsRequests += 1;
  }
}

beforeEach(() => {
  proposalsRequests = 0;
  server.events.on("request:start", count);
  resetMockGroups();
  resetMockAvailability();
  resetMockProposals();
});

afterEach(() => {
  server.events.removeListener("request:start", count);
});

describe("ProposalsPage", () => {
  it("reads the slug from the route and renders the board in the page column", async () => {
    const router = createMemoryRouter(
      [{ path: "/groups/:slug/proposals", element: <ProposalsPage /> }],
      { initialEntries: [`/groups/${SLUG}/proposals`] },
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    const heading = await screen.findByRole("heading", { name: "Proposals" });
    expect(heading).toBeInTheDocument();
    expect(
      await screen.findByText(proposalsGroupFixture.name),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(heading);
    expect(proposalsRequests).toBe(1);
  });
});
