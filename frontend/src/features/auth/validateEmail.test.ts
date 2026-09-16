import { describe, expect, it } from "vitest";
import { validateEmail } from "./validateEmail";

describe("validateEmail", () => {
  it("requires a non-empty value", () => {
    expect(validateEmail("")).toBe("Enter your email address.");
  });

  it("requires an @", () => {
    expect(validateEmail("nobody.example.com")).toBe(
      "Enter a valid email address.",
    );
  });

  it("rejects whitespace", () => {
    expect(validateEmail("no body@example.com")).toBe(
      "Enter a valid email address.",
    );
  });

  it("accepts a valid address", () => {
    expect(validateEmail("nobody@example.com")).toBeUndefined();
  });
});
