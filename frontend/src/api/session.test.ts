import { describe, it, expect, vi, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import {
  createdGroupFixture,
  refreshedSessionFixture,
  tokenExpiredProblem,
  unauthenticatedProblem,
  userFixture,
} from "../mocks/fixtures";
import type { components } from "./generated/schema";
import { apiClient } from "./client";
import {
  clearSession,
  getAccessToken,
  getSession,
  refreshSession,
  setSession,
  subscribeToSession,
} from "./session";

const groupCreate: components["schemas"]["GroupCreate"] = {
  name: "Algorithms study group",
  timezone: "Europe/Stockholm",
  date_start: "2026-10-01",
  date_end: "2026-10-07",
  window_start_minute: 480,
  window_end_minute: 1080,
};

// The store is module scope, so it outlives a test. Clear it after every one rather than
// relying on the next test to overwrite it.
afterEach(() => {
  clearSession();
});

function problemResponse(
  body: components["schemas"]["Problem"],
  status: number,
) {
  return HttpResponse.json(body, {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

/** Serve GET /me, recording the Authorization header of every attempt. */
function serveMe(respond: (attempt: number) => Response | Promise<Response>) {
  const authHeaders: (string | null)[] = [];
  server.use(
    http.get(mockUrl("/me"), ({ request }) => {
      authHeaders.push(request.headers.get("authorization"));
      return respond(authHeaders.length);
    }),
  );
  return authHeaders;
}

/** Serve POST /auth/refresh, counting the attempts. */
function serveRefresh(
  respond: (attempt: number) => Response | Promise<Response>,
) {
  const state = { count: 0 };
  server.use(
    http.post(mockUrl("/auth/refresh"), () => {
      state.count += 1;
      return respond(state.count);
    }),
  );
  return state;
}

describe("session store", () => {
  it("starts empty", () => {
    expect(getSession()).toBeUndefined();
    expect(getAccessToken()).toBeUndefined();
  });

  it("reads back what was set", () => {
    setSession("a-token", userFixture);

    expect(getAccessToken()).toBe("a-token");
    expect(getSession()?.user).toEqual(userFixture);
  });

  it("clears both the token and the user", () => {
    setSession("a-token", userFixture);

    clearSession();

    expect(getSession()).toBeUndefined();
    expect(getAccessToken()).toBeUndefined();
  });

  it("notifies subscribers on set and on clear, and stops after unsubscribing", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSession(listener);

    setSession("a-token", userFixture);
    expect(listener).toHaveBeenCalledTimes(1);

    clearSession();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setSession("another-token", userFixture);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the snapshot reference stable between reads, so useSyncExternalStore is stable", () => {
    setSession("a-token", userFixture);

    expect(getSession()).toBe(getSession());
  });
});

describe("refreshSession", () => {
  it("stores the new token and user and returns the token", async () => {
    const refresh = serveRefresh(() =>
      HttpResponse.json(refreshedSessionFixture),
    );

    const token = await refreshSession();

    expect(token).toBe(refreshedSessionFixture.access_token);
    expect(getAccessToken()).toBe(refreshedSessionFixture.access_token);
    expect(getSession()?.user).toEqual(userFixture);
    expect(refresh.count).toBe(1);
  });

  it("clears the store and returns undefined when the refresh fails", async () => {
    setSession("stale-token", userFixture);
    const refresh = serveRefresh(() =>
      problemResponse(unauthenticatedProblem, 401),
    );

    const token = await refreshSession();

    expect(token).toBeUndefined();
    expect(getSession()).toBeUndefined();
    expect(refresh.count).toBe(1);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    const refresh = serveRefresh(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return HttpResponse.json(refreshedSessionFixture);
    });

    const tokens = await Promise.all([
      refreshSession(),
      refreshSession(),
      refreshSession(),
    ]);

    expect(tokens).toEqual([
      refreshedSessionFixture.access_token,
      refreshedSessionFixture.access_token,
      refreshedSessionFixture.access_token,
    ]);
    expect(refresh.count).toBe(1);
  });

  it("starts a new request once the previous one has settled", async () => {
    const refresh = serveRefresh(() =>
      HttpResponse.json(refreshedSessionFixture),
    );

    await refreshSession();
    await refreshSession();

    expect(refresh.count).toBe(2);
  });

  it("serialises across tabs through the Web Locks API when it exists", async () => {
    serveRefresh(() => HttpResponse.json(refreshedSessionFixture));
    const request = vi.fn(
      async (_name: string, callback: () => Promise<unknown>) =>
        await callback(),
    );
    const original = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", {
      value: { request },
      configurable: true,
    });

    try {
      const token = await refreshSession();

      expect(token).toBe(refreshedSessionFixture.access_token);
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      if (original) {
        Object.defineProperty(navigator, "locks", original);
      } else {
        Reflect.deleteProperty(navigator, "locks");
      }
    }
  });

  it("still refreshes when the Web Locks API is absent", async () => {
    const refresh = serveRefresh(() =>
      HttpResponse.json(refreshedSessionFixture),
    );
    // jsdom has no navigator.locks; assert that explicitly so the fallback is not accidental.
    expect("locks" in navigator).toBe(false);

    expect(await refreshSession()).toBe(refreshedSessionFixture.access_token);
    expect(refresh.count).toBe(1);
  });
});

