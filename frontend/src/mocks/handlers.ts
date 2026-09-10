import { http, HttpResponse } from "msw";
import { configFixture } from "./fixtures";

// The path is matched with a leading wildcard so it is independent of the origin the client
// builds its absolute base URL from. A bare relative path is not resolved against jsdom's
// location by msw/node, so it would never intercept; the wildcard is the smallest fix.
export const handlers = [
  http.get("*/api/v1/config", () => HttpResponse.json(configFixture)),
];
