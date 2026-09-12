import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./redirectPath";

describe("safeRedirectPath", () => {
  it("keeps a relative path", () => {
    expect(safeRedirectPath("/groups")).toBe("/groups");
    expect(safeRedirectPath("/join/7fQ2mXk9Lp3R?invite=abc")).toBe(
      "/join/7fQ2mXk9Lp3R?invite=abc",
    );
  });

  it("falls back to / when there is no redirect", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("rejects a protocol-relative path, which is another host", () => {
    expect(safeRedirectPath("//evil.example")).toBe("/");
    expect(safeRedirectPath("//evil.example/groups")).toBe("/");
  });

  it("rejects an absolute URL", () => {
    expect(safeRedirectPath("https://evil.example")).toBe("/");
    expect(safeRedirectPath("http://evil.example/groups")).toBe("/");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects a backslash, which some parsers read as a slash", () => {
    expect(safeRedirectPath("/\\evil.example")).toBe("/");
    expect(safeRedirectPath("\\\\evil.example")).toBe("/");
    expect(safeRedirectPath("/groups\\..\\evil")).toBe("/");
  });

  it("rejects a path that does not start with a slash", () => {
    expect(safeRedirectPath("groups")).toBe("/");
    expect(safeRedirectPath("../groups")).toBe("/");
  });
});
