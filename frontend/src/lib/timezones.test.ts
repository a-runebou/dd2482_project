import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, resolveTimezoneChoice } from "./timezones";

const SUPPORTED = ["Europe/London", "Europe/Stockholm", "UTC"];

describe("resolveTimezoneChoice", () => {
  it("preselects the browser zone when the list supports it", () => {
    const { options, selected } = resolveTimezoneChoice(
      SUPPORTED,
      "Europe/London",
    );

    expect(selected).toBe("Europe/London");
    expect(options).toEqual(SUPPORTED);
  });

  it("falls back to the contract default when the browser zone is missing", () => {
    expect(resolveTimezoneChoice(SUPPORTED, "Mars/Olympus").selected).toBe(
      DEFAULT_TIMEZONE,
    );
    expect(resolveTimezoneChoice(SUPPORTED, undefined).selected).toBe(
      DEFAULT_TIMEZONE,
    );
  });

  // The fallback must still be selectable, even where the runtime's list omits it.
  it("includes the default in the options when the list lacks it", () => {
    const { options, selected } = resolveTimezoneChoice(["UTC"], "UTC");

    expect(selected).toBe("UTC");
    expect(options).toContain(DEFAULT_TIMEZONE);
  });

  it("sorts the options and does not mutate the input", () => {
    const input = ["UTC", "Europe/London"];
    const { options } = resolveTimezoneChoice(input, "UTC");

    expect(options).toEqual([...options].sort());
    expect(input).toEqual(["UTC", "Europe/London"]);
  });
});
