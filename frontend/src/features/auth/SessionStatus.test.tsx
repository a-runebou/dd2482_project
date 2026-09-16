import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { RouteObject } from "react-router";
import { createMemoryRouter } from "react-router";
import App from "../../App";
import { createQueryClient } from "../../api/queryClient";
import { clearSession, getSession, setSession } from "../../api/session";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import { userFixture } from "../../mocks/fixtures";
import { SessionStatus } from "./SessionStatus";

// Signing out is rendered from a route other than "/", so that landing on "/" is a real
// navigation and not the route the test started on.
const routes: RouteObject[] = [
  { path: "/elsewhere", element: <SessionStatus /> },
  { path: "/", element: <p>home landing</p> },
  { path: "/sign-in", element: <p>sign-in landing</p> },
];

let signOutCount = 0;

beforeEach(() => {
  signOutCount = 0;
  server.use(
    http.delete(mockUrl("/auth/session"), () => {
      signOutCount += 1;
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

afterEach(() => {
  clearSession();
});

function renderStatus() {
  const router = createMemoryRouter(routes, {
    initialEntries: ["/elsewhere"],
  });
  render(<App queryClient={createQueryClient()} router={router} />);
}

describe("SessionStatus", () => {
  it("shows the display name and a sign-out button with a session", () => {
    setSession("a-token", userFixture);

    renderStatus();

    expect(screen.getByText(userFixture.display_name)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("shows the sign-in link without a session", () => {
    renderStatus();

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(
      screen.queryByText(userFixture.display_name),
    ).not.toBeInTheDocument();
  });

  it("never renders the access token", () => {
    setSession("a-secret-access-token", userFixture);

    renderStatus();

    expect(document.body.textContent).not.toContain("a-secret-access-token");
  });

  it("signs out, clears the store and lands on /", async () => {
    setSession("a-token", userFixture);

    renderStatus();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("home landing")).toBeInTheDocument();
    expect(signOutCount).toBe(1);
    await waitFor(() => {
      expect(getSession()).toBeUndefined();
    });
  });

  it("clears the store even when the sign-out request fails", async () => {
    setSession("a-token", userFixture);
    server.use(
      http.delete(mockUrl("/auth/session"), () => {
        signOutCount += 1;
        return HttpResponse.error();
      }),
    );

    renderStatus();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(getSession()).toBeUndefined();
    });
    expect(signOutCount).toBe(1);
  });

  it("reflects a session established after the first render", async () => {
    renderStatus();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();

    act(() => {
      setSession("a-token", userFixture);
    });

    expect(
      await screen.findByText(userFixture.display_name),
    ).toBeInTheDocument();
  });
});
