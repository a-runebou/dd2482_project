import type { ComponentProps } from "react";
import { cx, FOCUS } from "./cx";

type Variant = "primary" | "secondary" | "quiet";

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
}

const BASE = cx(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold",
  "transition-colors disabled:cursor-not-allowed",
  FOCUS,
);

/**
 * Disabled is muted, never faded out: opacity below full makes the label fail contrast, and a
 * button whose label cannot be read is worse than one that looks enabled.
 */
const VARIANTS: Record<Variant, string> = {
  primary: cx(
    "bg-accent px-4 py-2 text-white hover:bg-accent-hover",
    "disabled:bg-neutral-200 disabled:text-neutral-600",
  ),
  secondary: cx(
    "border border-neutral-500 bg-white px-4 py-2 text-neutral-900 hover:bg-neutral-50",
    "disabled:border-neutral-200 disabled:bg-neutral-200 disabled:text-neutral-600",
  ),
  quiet: cx(
    "rounded-md px-2 py-2 text-accent underline underline-offset-2",
    "hover:bg-accent-subtle hover:text-accent-hover",
    "disabled:text-neutral-600 disabled:no-underline",
  ),
};

/**
 * The only button in the application. It defaults to type button so that a button inside a
 * form cannot submit it by accident; a submit button says so. Everything else is forwarded,
 * so existing disabled and onClick usage is unchanged.
 */
export function Button({
  variant = "secondary",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      className={cx(BASE, VARIANTS[variant], className)}
      {...rest}
    />
  );
}
