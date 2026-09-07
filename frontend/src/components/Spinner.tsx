import { cx } from "./cx";

interface SpinnerProps {
  className?: string;
}

/**
 * A loading indicator for use inside an existing role="status" element, never instead of one:
 * it is hidden from assistive technology, because the text beside it is what is announced.
 */
export function Spinner({ className }: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block size-4 shrink-0 animate-spin rounded-lg",
        "border-2 border-neutral-200 border-t-accent align-[-0.125em]",
        className,
      )}
    />
  );
}
