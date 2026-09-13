import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { RouteObject } from "react-router";
import { createMemoryRouter } from "react-router";
import App from "../App";
import { appRoutes } from "./routes";
import { createQueryClient } from "../api/queryClient";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import {
  dstGroupFixture,
  groupsPage1Fixture,
  ownerGroupFixture,
  userFixture,
} from "../mocks/fixtures";
import {
  resetMockAvailability,
  resetMockGroups,
  setMockRefreshCookie,
} from "../mocks/handlers";
import { clearSession } from "../api/session";

// The boot gate probes POST /auth/refresh once per QueryClient, and the mock refresh cookie is
// present by default, so a test that wants a signed-out home page has to say so.
beforeEach(() => {
  setMockRefreshCookie(true);
  resetMockGroups();
  resetMockAvailability();
});

afterEach(() => {
  clearSession();
});

function renderApp(routes: RouteObject[], initialEntries: string[]) {
  const queryClient = createQueryClient();
  const router = createMemoryRouter(routes, { initialEntries });
  render(<App queryClient={queryClient} router={router} />);
}

function withExtraChild(extra: RouteObject): RouteObject[] {
  return appRoutes.map((route) =>
    route.children ? { ...route, children: [...route.children, extra] } : route,
  );
}

describe("routing", () => {
  it("renders NotFoundPage for an unknown path after boot", async () => {
    renderApp(appRoutes, ["/does-not-exist"]);

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument();
  });

  it("shows the root error element, not the thrown message, when a route throws", async () => {
    // React logs the caught render error; silence it for this test only.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    function Boom(): never {
      throw new Error("thrown-render-secret");
    }

    try {
      renderApp(withExtraChild({ path: "boom", element: <Boom /> }), ["/boom"]);

      expect(
        await screen.findByRole("heading", { name: "Something went wrong" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/thrown-render-secret/),
      ).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("renders the Your groups heading at /groups after boot", async () => {
    let requestCount = 0;
    server.use(
      http.get(mockUrl("/groups"), () => {
        requestCount += 1;
        return HttpResponse.json(groupsPage1Fixture);
      }),
    );

    renderApp(appRoutes, ["/groups"]);

    expect(
      await screen.findByRole("heading", { name: "Your groups" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Algorithms study group"),
    ).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });

  it("renders the Create a group heading at /groups/new after boot", async () => {
    renderApp(appRoutes, ["/groups/new"]);

    expect(
      await screen.findByRole("heading", { name: "Create a group" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Group name")).toBeInTheDocument();
  });

  it("navigates to /groups/new from the link on the groups page", async () => {
    let requestCount = 0;
    server.use(
      http.get(mockUrl("/groups"), () => {
        requestCount += 1;
        return HttpResponse.json(groupsPage1Fixture);
      }),
    );

    renderApp(appRoutes, ["/groups"]);

    fireEvent.click(
      await screen.findByRole("link", { name: "Create a group" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Create a group" }),
    ).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });

  it("navigates to /groups from the home page link", async () => {
    let requestCount = 0;
    server.use(
      http.get(mockUrl("/groups"), () => {
        requestCount += 1;
        return HttpResponse.json(groupsPage1Fixture);
      }),
    );

    renderApp(appRoutes, ["/"]);

    fireEvent.click(await screen.findByRole("link", { name: /your groups/i }));

    expect(
      await screen.findByRole("heading", { name: "Your groups" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Algorithms study group"),
    ).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });

  it("renders the Sign in heading at /sign-in after boot", async () => {
    renderApp(appRoutes, ["/sign-in"]);

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Email address")).toBeInTheDocument();
  });

  it("navigates to /sign-in from the link on the home page", async () => {
    // The Sign in link only exists without a session, so start the boot probe empty-handed.
    setMockRefreshCookie(false);

    renderApp(appRoutes, ["/"]);

    fireEvent.click(await screen.findByRole("link", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("signs in at /auth/callback and lands on the home page", async () => {
    setMockRefreshCookie(false);

    renderApp(appRoutes, ["/auth/callback?token=magic-link-token-3f9ac1d2"]);

    expect(
      await screen.findByRole("heading", { name: "Schedular" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(userFixture.display_name),
    ).toBeInTheDocument();
  });
  it("renders the group's name at /groups/:slug after boot", async () => {
    renderApp(appRoutes, [`/groups/${ownerGroupFixture.slug}`]);

    expect(
      await screen.findByRole("heading", { name: ownerGroupFixture.name }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
  });

  it("renders the availability grid at /groups/:slug/availability after boot", async () => {
    renderApp(appRoutes, [`/groups/${dstGroupFixture.slug}/availability`]);

    expect(
      await screen.findByRole("heading", { name: "Availability" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("grid", { name: /availability grid/i }),
    ).toBeInTheDocument();
  });

  it("navigates from a group's detail page to its availability grid", async () => {
    renderApp(appRoutes, [`/groups/${dstGroupFixture.slug}`]);

    fireEvent.click(
      await screen.findByRole("link", { name: /open the availability grid/i }),
    );

    expect(
      await screen.findByRole("grid", { name: /availability grid/i }),
    ).toBeInTheDocument();
  });

  it("navigates from the groups list to a group's detail page", async () => {
    let requestCount = 0;
    server.use(
      http.get(mockUrl("/groups"), () => {
        requestCount += 1;
        return HttpResponse.json(groupsPage1Fixture);
      }),
    );

    renderApp(appRoutes, ["/groups"]);

    fireEvent.click(
      await screen.findByRole("link", { name: ownerGroupFixture.name }),
    );

    expect(
      await screen.findByRole("heading", { name: ownerGroupFixture.name }),
    ).toBeInTheDocument();
    expect(requestCount).toBe(1);
  });
});
