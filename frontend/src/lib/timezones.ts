/** The default GroupCreate.timezone in contracts/openapi.yaml. */
export const DEFAULT_TIMEZONE = "Europe/Stockholm";

export interface TimezoneChoice {
  options: string[];
  selected: string;
}

/**
 * The timezone options to offer and the one to preselect, given the runtime's supported IANA
 * names and the browser's resolved zone. Pure, so the component supplies both from Intl and
 * the fallback behaviour is testable without stubbing a global.
 *
 * The default is added to the options when the runtime's list omits it, so the preselected
 * value is always selectable.
 */
export function resolveTimezoneChoice(
  supported: readonly string[],
  browserTimezone: string | undefined,
): TimezoneChoice {
  const options = new Set(supported);
  options.add(DEFAULT_TIMEZONE);

  const selected =
    browserTimezone !== undefined && options.has(browserTimezone)
      ? browserTimezone
      : DEFAULT_TIMEZONE;

  return { options: [...options].sort(), selected };
}
