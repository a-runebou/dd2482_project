import { describe, it, expect } from "vitest";
import { isMockingEnabled } from "./mocking";

describe("isMockingEnabled", () => {
  it("is true only for the exact flag 'enabled'", () => {
    expect(isMockingEnabled("enabled")).toBe(true);
  });

  it("is false when the flag is unset", () => {
    expect(isMockingEnabled(undefined)).toBe(false);
  });

  it("is false for any other value", () => {
    expect(isMockingEnabled("")).toBe(false);
    expect(isMockingEnabled("true")).toBe(false);
    expect(isMockingEnabled("ENABLED")).toBe(false);
    expect(isMockingEnabled("disabled")).toBe(false);
  });
});
