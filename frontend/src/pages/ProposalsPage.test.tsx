import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http } from "msw";
import { render, screen, within } from "@testing-library/react";
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
    // The group's name appears twice once loaded: once in the breadcrumb, which links back to
    // the group, and once in the page's own description.
    expect(
      await screen.findByRole("link", { name: proposalsGroupFixture.name }),
    ).toHaveAttribute("href", `/groups/${SLUG}`);
    expect(
      screen.getAllByText(proposalsGroupFixture.name).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("main")).toContainElement(heading);
    expect(proposalsRequests).toBe(1);
  });

  it("links back to the groups list, to the group, and across to availability", async () => {
    const router = createMemoryRouter(
      [
        { path: "/groups", element: <h1>Your groups</h1> },
        { path: "/groups/:slug", element: <h1>Group detail</h1> },
        {
          path: "/groups/:slug/availability",
          element: <h1>Availability page</h1>,
        },
        { path: "/groups/:slug/proposals", element: <ProposalsPage /> },
      ],
      { initialEntries: [`/groups/${SLUG}/proposals`] },
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "Proposals" });
    const nav = screen.getByRole("navigation", { name: "Group" });

    expect(
      within(nav).getByRole("link", { name: "Your groups" }),
    ).toHaveAttribute("href", "/groups");
    expect(
      within(nav).getByRole("link", { name: proposalsGroupFixture.name }),
    ).toHaveAttribute("href", `/groups/${SLUG}`);
    expect(within(nav).getByText("Proposals")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Availability" }),
    ).toHaveAttribute("href", `/groups/${SLUG}/availability`);
  });

  it("renders the breadcrumb with no error while the group read is still pending", () => {
    server.use(http.get(mockUrl("/groups/:slug"), () => new Promise(() => {})));
    const router = createMemoryRouter(
      [{ path: "/groups/:slug/proposals", element: <ProposalsPage /> }],
      { initialEntries: [`/groups/${SLUG}/proposals`] },
    );

    expect(() =>
      render(
        <QueryClientProvider client={createQueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      ),
    ).not.toThrow();
    expect(
      screen.getByRole("navigation", { name: "Group" }),
    ).toBeInTheDocument();
  });
});
