import { describe, it, expect } from "vitest";
import type { components } from "./generated/schema";
import { cachedConditionalRead, conditionalRead } from "./conditional";

const PROBLEM = "application/problem+json";

/** A stand-in for one openapi-fetch call, so no network or MSW is involved. */
function ok<T>(data: T, etag?: string) {
  const headers: Record<string, string> = etag === undefined ? {} : { etag };
  return {
    data,
    response: new Response("{}", { status: 200, headers }),
  };
}

function notModified() {
  // A 304 carries no body; openapi-fetch leaves the unparsable empty text as `error`.
  return { error: "", response: new Response(null, { status: 304 }) };
}

describe("conditionalRead", () => {
  it("sends If-None-Match when an ETag is supplied", async () => {
    let sent: Record<string, string> | undefined;
    await conditionalRead('W/"v1"', (headers) => {
      sent = headers;
      return Promise.resolve(ok({ ok: true }));
    });
    expect(sent).toEqual({ "If-None-Match": 'W/"v1"' });
  });

  it("omits If-None-Match when there is no ETag", async () => {
    let sent: Record<string, string> | undefined;
    await conditionalRead(undefined, (headers) => {
      sent = headers;
      return Promise.resolve(ok({ ok: true }));
    });
    expect(sent).toEqual({});
  });

  it("returns the data and the ETag of a 200", async () => {
    await expect(
      conditionalRead(undefined, () => Promise.resolve(ok({ n: 1 }, 'W/"v2"'))),
    ).resolves.toEqual({ kind: "modified", data: { n: 1 }, etag: 'W/"v2"' });
  });

  it("reports a 200 without an ETag as modified with no validator", async () => {
    await expect(
      conditionalRead(undefined, () => Promise.resolve(ok({ n: 1 }))),
    ).resolves.toEqual({ kind: "modified", data: { n: 1 }, etag: undefined });
  });

  it("yields the not-modified outcome for a 304, and does not throw", async () => {
    await expect(
      conditionalRead('W/"v1"', () => Promise.resolve(notModified())),
    ).resolves.toEqual({ kind: "not-modified" });
  });

  it("still normalizes a problem body to kind problem", async () => {
    const body: components["schemas"]["Problem"] = {
      type: "about:blank",
      title: "Not found",
      status: 404,
      code: "group_not_found",
    };
    await expect(
      conditionalRead('W/"v1"', () =>
        Promise.resolve({
          error: body,
          response: new Response(null, {
            status: 404,
            headers: { "content-type": PROBLEM },
          }),
        }),
      ),
    ).rejects.toMatchObject({ kind: "problem", code: "group_not_found" });
  });

  it("classifies a failed fetch as network and any other throw as unexpected", async () => {
    await expect(
      conditionalRead(undefined, () =>
        Promise.reject(new TypeError("Failed to fetch")),
      ),
    ).rejects.toEqual({ kind: "network" });
    await expect(
      conditionalRead(undefined, () => Promise.reject(new Error("boom"))),
    ).rejects.toEqual({ kind: "unexpected" });
  });
});

describe("cachedConditionalRead", () => {
  it("returns the new body and validator when the server sends a 200", async () => {
    const previous = { data: { n: 1 }, etag: 'W/"v1"' };
    await expect(
      cachedConditionalRead(previous, () =>
        Promise.resolve(ok({ n: 2 }, 'W/"v2"')),
      ),
    ).resolves.toEqual({ data: { n: 2 }, etag: 'W/"v2"' });
  });

  it("returns the very same cached object on a 304, so nothing downstream recomputes", async () => {
    const previous = { data: { n: 1 }, etag: 'W/"v1"' };
    const result = await cachedConditionalRead(previous, () =>
      Promise.resolve(notModified()),
    );
    expect(result).toBe(previous);
  });

  it("treats a 304 with nothing cached as unexpected rather than as data", async () => {
    await expect(
      cachedConditionalRead(undefined, () => Promise.resolve(notModified())),
    ).rejects.toEqual({ kind: "unexpected", status: 304 });
  });
});
