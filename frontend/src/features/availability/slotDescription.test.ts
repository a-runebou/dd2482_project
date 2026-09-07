import { describe, it, expect } from "vitest";
import { describeSlot, formatDayLong, formatDayShort } from "./slotDescription";
import type { SlotDetail } from "./availabilityModel";

const detail: SlotDetail = {
  availableNames: ["Alan Turing"],
  preferredNames: ["Grace Hopper"],
  missingNames: ["Barbara Liskov"],
  availableCount: 1,
  preferredCount: 1,
  respondedCount: 3,
};

const empty: SlotDetail = {
  availableNames: [],
  preferredNames: [],
  missingNames: [],
  availableCount: 0,
  preferredCount: 0,
  respondedCount: 0,
};

describe("day labels", () => {
  it("formats a calendar date without routing it through an instant", () => {
    expect(formatDayShort("2026-10-25")).toBe("Sun 25 Oct");
    expect(formatDayLong("2026-10-25")).toBe("Sunday, 25 October 2026");
  });
});

describe("describeSlot", () => {
  it("names who is available, who prefers the slot and who is missing", () => {
    const text = describeSlot("2026-10-25", "02:00", detail, {
      own: "unselected",
      busy: false,
    });

    expect(text).toContain("Sunday, 25 October 2026 at 02:00");
    expect(text).toContain("2 of 3 responded members available");
    expect(text).toContain("1 prefers it");
    expect(text).toContain("Available: Alan Turing.");
    expect(text).toContain("Prefers: Grace Hopper.");
    expect(text).toContain("Not available: Barbara Liskov.");
    expect(text).toContain("Your selection: not selected.");
  });

  it("says so when nobody has responded, rather than showing a zero denominator", () => {
    const text = describeSlot("2026-10-25", "02:00", empty, {
      own: "unselected",
      busy: false,
    });

    expect(text).toContain("Nobody has responded yet.");
    expect(text).not.toContain("of 0");
  });

  it("reports the caller's own state and a busy hint", () => {
    const text = describeSlot("2026-10-25", "02:00", empty, {
      own: "preferred",
      busy: true,
    });

    expect(text).toContain("Busy in your calendar.");
    expect(text).toContain("Your selection: preferred.");
  });
});
