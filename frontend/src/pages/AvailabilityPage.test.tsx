import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
    expect(await screen.findByText(dstGroupFixture.name)).toBeInTheDocument();
    expect(
      await screen.findByRole("grid", { name: /availability grid/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("grid", { name: /availability grid/i }),
    );
    expect(matrixRequests).toBe(1);
  });
});
