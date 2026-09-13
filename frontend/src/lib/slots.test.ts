import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  addMinutes,
  buildSlotGrid,
  generateSlots,
  isGeneratedSlot,
  normalizeInstant,
  slotDate,
  slotLabel,
  slotSet,
} from "./slots";

const STOCKHOLM = "Europe/Stockholm";

// Every function here takes its timezone explicitly and must never consult the process one.
// Running the suite in a zone that is neither UTC nor the group's is what makes that provable:
// a helper that reached for the runtime default would produce different instants here.
// vi.stubEnv rather than a direct process.env write, because the frontend has no Node types
// and unstubAllEnvs restores whatever the runner started with.
beforeAll(() => {
  vi.stubEnv("TZ", "Pacific/Auckland");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("generateSlots", () => {
  it("runs in a process timezone that is not the group's", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe(
      STOCKHOLM,
    );
  });

  it("gives 20 half-hour slots for an 08:00 to 18:00 window on one day", () => {
    const slots = generateSlots(
      "2026-10-05",
      "2026-10-05",
      480,
      1080,
      30,
      STOCKHOLM,
    );

    // 5 October 2026 is CEST, UTC+2, so 08:00 local is 06:00Z.
    expect(slots).toHaveLength(20);
    expect(slots[0]).toBe("2026-10-05T06:00:00Z");
    expect(slots.at(-1)).toBe("2026-10-05T15:30:00Z");
  });

  it("gives 50 slots on 25 October 2026, the 25-hour day in Stockholm", () => {
    const slots = generateSlots(
      "2026-10-25",
      "2026-10-25",
      0,
      1440,
      30,
      STOCKHOLM,
    );

    // Local midnight is 22:00Z the day before (CEST, UTC+2); the next local midnight is
    // 23:00Z (CET, UTC+1). That is 25 real hours, so 50 half-hour slots, not 48.
    expect(slots).toHaveLength(50);
    expect(slots[0]).toBe("2026-10-24T22:00:00Z");
    expect(slots.at(-1)).toBe("2026-10-25T22:30:00Z");
  });

  it("keeps 25 October 2026 contiguous in UTC while the local labels repeat an hour", () => {
    const slots = generateSlots(
      "2026-10-25",
      "2026-10-25",
      0,
      1440,
      30,
      STOCKHOLM,
    );

    for (let i = 1; i < slots.length; i += 1) {
      expect(Date.parse(slots[i]!) - Date.parse(slots[i - 1]!)).toBe(1_800_000);
    }

    const labels = slots.map((slot) => slotLabel(slot, STOCKHOLM));
    expect(labels.filter((label) => label === "02:00")).toHaveLength(2);
    expect(labels.filter((label) => label === "02:30")).toHaveLength(2);
    expect(labels.filter((label) => label === "01:00")).toHaveLength(1);
  });

  it("gives 14 slots for a midnight to 06:00 window across the autumn change", () => {
    const slots = generateSlots(
      "2026-10-25",
      "2026-10-25",
      0,
      360,
      30,
      STOCKHOLM,
    );

    // 22:00Z to 05:00Z is seven real hours for a six-hour local window.
    expect(slots).toHaveLength(14);
    expect(slots[0]).toBe("2026-10-24T22:00:00Z");
    expect(slots.at(-1)).toBe("2026-10-25T04:30:00Z");
  });

  it("gives 46 slots on 29 March 2026, the 23-hour day, and never labels the lost hour", () => {
    const slots = generateSlots(
      "2026-03-29",
      "2026-03-29",
      0,
      1440,
      30,
      STOCKHOLM,
    );

    expect(slots).toHaveLength(46);
    expect(slots[0]).toBe("2026-03-28T23:00:00Z");
    expect(slots.at(-1)).toBe("2026-03-29T21:30:00Z");

    // 02:00 and 02:30 local do not exist on this date; the clocks jump 02:00 to 03:00.
    const labels = slots.map((slot) => slotLabel(slot, STOCKHOLM));
    expect(labels).not.toContain("02:00");
    expect(labels).not.toContain("02:30");
    expect(labels).toContain("01:30");
    expect(labels).toContain("03:00");
  });

  it("includes the 23:30 slot and nothing after it when the window ends at 1440", () => {
    const slots = generateSlots(
      "2026-10-05",
      "2026-10-05",
      1320,
      1440,
      30,
      STOCKHOLM,
    );

    const labels = slots.map((slot) => slotLabel(slot, STOCKHOLM));
    expect(labels).toEqual(["22:00", "22:30", "23:00", "23:30"]);
    expect(slots.at(-1)).toBe("2026-10-05T21:30:00Z");
  });

  it("returns aligned UTC instants ending in Z for a multi-day range", () => {
    const slots = generateSlots(
      "2026-10-24",
      "2026-10-26",
      480,
      1080,
      30,
      STOCKHOLM,
    );

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
      expect(Date.parse(slot) % 1_800_000).toBe(0);
    }
    // Strictly increasing, with no duplicate across the transition day.
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("returns nothing when the end date precedes the start date", () => {
    expect(
      generateSlots("2026-10-05", "2026-10-04", 480, 1080, 30, STOCKHOLM),
    ).toEqual([]);
  });
});

describe("buildSlotGrid", () => {
  it("returns one column per local date and a consistent row count", () => {
    const slots = generateSlots(
      "2026-10-05",
      "2026-10-07",
      480,
      1080,
      30,
      STOCKHOLM,
    );
    const grid = buildSlotGrid(slots, STOCKHOLM);

    expect(grid.columns.map((column) => column.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
    expect(grid.rowLabels).toHaveLength(20);
    expect(grid.rowLabels[0]).toBe("08:00");
    expect(grid.rowLabels.at(-1)).toBe("17:30");
    for (const column of grid.columns) {
      expect(column.slots).toHaveLength(grid.rowLabels.length);
    }
  });

  it("pads the shorter days when one local day has more slots than another", () => {
    const slots = generateSlots(
      "2026-10-24",
      "2026-10-26",
      0,
      1440,
      30,
      STOCKHOLM,
    );
    const grid = buildSlotGrid(slots, STOCKHOLM);

    // The long day dictates the row count; the ordinary days are padded with empty cells.
    expect(grid.rowLabels).toHaveLength(50);
    expect(grid.columns).toHaveLength(3);
    for (const column of grid.columns) {
      expect(column.slots).toHaveLength(50);
    }
    expect(
      grid.columns[0]!.slots.filter((slot) => slot !== undefined),
    ).toHaveLength(48);
    expect(
      grid.columns[1]!.slots.filter((slot) => slot !== undefined),
    ).toHaveLength(50);
  });
});

describe("slot helpers", () => {
  it("labels and dates an instant in the given timezone, not the process one", () => {
    expect(slotLabel("2026-10-05T06:00:00Z", STOCKHOLM)).toBe("08:00");
    expect(slotDate("2026-10-05T06:00:00Z", STOCKHOLM)).toBe("2026-10-05");
    // The same instant is the next day in the process timezone, which must not leak in.
    expect(slotDate("2026-10-05T21:30:00Z", STOCKHOLM)).toBe("2026-10-05");
  });

  it("normalizes an instant to the contract's seconds-and-Z form", () => {
    expect(normalizeInstant("2026-10-05T06:00:00.000Z")).toBe(
      "2026-10-05T06:00:00Z",
    );
    expect(normalizeInstant("2026-10-05T08:00:00+02:00")).toBe(
      "2026-10-05T06:00:00Z",
    );
  });

  it("adds minutes to an instant", () => {
    expect(addMinutes("2026-10-05T06:00:00Z", 30)).toBe("2026-10-05T06:30:00Z");
  });

  it("validates a selected instant against the generated set", () => {
    const allowed = slotSet(
      generateSlots("2026-10-05", "2026-10-05", 480, 1080, 30, STOCKHOLM),
    );

    expect(isGeneratedSlot("2026-10-05T06:00:00Z", allowed)).toBe(true);
    // Same instant, different spelling: still inside the window.
    expect(isGeneratedSlot("2026-10-05T08:00:00+02:00", allowed)).toBe(true);
    // Misaligned, and outside the window.
    expect(isGeneratedSlot("2026-10-05T06:10:00Z", allowed)).toBe(false);
    expect(isGeneratedSlot("2026-10-05T16:00:00Z", allowed)).toBe(false);
  });
});
