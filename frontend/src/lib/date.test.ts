import { afterEach, describe, expect, it } from "vitest";
import { daysInclusive, formatCalendarDate, formatDateRange } from "./date";

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

describe("daysInclusive", () => {
  it("counts a single day as 1", () => {
    expect(daysInclusive("2026-10-01", "2026-10-01")).toBe(1);
  });

  it("counts across a month end", () => {
    expect(daysInclusive("2026-10-30", "2026-11-02")).toBe(4);
  });

  // 25 October 2026 is the European daylight-saving change; a calendar-date count must
  // ignore it entirely, because the arithmetic never goes through a local instant.
  it("counts across the daylight-saving change without drifting", () => {
    expect(daysInclusive("2026-10-24", "2026-10-26")).toBe(3);
  });

  it("rejects a value that is not a calendar date", () => {
    expect(() => daysInclusive("2026-10-1", "2026-10-02")).toThrow(
      "Not a calendar date: 2026-10-1",
    );
  });
});
