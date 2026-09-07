import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createQueryClient } from "../api/queryClient";
import { clearSession, setSession } from "../api/session";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import {
  alreadyMemberProblem,
  exchangedSessionFixture,
  memberGroupFixture,
  userFixture,
} from "../mocks/fixtures";
import { JoinPage, PENDING_INVITE_TOKEN_KEY } from "./JoinPage";

const SLUG = memberGroupFixture.slug;
const TOKEN = "test-invite-token-aaaaaaaaaaaaaaaa";

function renderJoin(search = `?invite=${TOKEN}`) {
  const queryClient = createQueryClient();
  const router = createMemoryRouter(
    [
      { path: "/join/:slug", element: <JoinPage /> },
      { path: "/groups/:slug", element: <p>group destination</p> },
    ],
    { initialEntries: [`/join/${SLUG}${search}`] },
  );
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  sessionStorage.clear();
  clearSession();
});

afterEach(() => {
  sessionStorage.clear();
  clearSession();
});

describe("JoinPage", () => {
  it("joins an authenticated user and navigates to the group", async () => {
    setSession("access-token", userFixture);
    const { router } = renderJoin();

    expect(await screen.findByText("group destination")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/groups/${SLUG}`);
    expect(sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY)).toBeNull();
  });

  it("treats already_member as success", async () => {
    setSession("access-token", userFixture);
    server.use(
      http.post(mockUrl("/groups/:slug/join"), () =>
        HttpResponse.json(alreadyMemberProblem, {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );

    const { router } = renderJoin();

    expect(await screen.findByText("group destination")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/groups/${SLUG}`);
    expect(sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY)).toBeNull();
  });

  it("preserves the invite and starts sign-in when unauthenticated", async () => {
    let redirectPath: string | undefined;
    server.use(
      http.post(mockUrl("/auth/magic-link"), async ({ request }) => {
        redirectPath = ((await request.json()) as { redirect_path: string })
          .redirect_path;
        return new HttpResponse(null, { status: 202 });
      }),
    );

    renderJoin();
    expect(
      await screen.findByText("Sign in to join this group."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send sign-in link/i }));

    await screen.findByText("Check your email");
    expect(sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY)).toBe(TOKEN);
    expect(redirectPath).toBe(`/join/${SLUG}`);
  });

  it("rejects missing and invalid invite parameters", async () => {
    const missing = renderJoin("");
    expect(
      await screen.findByText("This invite link is missing or invalid."),
    ).toBeInTheDocument();
    missing.unmount();

    renderJoin("?invite=short");
    expect(
      await screen.findByText("This invite link is missing or invalid."),
    ).toBeInTheDocument();
  });

  it("resumes joining after sign-in using the stored invite", async () => {
    sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, TOKEN);
    const { router } = renderJoin("");
    expect(
      await screen.findByText("Sign in to join this group."),
    ).toBeInTheDocument();

    setSession(exchangedSessionFixture.access_token, userFixture);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/groups/${SLUG}`);
    });
    expect(sessionStorage.getItem(PENDING_INVITE_TOKEN_KEY)).toBeNull();
  });
});
