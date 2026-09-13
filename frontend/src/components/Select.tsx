import type { ComponentProps } from "react";
import { cx, CONTROL } from "./cx";

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cx(CONTROL, className)} {...rest} />;
}
