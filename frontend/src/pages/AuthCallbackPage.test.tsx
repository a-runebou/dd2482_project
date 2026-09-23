import { StrictMode } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { RouteObject } from "react-router";
import { createMemoryRouter } from "react-router";
import App from "../App";
import { createQueryClient } from "../api/queryClient";
import { clearSession, getSession } from "../api/session";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import {
  exchangedSessionFixture,
  unauthenticatedProblem,
  userFixture,
  validationFailedProblem,
} from "../mocks/fixtures";
import type { components } from "../api/generated/schema";
import { AuthCallbackPage } from "./AuthCallbackPage";

// A distinctive token, so a test can search the rendered output for it and be sure a match is
// the token and not some other text.
const MAGIC_TOKEN = "magic-link-token-3f9ac1d2b7e04a6c";

// Landing pages, not the real ones: this file is about the callback, not about what follows it.
const routes: RouteObject[] = [
  { path: "/auth/callback", element: <AuthCallbackPage /> },
  { path: "/", element: <p>home landing</p> },
  { path: "/groups", element: <p>groups landing</p> },
  { path: "/sign-in", element: <p>sign-in landing</p> },
];

const INVALID_LINK = /invalid, has already been used, or has expired/i;

let exchangeCount = 0;

beforeEach(() => {
  exchangeCount = 0;
});

afterEach(() => {
  clearSession();
});

/** Count every exchange, and answer with whatever the case needs. */
function serveExchange(respond: () => Response) {
  server.use(
    http.post(mockUrl("/auth/session"), () => {
      exchangeCount += 1;
      return respond();
    }),
  );
}

function problemResponse(
  body: components["schemas"]["Problem"],
  status: number,
) {
  return HttpResponse.json(body, {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

function renderCallback(search: string, queryClient = createQueryClient()) {
  const router = createMemoryRouter(routes, {
    // Two entries, so that going back after a successful exchange proves the callback entry
    // was replaced rather than pushed.
    initialEntries: ["/sign-in", `/auth/callback${search}`],
    initialIndex: 1,
  });
  const result = render(
    <StrictMode>
      <App queryClient={queryClient} router={router} />
    </StrictMode>,
  );
  return { router, queryClient, ...result };
}

describe("AuthCallbackPage", () => {
  it("exchanges the token once and lands on the home page", async () => {
    serveExchange(() => HttpResponse.json(exchangedSessionFixture));

    renderCallback(`?token=${MAGIC_TOKEN}`);

    expect(await screen.findByText("home landing")).toBeInTheDocument();
    expect(exchangeCount).toBe(1);
    expect(getSession()?.user).toEqual(userFixture);
    expect(getSession()?.accessToken).toBe(
      exchangedSessionFixture.access_token,
    );
  });

  it("shows a status while the exchange is in flight", async () => {
    serveExchange(() => HttpResponse.json(exchangedSessionFixture));

    renderCallback(`?token=${MAGIC_TOKEN}`);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(await screen.findByText("home landing")).toBeInTheDocument();
  });

  it("replaces history, so going back does not resubmit the token", async () => {
    serveExchange(() => HttpResponse.json(exchangedSessionFixture));

    const { router } = renderCallback(`?token=${MAGIC_TOKEN}`);
    expect(await screen.findByText("home landing")).toBeInTheDocument();

    await router.navigate(-1);

    expect(await screen.findByText("sign-in landing")).toBeInTheDocument();
    expect(exchangeCount).toBe(1);
  });

  it("exchanges once even when the page is mounted twice in succession", async () => {
    serveExchange(() => HttpResponse.json(exchangedSessionFixture));
    const queryClient = createQueryClient();

    const first = renderCallback(`?token=${MAGIC_TOKEN}`, queryClient);
    expect(await screen.findByText("home landing")).toBeInTheDocument();
    first.unmount();

    renderCallback(`?token=${MAGIC_TOKEN}`, queryClient);
    expect(await screen.findByText("home landing")).toBeInTheDocument();

    expect(exchangeCount).toBe(1);
  });

  it("honours a relative redirect", async () => {
    serveExchange(() => HttpResponse.json(exchangedSessionFixture));

    renderCallback(
      `?token=${MAGIC_TOKEN}&redirect=${encodeURIComponent("/groups")}`,
    );

    expect(await screen.findByText("groups landing")).toBeInTheDocument();
    expect(exchangeCount).toBe(1);
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example"])(
    "ignores the redirect %s and lands on /",
    async (redirect) => {
      serveExchange(() => HttpResponse.json(exchangedSessionFixture));

      renderCallback(
        `?token=${MAGIC_TOKEN}&redirect=${encodeURIComponent(redirect)}`,
      );

      expect(await screen.findByText("home landing")).toBeInTheDocument();
      expect(exchangeCount).toBe(1);
    },
  );

  it("shows the invalid-link message and sends no request without a token", async () => {
    serveExchange(() => HttpResponse.json(exchangedSessionFixture));

    renderCallback("");

    expect(await screen.findByText(INVALID_LINK)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /sign-in link/i }),
    ).toBeInTheDocument();
    expect(exchangeCount).toBe(0);
    expect(getSession()).toBeUndefined();
  });

  it("shows the invalid-link message on 401, without rendering the token", async () => {
    serveExchange(() => problemResponse(unauthenticatedProblem, 401));

    renderCallback(`?token=${MAGIC_TOKEN}`);

    expect(await screen.findByText(INVALID_LINK)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(MAGIC_TOKEN);
    expect(exchangeCount).toBe(1);
    expect(getSession()).toBeUndefined();
  });

  it("shows the invalid-link message on 400 validation_failed", async () => {
    serveExchange(() => problemResponse(validationFailedProblem, 400));

    renderCallback(`?token=${MAGIC_TOKEN}`);

    expect(await screen.findByText(INVALID_LINK)).toBeInTheDocument();
    expect(exchangeCount).toBe(1);
  });

  it("shows the shared error notice, not the invalid-link message, on any other failure", async () => {
    serveExchange(
      () =>
        new HttpResponse(JSON.stringify({ message: "boom" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
    );

    renderCallback(`?token=${MAGIC_TOKEN}`);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /something went wrong/i,
    );
    expect(screen.queryByText(INVALID_LINK)).not.toBeInTheDocument();
  });

  it("never shows the problem title or detail", async () => {
    serveExchange(() => problemResponse(unauthenticatedProblem, 401));

    renderCallback(`?token=${MAGIC_TOKEN}`);

    expect(await screen.findByText(INVALID_LINK)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Unauthorized");
    expect(document.body.textContent).not.toContain("No credentials.");
  });
});
