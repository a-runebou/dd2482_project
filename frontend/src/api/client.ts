import createClient from "openapi-fetch";
import type { paths } from "./generated/schema";

/**
 * Resolve the API base URL. A non-empty configured value wins; otherwise the default
 * /api/v1 path is resolved against the given origin. Resolving against an explicit origin
 * (rather than passing a bare relative path) is required because Node's Request, used by
 * the Vitest jsdom environment, cannot parse a relative URL and would otherwise surface as
 * a false network error. In a browser this is equivalent to the relative default in F6.
 */
export function resolveBaseUrl(
  configured: string | undefined,
  origin: string,
): string {
  if (configured && configured.length > 0) {
    return configured;
  }
  return new URL("/api/v1", origin).href;
}

export const apiClient = createClient<paths>({
  baseUrl: resolveBaseUrl(
    import.meta.env.VITE_API_BASE_URL,
    globalThis.location.origin,
  ),
});
