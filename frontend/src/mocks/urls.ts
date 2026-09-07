import { resolveBaseUrl } from "../api/baseUrl";

// Absolute handler URLs built from the same base URL the runtime client uses, so handlers match
// the real origin and prefix rather than any origin (a wildcard would). Resolved once at import
// time; jsdom (tests) and the browser both provide globalThis.location.origin.
const baseUrl = resolveBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  globalThis.location.origin,
);

/** Build an absolute handler URL from a contract path such as "/config". */
export function mockUrl(path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
