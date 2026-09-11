import { afterEach, describe, expect, it } from "vitest";
import { formatCalendarDate, formatDateRange } from "./date";

// No @types/node in this project; declare just enough of the Node process global to read and
// restore TZ for this one test file, rather than adding a devDependency.
declare const process: { env: { TZ?: string } };

describe("formatCalendarDate", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    // Restore exactly: if TZ was unset before the test, deleting it (rather than assigning
    // "undefined", which Node would coerce to a string) keeps later tests unaffected.
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it("formats a calendar date in en-GB, independent of the runtime's local timezone", () => {
    process.env.TZ = "America/Los_Angeles";

    expect(formatCalendarDate("2026-10-01")).toBe("1 Oct 2026");
    expect(formatCalendarDate("2026-10-31")).toBe("31 Oct 2026");
  });

  it("throws on a malformed date", () => {
    expect(() => formatCalendarDate("2026/10/01")).toThrow();
    expect(() => formatCalendarDate("not-a-date")).toThrow();
  });
});

describe("formatDateRange", () => {
  it("joins two dates as an inclusive range", () => {
    expect(formatDateRange("2026-10-01", "2026-10-31")).toBe(
      "1 Oct 2026 to 31 Oct 2026",
    );
  });
});
