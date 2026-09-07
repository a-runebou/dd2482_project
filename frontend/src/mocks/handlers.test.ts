import { describe, it, expect } from "vitest";
import { resolveBaseUrl } from "../api/baseUrl";

// The default MSW handlers must match the real API base URL, not any origin. A wildcard path
// serves every origin, which would hide a base-URL mistake; an absolute URL under the resolved
// base does not. The .invalid TLD is reserved and never resolves, so the cross-origin request
// can never reach the network: MSW's onUnhandledRequest:"error" fails it before that.
describe("default handlers origin matching", () => {
  const configUrl = `${resolveBaseUrl(
    import.meta.env.VITE_API_BASE_URL,
    globalThis.location.origin,
  )}/config`;

  it("serves GET /config under the resolved base URL", async () => {
    const response = await fetch(configUrl);
    expect(response.status).toBe(200);
  });

  it("does not serve GET /config on a different origin", async () => {
    await expect(
      fetch("https://other-origin.invalid/api/v1/config"),
    ).rejects.toThrow();
  });
});
