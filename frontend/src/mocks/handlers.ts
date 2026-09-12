import { http, HttpResponse } from "msw";
import type { components } from "../api/generated/schema";
import {
  configFixture,
  createdGroupFixture,
  groupsPage1Fixture,
  groupsPage2Fixture,
  validationFailedProblem,
} from "./fixtures";
import { mockUrl } from "./urls";

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
];
