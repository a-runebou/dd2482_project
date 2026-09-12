import createClient from "openapi-fetch";
import type { Middleware } from "openapi-fetch";
import type { paths } from "./generated/schema";
import { resolveBaseUrl } from "./baseUrl";
import { clearSession, getAccessToken, refreshSession } from "./session";

/**
 * The paths that carry no bearer token and never trigger a refresh: none of them is
 * authenticated by one, and refreshing in response to a failed refresh would recurse.
 * Matched against openapi-fetch's schemaPath, so no URL parsing is involved.
 */
const UNAUTHENTICATED_PATHS = new Set<string>([
  "/config",
  "/auth/magic-link",
  "/auth/session",
  "/auth/refresh",
]);

/**
 * The request as it was sent, kept only for the paths that may need a retry, so that a single
 * retry can re-send an identical request with a fresh token. A Request's body can be read once,
 * hence the clone: the original is consumed by the fetch that produced the 401.
 */
const retryable = new Map<string, Request>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The problem code of a response, or undefined when the body is not a problem document. */
async function problemCode(response: Response): Promise<string | undefined> {
  if (!(response.headers.get("content-type") ?? "").includes("problem+json")) {
    return undefined;
  }
  try {
    // Clone, because openapi-fetch still has to read the body to build the ApiError.
    const body: unknown = await response.clone().json();
    return isRecord(body) && typeof body.code === "string"
      ? body.code
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Attaches the bearer token, and turns a single `token_expired` into one refresh and one retry
 * (ARCHITECTURE 7.4). The retry goes through the raw fetch rather than back through the client,
 * so it cannot re-enter this middleware and a second 401 is returned as it is. Any other 401,
 * and a refresh that fails, sign the user out and leave the original response untouched.
 */
const sessionMiddleware: Middleware = {
  onRequest({ request, schemaPath, id }) {
    if (UNAUTHENTICATED_PATHS.has(schemaPath)) {
      return undefined;
    }
    const token = getAccessToken();
    if (token === undefined) {
      return undefined;
    }
    request.headers.set("Authorization", `Bearer ${token}`);
    retryable.set(id, request.clone());
    return undefined;
  },

  async onResponse({ response, id, options }) {
    const original = retryable.get(id);
    retryable.delete(id);
    if (response.status !== 401 || original === undefined) {
      return undefined;
    }

    if ((await problemCode(response)) !== "token_expired") {
      clearSession();
      return undefined;
    }

    const token = await refreshSession();
    if (token === undefined) {
      // refreshSession has already cleared the store; surface the original 401.
      return undefined;
    }
    original.headers.set("Authorization", `Bearer ${token}`);
    return await options.fetch(original);
  },

  onError({ id }) {
    retryable.delete(id);
    return undefined;
  },
};

/**
 * credentials is set here rather than in the middleware because Request.credentials is
 * read-only once constructed. Every request therefore carries the refresh cookie, which is what
 * POST /auth/refresh and DELETE /auth/session need; under the single origin of item C1 the
 * cookie is first-party, so this only makes the default explicit.
 */
export const apiClient = createClient<paths>({
  baseUrl: resolveBaseUrl(
    import.meta.env.VITE_API_BASE_URL,
    globalThis.location.origin,
  ),
  credentials: "include",
});

apiClient.use(sessionMiddleware);
