import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { RouteObject } from "react-router";
import { createMemoryRouter } from "react-router";
import App from "../App";
import { appRoutes } from "./routes";
import { createQueryClient } from "../api/queryClient";
import { useConfig } from "../api/config";
import {
  configFixture,
  refreshedSessionFixture,
  userFixture,
} from "../mocks/fixtures";
import { server } from "../mocks/server";
import { setMockRefreshCookie } from "../mocks/handlers";
import { mockUrl } from "../mocks/urls";
import { clearSession, getSession } from "../api/session";

// The mock refresh cookie and the session store are both module state, so neither is reset by
// server.resetHandlers() or by unmounting.
beforeEach(() => {
  setMockRefreshCookie(true);
});

afterEach(() => {
  clearSession();
});

// Each test builds its own QueryClient and memory router, so no state leaks between tests.
function renderApp(routes: RouteObject[], initialEntries: string[] = ["/"]) {
  const queryClient = createQueryClient();
  const router = createMemoryRouter(routes, { initialEntries });
  render(<App queryClient={queryClient} router={router} />);
}

// Append an extra child to the root layout route without mutating appRoutes.
function withExtraChild(extra: RouteObject): RouteObject[] {
  return appRoutes.map((route) =>
    route.children ? { ...route, children: [...route.children, extra] } : route,
  );
}

// An application/problem+json response, the only shape normalizeError treats as `problem`.
function problemResponse(status: number, code: string, retryAfter?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/problem+json",
  };
  if (retryAfter !== undefined) {
    headers["Retry-After"] = retryAfter;
  }
  return new HttpResponse(
    JSON.stringify({ type: "about:blank", title: "unavailable", status, code }),
    { status, headers },
  );
}

describe("boot gate", () => {
  it("shows a loading state, then the HomePage heading (one request)", async () => {
    const state = { count: 0 };
    server.use(
      http.get(mockUrl("/config"), async () => {
        state.count += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(configFixture);
      }),
    );

    renderApp(appRoutes);

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(
      await screen.findByRole(
        "heading",
        { name: "Schedular" },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(state.count).toBe(1);
  });

  it("fetches config once and shares it with a post-boot consumer", async () => {
    const state = { count: 0 };
    server.use(
      http.get(mockUrl("/config"), () => {
        state.count += 1;
        return HttpResponse.json(configFixture);
      }),
    );

    function Probe() {
      const { data } = useConfig();
      return <p>members {data?.max_members}</p>;
    }

    renderApp(withExtraChild({ path: "probe", element: <Probe /> }), [
      "/probe",
    ]);

    expect(
      await screen.findByText(`members ${configFixture.max_members}`),
    ).toBeInTheDocument();
    expect(state.count).toBe(1);
  });

  it("auto-retries after Retry-After on db_circuit_open, then boots (two requests)", async () => {
    const state = { count: 0 };
    server.use(
      http.get(mockUrl("/config"), () => {
        state.count += 1;
        if (state.count === 1) {
          return problemResponse(503, "db_circuit_open", "1");
        }
        return HttpResponse.json(configFixture);
      }),
    );

    renderApp(appRoutes);

    expect(
      await screen.findByRole("heading", { name: "Temporarily unavailable" }),
    ).toBeInTheDocument();
    // No user action: the Retry-After timer drives the second request.
    expect(
      await screen.findByRole(
        "heading",
        { name: "Schedular" },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    expect(state.count).toBe(2);
  });

  it("does not auto-retry service_unavailable without Retry-After; manual retry boots", async () => {
    const state = { count: 0, succeed: false };
    server.use(
      http.get(mockUrl("/config"), () => {
        state.count += 1;
        if (state.succeed) {
          return HttpResponse.json(configFixture);
        }
        return problemResponse(503, "service_unavailable");
      }),
    );

    renderApp(appRoutes);

    expect(
      await screen.findByRole("heading", { name: "Temporarily unavailable" }),
    ).toBeInTheDocument();
    // No automatic retry within two seconds.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(state.count).toBe(1);

    state.succeed = true;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(
      await screen.findByRole(
        "heading",
        { name: "Schedular" },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(state.count).toBe(2);
  });

  it("double-clicking retry sends exactly one additional request", async () => {
    const state = { count: 0, succeed: false };
    server.use(
      http.get(mockUrl("/config"), () => {
        state.count += 1;
        if (state.succeed) {
          return HttpResponse.json(configFixture);
        }
        return problemResponse(503, "service_unavailable");
      }),
    );

    renderApp(appRoutes);

    expect(
      await screen.findByRole("heading", { name: "Temporarily unavailable" }),
    ).toBeInTheDocument();

    state.succeed = true;
    const button = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(
      await screen.findByRole(
        "heading",
        { name: "Schedular" },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(state.count).toBe(2);
  });

  it("shows the cannot-reach state after the client's single retry, then boots", async () => {
    const state = { count: 0, succeed: false };
    server.use(
      http.get(mockUrl("/config"), () => {
        state.count += 1;
        if (state.succeed) {
          return HttpResponse.json(configFixture);
        }
        return HttpResponse.error();
      }),
    );

    renderApp(appRoutes);

    expect(
      await screen.findByRole(
        "heading",
        { name: "Cannot reach the server" },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    // Two attempts: the initial request plus createQueryClient's single network retry.
    expect(state.count).toBe(2);

    state.succeed = true;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(
      await screen.findByRole(
        "heading",
        { name: "Schedular" },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(state.count).toBe(3);
  });

  it("shows the generic state for a problem with any other code", async () => {
    const state = { count: 0 };
    server.use(
      http.get(mockUrl("/config"), () => {
        state.count += 1;
        return problemResponse(404, "not_found");
      }),
    );

    renderApp(appRoutes);

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(state.count).toBe(1);
  });

  it("shows the generic state for a 500 without a problem body", async () => {
    const state = { count: 0 };
    server.use(
      http.get(mockUrl("/config"), () => {
        state.count += 1;
        return HttpResponse.json({ message: "boom" }, { status: 500 });
      }),
    );

    renderApp(appRoutes);

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(state.count).toBe(1);
  });
});

describe("boot session probe", () => {
  it("restores the session before the home page renders, with one refresh", async () => {
    const state = { count: 0 };
    server.use(
      http.post(mockUrl("/auth/refresh"), () => {
        state.count += 1;
        return HttpResponse.json(refreshedSessionFixture);
      }),
    );

    renderApp(appRoutes);

    expect(
      await screen.findByRole("heading", { name: "Schedular" }),
    ).toBeInTheDocument();
    // The gate renders the home page only once the probe has settled, so finding the name
    // synchronously here is what proves the ordering.
    expect(screen.getByText(userFixture.display_name)).toBeInTheDocument();
    expect(getSession()?.accessToken).toBe(
      refreshedSessionFixture.access_token,
    );
    expect(state.count).toBe(1);
  });

  it("leaves the user signed out, with no error state, when the probe fails", async () => {
    const state = { count: 0 };
    server.use(
      http.post(mockUrl("/auth/refresh"), () => {
        state.count += 1;
        return problemResponse(401, "unauthenticated");
      }),
    );

    renderApp(appRoutes);

    expect(
      await screen.findByRole("heading", { name: "Schedular" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getSession()).toBeUndefined();

    // A failed probe is not retried.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(state.count).toBe(1);
  });
});
