import { http, HttpResponse } from "msw";
import type { components } from "../api/generated/schema";

type Group = components["schemas"]["Group"];
type MemberPage = components["schemas"]["MemberPage"];
import {
  configFixture,
  createdGroupFixture,
  exchangedSessionFixture,
  groupConfirmedProblem,
  groupEtag,
  groupNotFoundProblem,
  groupsBySlugFixture,
  groupsPage1Fixture,
  groupsPage2Fixture,
  membersBySlugFixture,
  notFoundProblem,
  notOwnerProblem,
  refreshedSessionFixture,
  rotatedInviteUrl,
  unauthenticatedProblem,
  validationFailedProblem,
  versionConflictProblem,
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

function problemResponse(problem: components["schemas"]["Problem"]) {
  return HttpResponse.json(problem, {
    status: problem.status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

/**
 * A mutable copy of the group fixtures, so that the development mock behaves like a server:
 * a rename shows the new name after the refetch, a rotation bumps the version, and a delete
 * makes the slug 404. Tests that need to count requests install their own handlers; a test
 * that relies on these must call resetMockGroups() in a beforeEach, because
 * server.resetHandlers() does not touch module state.
 */
let groups: Record<string, Group> = { ...groupsBySlugFixture };
let members: Record<string, MemberPage> = structuredClone(membersBySlugFixture);

export function resetMockGroups(): void {
  groups = { ...groupsBySlugFixture };
  members = structuredClone(membersBySlugFixture);
}

/** One path parameter, which MSW types as string | readonly string[]. */
function pathParam(value: string | readonly string[] | undefined): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
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
  // --- Group detail ---------------------------------------------------------------------
  // A read always carries the ETag, because every mutation below insists on a matching
  // If-Match when the client sends one. Unknown slugs are 404 group_not_found, which is also
  // what a non-member receives: the handler cannot tell the two apart, and neither can the UI.
  http.get(mockUrl("/groups/:slug"), ({ params }) => {
    const group = groups[pathParam(params.slug)];
    if (group === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    return HttpResponse.json(group, { headers: { ETag: groupEtag(group) } });
  }),
  http.get(mockUrl("/groups/:slug/members"), ({ params }) => {
    const roster = members[pathParam(params.slug)];
    if (roster === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    return HttpResponse.json(roster);
  }),
  // The ordering of the checks matters and mirrors the backend: existence, then the
  // precondition, then the state, then the role.
  http.patch(mockUrl("/groups/:slug"), async ({ params, request }) => {
    const slug = pathParam(params.slug);
    const group = groups[slug];
    if (group === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    const ifMatch = request.headers.get("If-Match");
    if (ifMatch !== null && ifMatch !== groupEtag(group)) {
      return problemResponse(versionConflictProblem);
    }
    if (group.state === "confirmed") {
      return problemResponse(groupConfirmedProblem);
    }
    if (group.my_role !== "owner") {
      return problemResponse(notOwnerProblem);
    }
    const body = (await request.json()) as components["schemas"]["GroupPatch"];
    const rotate = body.rotate_invite_token === true;
    // The rotate flags are instructions, not properties of the group, so they are never merged.
    const { rotate_invite_token, rotate_feed_token, ...rest } = body;
    void rotate_invite_token;
    void rotate_feed_token;
    const updated = { ...group, ...rest, version: group.version + 1 };
    groups[slug] = updated;
    return HttpResponse.json(
      rotate ? { ...updated, invite_url: rotatedInviteUrl(slug) } : updated,
      { headers: { ETag: groupEtag(updated) } },
    );
  }),
  http.delete(mockUrl("/groups/:slug"), ({ params }) => {
    const slug = pathParam(params.slug);
    if (groups[slug] === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    delete groups[slug];
    delete members[slug];
    return new HttpResponse(null, { status: 204 });
  }),
  http.delete(mockUrl("/groups/:slug/members/:userId"), ({ params }) => {
    const slug = pathParam(params.slug);
    const group = groups[slug];
    const roster = members[slug];
    if (group === undefined || roster === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    const userId = pathParam(params.userId);
    // The owner can neither be removed nor leave (ARCHITECTURE section 5).
    if (roster.data.some((m) => m.user_id === userId && m.role === "owner")) {
      return problemResponse(notOwnerProblem);
    }
    const remaining = roster.data.filter((m) => m.user_id !== userId);
    if (remaining.length === roster.data.length) {
      return problemResponse(notFoundProblem);
    }
    members[slug] = { ...roster, data: remaining };
    groups[slug] = { ...group, member_count: remaining.length };
    return new HttpResponse(null, { status: 204 });
  }),
];
