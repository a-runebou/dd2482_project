import { useId, type ReactNode } from "react";

/**
 * What a Field hands to its control. Spreading it is what wires the label, the description
 * and the error together, so a form never has to manage an id or an aria attribute itself.
 */
export interface FieldControlProps {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

interface FieldProps {
  label: ReactNode;
  /** Standing guidance, always announced; not a place for the error message. */
  description?: ReactNode;
  /** Present only when the field is invalid; its presence is what sets aria-invalid. */
  error?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * A label, a control, an optional description and an optional error, wired together.
 *
 * The control is a render prop rather than a child element because the wiring has to reach the
 * control itself: a form passes `{...control}` to whichever of TextInput, Textarea or Select
 * it needs, and nothing else changes.
 */
export function Field({ label, description, error, children }: FieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  // Description first, so the guidance is read before the correction.
  const describedBy = [
    description === undefined ? undefined : descriptionId,
    error === undefined ? undefined : errorId,
  ]
    .filter((value) => value !== undefined)
    .join(" ");

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {description !== undefined && (
        <p id={descriptionId} className="mt-1 text-sm text-neutral-600">
          {description}
        </p>
      )}
      <div className="mt-1">
        {children({
          id,
          "aria-invalid": error === undefined ? undefined : true,
          "aria-describedby": describedBy === "" ? undefined : describedBy,
        })}
      </div>
      {error !== undefined && (
        <p id={errorId} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
