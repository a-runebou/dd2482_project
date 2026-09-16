import { describe, expect, it } from "vitest";
import {
  WINDOW_END_DEFAULT,
  WINDOW_START_DEFAULT,
  windowOptions,
} from "./windowOptions";

const MINUTES_PER_DAY = 1440;

describe("windowOptions", () => {
  it("runs the start options from 00:00 to one slot before midnight", () => {
    const { start } = windowOptions(30);

    expect(start.at(0)).toEqual({ minute: 0, label: "00:00" });
    expect(start.at(-1)).toEqual({ minute: 1410, label: "23:30" });
    expect(start).toHaveLength(MINUTES_PER_DAY / 30);
  });

  it("runs the end options from one slot to 24:00", () => {
    const { end } = windowOptions(30);

    expect(end.at(0)).toEqual({ minute: 30, label: "00:30" });
    expect(end.at(-1)).toEqual({ minute: MINUTES_PER_DAY, label: "24:00" });
    expect(end).toHaveLength(MINUTES_PER_DAY / 30);
  });

  it("derives the option count from the configured slot length", () => {
    const { start, end } = windowOptions(60);

    expect(start).toHaveLength(24);
    expect(end).toHaveLength(24);
    expect(start.at(-1)).toEqual({ minute: 1380, label: "23:00" });
    expect(end.at(-1)).toEqual({ minute: MINUTES_PER_DAY, label: "24:00" });
  });

  it("pads the hour and minute of every label to two digits", () => {
    const { start } = windowOptions(30);

    expect(start.map((option) => option.label)).toContain("09:30");
    expect(start.every((option) => /^\d{2}:\d{2}$/.test(option.label))).toBe(
      true,
    );
  });

  it("defaults the window to 08:00 and 18:00", () => {
    expect(WINDOW_START_DEFAULT).toBe(480);
    expect(WINDOW_END_DEFAULT).toBe(1080);
  });
});
