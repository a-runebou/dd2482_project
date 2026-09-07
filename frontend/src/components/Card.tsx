import type { ComponentProps } from "react";
import { cx } from "./cx";

/** A surface: white, a hairline border, and padding. Deliberately no shadow. */
export function Card({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "rounded-md border border-neutral-200 bg-white p-4 sm:p-5",
        className,
      )}
      {...rest}
    />
  );
}
