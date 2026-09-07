import type { ComponentProps } from "react";
import { cx, CONTROL } from "./cx";

/** A text control. Every prop, including ref, goes straight to the input. */
export function TextInput({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(CONTROL, className)} {...rest} />;
}
