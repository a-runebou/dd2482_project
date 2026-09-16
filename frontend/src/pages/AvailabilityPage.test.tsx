import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http } from "msw";
import { render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createQueryClient } from "../api/queryClient";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import { dstGroupFixture } from "../mocks/fixtures";
import { resetMockAvailability, resetMockGroups } from "../mocks/handlers";
import { AvailabilityPage } from "./AvailabilityPage";

const SLUG = dstGroupFixture.slug;
const MATRIX_PATH = new URL(mockUrl(`/groups/${SLUG}/availability`)).pathname;

let matrixRequests: number;

function count({ request }: { request: Request }) {
  if (new URL(request.url).pathname === MATRIX_PATH) {
    matrixRequests += 1;
  }
}

beforeEach(() => {
  matrixRequests = 0;
  server.events.on("request:start", count);
  resetMockGroups();
  resetMockAvailability();
});

afterEach(() => {
  server.events.removeListener("request:start", count);
});

describe("AvailabilityPage", () => {
  it("reads the slug from the route and renders the grid in the page column", async () => {
    const router = createMemoryRouter(
      [{ path: "/groups/:slug/availability", element: <AvailabilityPage /> }],
      { initialEntries: [`/groups/${SLUG}/availability`] },
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Availability" }),
    ).toBeInTheDocument();
    // The group's name appears twice once loaded: once in the breadcrumb, which links back to
    // the group, and once in the page's own description.
    expect(
      await screen.findByRole("link", { name: dstGroupFixture.name }),
    ).toHaveAttribute("href", `/groups/${SLUG}`);
    expect(
      screen.getAllByText(dstGroupFixture.name).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      await screen.findByRole("grid", { name: /availability grid/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("grid", { name: /availability grid/i }),
    );
    expect(matrixRequests).toBe(1);
  });

  it("links back to the groups list, to the group, and across to proposals", async () => {
    const router = createMemoryRouter(
      [
        { path: "/groups", element: <h1>Your groups</h1> },
        { path: "/groups/:slug", element: <h1>Group detail</h1> },
        { path: "/groups/:slug/availability", element: <AvailabilityPage /> },
        { path: "/groups/:slug/proposals", element: <h1>Proposals page</h1> },
      ],
      { initialEntries: [`/groups/${SLUG}/availability`] },
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: "Availability" });
    const nav = screen.getByRole("navigation", { name: "Group" });

    expect(
      within(nav).getByRole("link", { name: "Your groups" }),
    ).toHaveAttribute("href", "/groups");
    expect(
      within(nav).getByRole("link", { name: dstGroupFixture.name }),
    ).toHaveAttribute("href", `/groups/${SLUG}`);
    expect(within(nav).getByText("Availability")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Proposals" }),
    ).toHaveAttribute("href", `/groups/${SLUG}/proposals`);
  });

  it("renders the breadcrumb with no error while the group read is still pending", () => {
    server.use(http.get(mockUrl("/groups/:slug"), () => new Promise(() => {})));
    const router = createMemoryRouter(
      [{ path: "/groups/:slug/availability", element: <AvailabilityPage /> }],
      { initialEntries: [`/groups/${SLUG}/availability`] },
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