describe("client middleware", () => {
  it("attaches the bearer token when one is held", async () => {
    setSession("a-token", userFixture);
    const authHeaders = serveMe(() => HttpResponse.json(userFixture));

    await apiClient.GET("/me");

    expect(authHeaders).toEqual(["Bearer a-token"]);
  });

  it("attaches nothing when no token is held", async () => {
    const authHeaders = serveMe(() => HttpResponse.json(userFixture));

    await apiClient.GET("/me");

    expect(authHeaders).toEqual([null]);
  });

  it("never attaches the token to the unauthenticated paths", async () => {
    setSession("a-token", userFixture);
    const seen: Record<string, string | null> = {};
    server.use(
      http.get(mockUrl("/config"), ({ request }) => {
        seen["/config"] = request.headers.get("authorization");
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(mockUrl("/auth/magic-link"), ({ request }) => {
        seen["/auth/magic-link"] = request.headers.get("authorization");
        return new HttpResponse(null, { status: 202 });
      }),
      http.post(mockUrl("/auth/session"), ({ request }) => {
        seen["/auth/session"] = request.headers.get("authorization");
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(mockUrl("/auth/refresh"), ({ request }) => {
        seen["/auth/refresh"] = request.headers.get("authorization");
        return HttpResponse.json(refreshedSessionFixture);
      }),
    );

    await apiClient.GET("/config");
    await apiClient.POST("/auth/magic-link", {
      body: { email: "ada@example.com" },
    });
    await apiClient.POST("/auth/session", { body: { token: "magic-token" } });
    await apiClient.POST("/auth/refresh");

    expect(seen).toEqual({
      "/config": null,
      "/auth/magic-link": null,
      "/auth/session": null,
      "/auth/refresh": null,
    });
  });

  it("refreshes once and retries once on a 401 token_expired, carrying the new token", async () => {
    setSession("stale-token", userFixture);
    const authHeaders = serveMe((attempt) =>
      attempt === 1
        ? problemResponse(tokenExpiredProblem, 401)
        : HttpResponse.json(userFixture),
    );
    const refresh = serveRefresh(() =>
      HttpResponse.json(refreshedSessionFixture),
    );

    const { data, response } = await apiClient.GET("/me");

    expect(response.status).toBe(200);
    expect(data).toEqual(userFixture);
    expect(refresh.count).toBe(1);
    expect(authHeaders).toEqual([
      "Bearer stale-token",
      `Bearer ${refreshedSessionFixture.access_token}`,
    ]);
    expect(getAccessToken()).toBe(refreshedSessionFixture.access_token);
  });

  it("does not refresh on a 401 unauthenticated, and clears the store", async () => {
    setSession("a-token", userFixture);
    const authHeaders = serveMe(() =>
      problemResponse(unauthenticatedProblem, 401),
    );
    const refresh = serveRefresh(() =>
      HttpResponse.json(refreshedSessionFixture),
    );

    const { response } = await apiClient.GET("/me");

    expect(response.status).toBe(401);
    expect(refresh.count).toBe(0);
    expect(authHeaders).toHaveLength(1);
    expect(getSession()).toBeUndefined();
  });

  it("clears the store and surfaces the original 401 when the refresh fails", async () => {
    setSession("stale-token", userFixture);
    const authHeaders = serveMe(() =>
      problemResponse(tokenExpiredProblem, 401),
    );
    const refresh = serveRefresh(() =>
      problemResponse(unauthenticatedProblem, 401),
    );

    const { response } = await apiClient.GET("/me");

    expect(response.status).toBe(401);
    expect(refresh.count).toBe(1);
    expect(authHeaders).toHaveLength(1);
    expect(getSession()).toBeUndefined();
  });

  it("retries at most once, so a token_expired on the retry is returned as it is", async () => {
    setSession("stale-token", userFixture);
    const authHeaders = serveMe(() =>
      problemResponse(tokenExpiredProblem, 401),
    );
    const refresh = serveRefresh(() =>
      HttpResponse.json(refreshedSessionFixture),
    );

    const { response } = await apiClient.GET("/me");

    expect(response.status).toBe(401);
    expect(refresh.count).toBe(1);
    expect(authHeaders).toHaveLength(2);
  });

  it("refreshes exactly once for two concurrent requests that both expire", async () => {
    setSession("stale-token", userFixture);
    const refresh = serveRefresh(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return HttpResponse.json(refreshedSessionFixture);
    });
    const authHeaders = serveMe(() =>
      refresh.count === 0
        ? problemResponse(tokenExpiredProblem, 401)
        : HttpResponse.json(userFixture),
    );

    const [first, second] = await Promise.all([
      apiClient.GET("/me"),
      apiClient.GET("/me"),
    ]);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(refresh.count).toBe(1);
    // Two initial attempts with the stale token, then two retries with the refreshed one.
    expect(authHeaders).toHaveLength(4);
    expect(authHeaders.slice(2)).toEqual([
      `Bearer ${refreshedSessionFixture.access_token}`,
      `Bearer ${refreshedSessionFixture.access_token}`,
    ]);
  });

  it("retries a request with a body, re-sending the body intact", async () => {
    setSession("stale-token", userFixture);
    const bodies: unknown[] = [];
    const refresh = serveRefresh(() =>
      HttpResponse.json(refreshedSessionFixture),
    );
    server.use(
      http.post(mockUrl("/groups"), async ({ request }) => {
        bodies.push(await request.json());
        return bodies.length === 1
          ? problemResponse(tokenExpiredProblem, 401)
          : HttpResponse.json(createdGroupFixture(groupCreate), {
              status: 201,
            });
      }),
    );

    const { response } = await apiClient.POST("/groups", {
      body: groupCreate,
    });

    expect(response.status).toBe(201);
    expect(refresh.count).toBe(1);
    // The retry is the same request, not an empty one: a cloned body that had already been
    // consumed would arrive here as null.
    expect(bodies).toEqual([groupCreate, groupCreate]);
  });
});
