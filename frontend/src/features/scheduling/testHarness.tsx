import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createQueryClient } from "../../api/queryClient";
import type { components } from "../../api/generated/schema";
import { buildMemberIndex } from "./members";
import { dstMembersPageFixture } from "../../mocks/fixtures";

/**
 * A fresh QueryClient and memory router around one scheduling component.
 *
 * Every test builds its own client, so nothing is shared between them, and its own router,
 * because the panels render links back to the group. It is a test helper rather than a fixture:
 * it holds no state of its own and is therefore nothing to reset.
 */
export function renderWithProviders(ui: ReactNode): void {
  const router = createMemoryRouter([{ path: "/", element: ui }], {
    initialEntries: ["/"],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The roster of the daylight-saving group, indexed as the panels take it. */
export const membersFixtureIndex = buildMemberIndex(dstMembersPageFixture);

/** Count requests to one path, for the per-path assertions every MSW-backed test makes. */
export function pathCounter(path: string): {
  listener: (event: { request: Request }) => void;
  count: () => number;
  reset: () => void;
} {
  let seen = 0;
  const expected = new URL(path).pathname;
  return {
    listener: ({ request }) => {
      if (new URL(request.url).pathname === expected) {
        seen += 1;
      }
    },
    count: () => seen,
    reset: () => {
      seen = 0;
    },
  };
}

export type Config = components["schemas"]["Config"];
