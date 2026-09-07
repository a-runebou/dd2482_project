import type { ReactNode } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { Spinner } from "./Spinner";
import { cx } from "./cx";

interface ConfirmPanelProps {
  heading: string;
  description: ReactNode;
  confirmLabel: string;
  /** Replaces the confirm label while `isPending`; defaults to the confirm label. */
  pendingLabel?: string;
  /**
   * Irreversible. Gives the confirm button the danger treatment and adds the sentence saying
   * so, because colour alone must never be what tells the user an action cannot be undone.
   */
  destructive?: boolean;
  confirmDisabled?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Anything the confirmation itself needs, such as a field to type a name into. */
  children?: ReactNode;
}

/**
 * The one confirmation in the application: an inline panel, not a modal. It traps no focus and
 * captures no keystrokes, so nothing here needs a dialog library; the caller decides when it is
 * mounted, and unmounting it is what cancelling does.
 */
export function ConfirmPanel({
  heading,
  description,
  confirmLabel,
  pendingLabel,
  destructive = false,
  confirmDisabled = false,
  isPending = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmPanelProps) {
  return (
    <Card className={cx("mt-4", destructive && "border-danger")}>
      <h3 className="font-semibold">{heading}</h3>
      <p className="mt-2 text-sm text-neutral-600">{description}</p>
      {destructive && (
        <p className="mt-2 text-sm font-semibold text-danger">
          This cannot be undone.
        </p>
      )}
      {children}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant={destructive ? "secondary" : "primary"}
          className={
            destructive
              ? "border-danger text-danger hover:bg-danger hover:text-white"
              : undefined
          }
          disabled={confirmDisabled || isPending}
          onClick={onConfirm}
        >
          {isPending && <Spinner />}
          {isPending ? (pendingLabel ?? confirmLabel) : confirmLabel}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}
