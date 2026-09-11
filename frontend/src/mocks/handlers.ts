import { http, HttpResponse } from "msw";
import { configFixture } from "./fixtures";
import { mockUrl } from "./urls";

// Handlers match the absolute base URL the runtime client uses, so a request to a different
// origin is not served. mockUrl resolves the same base URL as the client; jsdom (tests) and the
// browser both supply the origin the default /api/v1 path is resolved against.
export const handlers = [
  http.get(mockUrl("/config"), () => HttpResponse.json(configFixture)),
];
