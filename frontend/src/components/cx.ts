/**
 * Joins class names, dropping the empty ones. A primitive's own classes come first and the
 * caller's last, so a caller can add to a primitive without having to restate it.
 */
export function cx(...parts: (string | undefined | false)[]): string {
  return parts
    .filter((part) => typeof part === "string" && part !== "")
    .join(" ");
}

/**
 * The one focus treatment, shared by every button, control and link. It is an outline rather
 * than a ring so it survives on top of a border, and it is offset so it never sits on the
 * element's own edge.
 */
export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** The shared shape of a text control: input, textarea and select all look the same. */
export const CONTROL = cx(
  "w-full rounded-md border border-neutral-500 bg-white px-3 py-2",
  "text-base text-neutral-900 placeholder:text-neutral-500",
  "aria-[invalid=true]:border-danger",
  "disabled:border-neutral-200 disabled:bg-neutral-200 disabled:text-neutral-600",
  FOCUS,
);

/**
 * An inline link. Underlined, because colour alone must not be what marks a link, and sharing
 * the one focus treatment with buttons and controls.
 */
export const LINK = cx(
  "rounded-sm text-accent underline underline-offset-2 hover:text-accent-hover",
  FOCUS,
);
