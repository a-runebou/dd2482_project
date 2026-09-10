import { describe, it, expect } from "vitest";
import { resolveBaseUrl } from "./client";

describe("resolveBaseUrl", () => {
  it("uses the configured value when non-empty", () => {
    expect(
      resolveBaseUrl("https://api.example.com/api/v1", "http://localhost:3000"),
    ).toBe("https://api.example.com/api/v1");
  });

  it("falls back to /api/v1 resolved against the origin when unset", () => {
    expect(resolveBaseUrl(undefined, "http://localhost:3000")).toBe(
      "http://localhost:3000/api/v1",
    );
  });

  it("falls back when the configured value is an empty string", () => {
    expect(resolveBaseUrl("", "https://app.schedular.test")).toBe(
      "https://app.schedular.test/api/v1",
    );
  });
});
