import { describe, it, expect } from "vitest";
import type { components } from "./generated/schema";
import { normalizeError, parseRetryAfter, unwrap } from "./errors";

const PROBLEM = "application/problem+json";

function problemResponse(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(null, {
    status,
    headers: { "content-type": PROBLEM, ...headers },
  });
}

describe("parseRetryAfter", () => {
  it("reads a non-negative integer", () => {
    expect(parseRetryAfter(new Headers({ "retry-after": "30" }))).toBe(30);
    expect(parseRetryAfter(new Headers({ "retry-after": "0" }))).toBe(0);
  });

  it("is undefined when absent", () => {
    expect(parseRetryAfter(new Headers())).toBeUndefined();
  });

  it("is undefined when not an integer", () => {
    expect(
      parseRetryAfter(new Headers({ "retry-after": "12.5" })),
    ).toBeUndefined();
    expect(
      parseRetryAfter(
        new Headers({ "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }),
      ),
    ).toBeUndefined();
    expect(
      parseRetryAfter(new Headers({ "retry-after": "-5" })),
    ).toBeUndefined();
  });
});

describe("normalizeError", () => {
  it("maps a full problem document to kind problem", () => {
    const body: components["schemas"]["Problem"] = {
      type: "https://example.com/probs/validation",
      title: "Validation failed",
      status: 400,
      detail: "One field is wrong.",
      code: "validation_failed",
      errors: [{ field: "email", message: "required" }],
    };
    const result = normalizeError(problemResponse(400), body);
    expect(result).toEqual({
      kind: "problem",
      status: 400,
      code: "validation_failed",
      title: "Validation failed",
      detail: "One field is wrong.",
      errors: [{ field: "email", message: "required" }],
      retryAfterSeconds: undefined,
    });
  });

  it("parses Retry-After into retryAfterSeconds on a problem", () => {
    const body: components["schemas"]["Problem"] = {
      type: "about:blank",
      title: "Service Unavailable",
      status: 503,
      code: "service_unavailable",
    };
    const result = normalizeError(
      problemResponse(503, { "retry-after": "30" }),
      body,
    );
    expect(result.kind).toBe("problem");
    if (result.kind === "problem") {
      expect(result.code).toBe("service_unavailable");
      expect(result.retryAfterSeconds).toBe(30);
    }
  });

  it("treats a problem body with an unknown code as unexpected", () => {
    const body = {
      type: "about:blank",
      title: "Nope",
      status: 418,
      code: "teapot",
    };
    expect(normalizeError(problemResponse(418), body)).toEqual({
      kind: "unexpected",
      status: 418,
    });
  });

  it("treats an application/json (non-problem) body as unexpected", () => {
    const response = new Response(null, {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    const body = {
      code: "validation_failed",
      title: "x",
      status: 400,
      type: "about:blank",
    };
    expect(normalizeError(response, body)).toEqual({
      kind: "unexpected",
      status: 400,
    });
  });

  it("treats an unparsed (invalid JSON) body as unexpected", () => {
    // openapi-fetch leaves the raw text as `error` when JSON.parse throws.
    expect(
      normalizeError(problemResponse(500), "<html>not json</html>"),
    ).toEqual({
      kind: "unexpected",
      status: 500,
    });
  });
});

describe("unwrap", () => {
  it("returns data on an ok response", async () => {
    const response = new Response("{}", { status: 200 });
    await expect(
      unwrap(Promise.resolve({ data: { ok: true }, response })),
    ).resolves.toEqual({
      ok: true,
    });
  });

  it("classifies a failed fetch (TypeError) as network", async () => {
    await expect(
      unwrap(Promise.reject(new TypeError("Failed to fetch"))),
    ).rejects.toEqual({ kind: "network" });
  });

  it("classifies any other thrown value as unexpected", async () => {
    await expect(unwrap(Promise.reject(new Error("boom")))).rejects.toEqual({
      kind: "unexpected",
    });
  });

  it("normalizes an error response body", async () => {
    const body: components["schemas"]["Problem"] = {
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      code: "forbidden",
    };
    const response = new Response(null, {
      status: 403,
      headers: { "content-type": PROBLEM },
    });
    await expect(
      unwrap(Promise.resolve({ error: body, response })),
    ).rejects.toMatchObject({
      kind: "problem",
      code: "forbidden",
      status: 403,
    });
  });
});
