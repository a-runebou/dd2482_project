import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { RouteObject } from "react-router";
import { createMemoryRouter } from "react-router";
import App from "../App";
import { appRoutes } from "./routes";
import { createQueryClient } from "../api/queryClient";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import { groupsPage1Fixture } from "../mocks/fixtures";

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
});
