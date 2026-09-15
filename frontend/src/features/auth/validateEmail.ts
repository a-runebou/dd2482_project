/**
 * UX-only validation (CLAUDE.md rule 6): enough to catch an obvious slip, no more. The backend
 * validates the address itself, so this deliberately does not check anything stricter than a
 * non-empty value with an @ and a non-empty part on each side, and no whitespace.
 */
export function validateEmail(email: string): string | undefined {
  if (email === "") {
    return "Enter your email address.";
  }
  if (/\s/.test(email)) {
    return "Enter a valid email address.";
  }
  const parts = email.split("@");
  if (parts.length < 2 || parts[0] === "" || parts[parts.length - 1] === "") {
    return "Enter a valid email address.";
  }
  return undefined;
}
