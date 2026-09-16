import type { ComponentProps } from "react";
import { cx, FOCUS } from "./cx";

/**
 * A checkbox. It is its own primitive rather than a use of CONTROL, because a checkbox sits
 * beside its label rather than under it and is sized rather than filled: everything CONTROL
 * carries — full width, padding, placeholder colour — is wrong for one.
 *
 * It deliberately does not go through Field: Field puts the label above the control, which is
 * right for a text input and wrong here. A caller wraps it in its own label instead.
 */
export function Checkbox({
  className,
  ...rest
}: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cx(
        "size-4 shrink-0 rounded-sm border border-neutral-500 accent-accent",
        FOCUS,
        className,
      )}
      {...rest}
    />
  );
}
