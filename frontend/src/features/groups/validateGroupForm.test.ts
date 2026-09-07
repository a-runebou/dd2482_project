import { describe, expect, it } from "vitest";
import { configFixture } from "../../mocks/fixtures";
import { validateGroupForm, type GroupFormValues } from "./validateGroupForm";

function values(overrides: Partial<GroupFormValues> = {}): GroupFormValues {
  return {
    name: "Algorithms study group",
    description: "",
    timezone: "Europe/Stockholm",
    dateStart: "2026-10-01",
    dateEnd: "2026-10-05",
    windowStartMinute: 480,
    windowEndMinute: 1080,
    ...overrides,
  };
}

describe("validateGroupForm", () => {
  it("accepts a well-formed group", () => {
    expect(validateGroupForm(values(), configFixture)).toEqual({});
  });

  it("requires a name with a non-whitespace character", () => {
    expect(validateGroupForm(values({ name: "   " }), configFixture)).toEqual({
      name: "Enter a name for the group.",
    });
  });

  it("requires both dates", () => {
    const errors = validateGroupForm(
      values({ dateStart: "", dateEnd: "" }),
      configFixture,
    );

    expect(errors.date_start).toBe("Choose a start date.");
    expect(errors.date_end).toBe("Choose an end date.");
  });

  it("rejects an end date before the start date", () => {
    const errors = validateGroupForm(
      values({ dateStart: "2026-10-05", dateEnd: "2026-10-04" }),
      configFixture,
    );

    expect(errors.date_end).toBe(
      "The end date cannot be before the start date.",
    );
  });

  it("accepts a range of exactly max_range_days days", () => {
    // configFixture.max_range_days is 13, so 1 October to 13 October inclusive is the limit.
    const errors = validateGroupForm(
      values({ dateStart: "2026-10-01", dateEnd: "2026-10-13" }),
      configFixture,
    );

    expect(errors.date_end).toBeUndefined();
  });

  it("rejects a range one day longer than max_range_days", () => {
    const errors = validateGroupForm(
      values({ dateStart: "2026-10-01", dateEnd: "2026-10-14" }),
      configFixture,
    );

    expect(errors.date_end).toBe(
      `The range cannot be longer than ${configFixture.max_range_days} days.`,
    );
  });

  it("states the configured limit rather than a hard-coded one", () => {
    const errors = validateGroupForm(
      values({ dateStart: "2026-10-01", dateEnd: "2026-10-14" }),
      { ...configFixture, max_range_days: 5 },
    );

    expect(errors.date_end).toContain("5 days");
  });

  it("requires the window start to be before the window end", () => {
    const errors = validateGroupForm(
      values({ windowStartMinute: 1080, windowEndMinute: 1080 }),
      configFixture,
    );

    expect(errors.window_end_minute).toBe(
      "The end of the day must be after the start of the day.",
    );
  });

  it("does not enforce a name length, which the backend owns", () => {
    const errors = validateGroupForm(
      values({ name: "n".repeat(500) }),
      configFixture,
    );

    expect(errors.name).toBeUndefined();
  });
});
