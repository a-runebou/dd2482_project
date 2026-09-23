/**
 * Where to send the user after a successful sign-in, given the `redirect` parameter of the
 * magic-link callback (item C2 of docs/coordination/frontend-backend.md). The backend validates
 * it before writing it into the mail; this validates it again, because a mail link is attacker-
 * supplied input and an open redirect would send a freshly signed-in user to another site.
 *
 * Only a path relative to this origin is accepted: one leading slash, no backslash (which some
 * URL parsers normalise to a slash) and no scheme. Anything else falls back to the home page.
 */
export function safeRedirectPath(value: string | null): string {
  if (value === null || !value.startsWith("/")) {
    return "/";
  }
  if (value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return value;
}
