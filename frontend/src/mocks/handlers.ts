import { http, HttpResponse } from "msw";
import type { components } from "../api/generated/schema";
import {
  configFixture,
  createdGroupFixture,
  exchangedSessionFixture,
  groupsPage1Fixture,
  groupsPage2Fixture,
  refreshedSessionFixture,
  unauthenticatedProblem,
  validationFailedProblem,
} from "./fixtures";
import { mockUrl } from "./urls";

/**
 * Stands in for the HttpOnly refresh cookie, which JavaScript cannot see and MSW therefore
 * cannot model with a real cookie. It starts present, so a boot probe restores a session the
 * way a returning visitor's would; POST /auth/session sets it and DELETE /auth/session revokes
 * it, which is what makes signing out stick instead of the boot probe signing the user straight
 * back in. A test that wants the signed-out default calls setMockRefreshCookie(false); reset it
 * in a beforeEach, because server.resetHandlers() does not touch module state.
 */
let refreshCookiePresent = true;

export function setMockRefreshCookie(present: boolean): void {
  refreshCookiePresent = present;
}

function unauthenticatedResponse() {
  return HttpResponse.json(unauthenticatedProblem, {
    status: 401,
    headers: { "Content-Type": "application/problem+json" },
  });
}

// Handlers match the absolute base URL the runtime client uses, so a request to a different
// origin is not served. mockUrl resolves the same base URL as the client; jsdom (tests) and the
// browser both supply the origin the default /api/v1 path is resolved against.
export const handlers = [
  http.get(mockUrl("/config"), () => HttpResponse.json(configFixture)),
  // Two pages: no cursor returns the first page and its next_cursor; that exact cursor returns
  // the second page with next_cursor null; any other cursor is a 400 validation_failed problem.
  http.get(mockUrl("/groups"), ({ request }) => {
    const cursor = new URL(request.url).searchParams.get("cursor");
    if (cursor === null) {
      return HttpResponse.json(groupsPage1Fixture);
    }
    if (cursor === "page2") {
      return HttpResponse.json(groupsPage2Fixture);
    }
    return HttpResponse.json(validationFailedProblem, {
      status: 400,
      headers: { "Content-Type": "application/problem+json" },
    });
  }),
  // Creation succeeds and echoes the submitted body. The list fixtures are static, so a created
  // group never appears in GET /groups; that is deliberate, not a cache bug.
  http.post(mockUrl("/groups"), async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["GroupCreate"];
    return HttpResponse.json(createdGroupFixture(body), { status: 201 });
  }),
  // Always 202, whatever the address, matching the contract's reason for never disclosing
  // whether an account exists.
  http.post(
    mockUrl("/auth/magic-link"),
    () => new HttpResponse(null, { status: 202 }),
  ),
  // Exchanging a magic-link token always succeeds, whatever the token: the token's validity is
  // the backend's business, and a test that wants a rejection overrides this handler.
  http.post(mockUrl("/auth/session"), () => {
    refreshCookiePresent = true;
    return HttpResponse.json(exchangedSessionFixture);
  }),
  http.post(mockUrl("/auth/refresh"), () =>
    refreshCookiePresent
      ? HttpResponse.json(refreshedSessionFixture)
      : unauthenticatedResponse(),
  ),
  http.delete(mockUrl("/auth/session"), () => {
    refreshCookiePresent = false;
    return new HttpResponse(null, { status: 204 });
  }),
];
