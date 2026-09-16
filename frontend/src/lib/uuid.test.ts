import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuidV4 } from "./uuid";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomUuidV4", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces a version 4, variant 1 UUID", () => {
    expect(randomUuidV4()).toMatch(UUID_V4_PATTERN);
  });

  it("produces distinct values across 100 calls", () => {
    const values = new Set(Array.from({ length: 100 }, () => randomUuidV4()));
    expect(values.size).toBe(100);
  });

  // crypto.randomUUID is unavailable outside a secure context, and the development VM
  // serves plain HTTP (ARCHITECTURE R1), so it must never be reached for.
  it("never calls crypto.randomUUID", () => {
    const spy = vi.spyOn(crypto, "randomUUID");
    randomUuidV4();
    expect(spy).not.toHaveBeenCalled();
  });

  it("derives every byte from crypto.getRandomValues", () => {
    const spy = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        if (array instanceof Uint8Array) {
          array.fill(0xff);
        }
        return array;
      });

    expect(randomUuidV4()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
