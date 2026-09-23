import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { durationMinutes, formatInstant, formatWindow } from "./instants";

const STOCKHOLM = "Europe/Stockholm";

// As in slots.test.ts: the process runs in a zone that is neither UTC nor the group's, so a
// helper that reached for the runtime default would produce a different label here.
beforeAll(() => {
  vi.stubEnv("TZ", "Pacific/Auckland");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("formatInstant", () => {
  it("runs in a process timezone that is not the group's", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe(
      STOCKHOLM,
    );
  });

  it("formats a known instant in the group's timezone", () => {
    // 12:00Z on 5 October 2026 is 14:00 in Stockholm, which is CEST that day.
    expect(formatInstant("2026-10-05T12:00:00Z", STOCKHOLM)).toBe(
      "Mon 5 Oct 2026, 14:00",
    );
  });

  it("formats the same instant differently in another timezone", () => {
    expect(formatInstant("2026-10-05T12:00:00Z", "UTC")).toBe(
      "Mon 5 Oct 2026, 12:00",
    );
  });

  it("uses the offset in force before the 25 October 2026 change", () => {
    // 00:30Z is still CEST (+02:00), so the local time is 02:30 for the first pass.
    expect(formatInstant("2026-10-25T00:30:00Z", STOCKHOLM)).toBe(
      "Sun 25 Oct 2026, 02:30",
    );
  });

  it("uses the offset in force after the 25 October 2026 change", () => {
    // 01:30Z is CET (+01:00), so the same local label 02:30 comes round a second time.
    expect(formatInstant("2026-10-25T01:30:00Z", STOCKHOLM)).toBe(
      "Sun 25 Oct 2026, 02:30",
    );
  });

  it("rejects something that is not an instant", () => {
    expect(() => formatInstant("not-an-instant", STOCKHOLM)).toThrow();
  });
});

describe("formatWindow", () => {
  it("renders a window inside one local date compactly", () => {
    expect(
      formatWindow("2026-10-05T12:00:00Z", "2026-10-05T13:30:00Z", STOCKHOLM),
    ).toBe("Mon 5 Oct 2026, 14:00 to 15:30");
  });

  it("names both dates when the window crosses local midnight", () => {
    // 21:00Z to 23:00Z is 23:00 on the 5th to 01:00 on the 6th in Stockholm.
    expect(
      formatWindow("2026-10-05T21:00:00Z", "2026-10-05T23:00:00Z", STOCKHOLM),
    ).toBe("Mon 5 Oct 2026, 23:00 to Tue 6 Oct 2026, 01:00");
  });

  it("stays compact across the 25 October 2026 change, which is one local date", () => {
    expect(
      formatWindow("2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", STOCKHOLM),
    ).toBe("Sun 25 Oct 2026, 02:30 to 02:30");
  });
});

describe("durationMinutes", () => {
  it("derives a whole-hour duration", () => {
    expect(
      durationMinutes("2026-10-05T12:00:00Z", "2026-10-05T13:00:00Z"),
    ).toBe(60);
  });

  it("derives a duration in real time across the 25 October 2026 change", () => {
    // 02:30 to 02:30 local, but two hours of real time: the hour repeats.
    expect(
      durationMinutes("2026-10-25T00:30:00Z", "2026-10-25T02:30:00Z"),
    ).toBe(120);
  });

  it("rejects something that is not an instant", () => {
    expect(() => durationMinutes("2026-10-05T12:00:00Z", "later")).toThrow();
  });
});
