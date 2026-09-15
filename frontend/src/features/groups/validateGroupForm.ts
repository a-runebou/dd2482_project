import type { components } from "../../api/generated/schema";
import { daysInclusive } from "../../lib/date";

type Config = components["schemas"]["Config"];

/** The form's own state. Dates are already contract calendar dates, as <input type="date"> emits. */
export interface GroupFormValues {
  name: string;
  description: string;
  timezone: string;
  dateStart: string;
  dateEnd: string;
  windowStartMinute: number;
  windowEndMinute: number;
}

/**
 * Errors are keyed by GroupCreate property name, so a server validation_failed entry whose
 * field names a property lands in the same place as the equivalent UX error.
 */
export type GroupFormField =
  | "name"
  | "description"
  | "timezone"
  | "date_start"
  | "date_end"
  | "window_start_minute"
  | "window_end_minute";

export type GroupFormErrors = Partial<Record<GroupFormField, string>>;

/**
 * UX-only validation (CLAUDE.md rule 6): enough to avoid an obviously doomed request, no more.
 * The schema's length limits are the backend's to enforce and are deliberately not duplicated
 * here; the range limit is read from GET /config and never hard-coded (rule 7).
 */
export function validateGroupForm(
  values: GroupFormValues,
  config: Config,
): GroupFormErrors {
  const errors: GroupFormErrors = {};

  if (values.name.trim() === "") {
    errors.name = "Enter a name for the group.";
  }

  if (values.dateStart === "") {
    errors.date_start = "Choose a start date.";
  }

  if (values.dateEnd === "") {
    errors.date_end = "Choose an end date.";
  } else if (values.dateStart !== "") {
    const days = daysInclusive(values.dateStart, values.dateEnd);
    if (days < 1) {
      errors.date_end = "The end date cannot be before the start date.";
    } else if (days > config.max_range_days) {
      errors.date_end = `The range cannot be longer than ${config.max_range_days} days.`;
    }
  }

  if (values.windowStartMinute >= values.windowEndMinute) {
    errors.window_end_minute =
      "The end of the day must be after the start of the day.";
  }

  return errors;
}
