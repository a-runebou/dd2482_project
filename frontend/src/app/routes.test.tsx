import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RouteObject } from "react-router";
import { createMemoryRouter } from "react-router";
import App from "../App";
import { appRoutes } from "./routes";
import { createQueryClient } from "../api/queryClient";

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
});
