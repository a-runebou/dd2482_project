import type { ComponentProps } from "react";
import { cx, CONTROL } from "./cx";

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(CONTROL, "min-h-24", className)} {...rest} />;
}
