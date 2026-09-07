import type { ComponentProps } from "react";
import { cx } from "./cx";

/**
 * The one page column: the same maximum width, the same horizontal padding and the same
 * vertical rhythm on every route. It renders the main landmark, so a page that needs to be a
 * status or an alert region passes the role through rather than nesting another element.
 */
export function PageContainer({ className, ...rest }: ComponentProps<"main">) {
  return (
    <main
      className={cx("mx-auto w-full max-w-2xl px-4 py-8 sm:px-6", className)}
      {...rest}
    />
  );
}
