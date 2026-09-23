import { describe, it, expect, afterEach, vi } from "vitest";
import { createQueryClient } from "../../api/queryClient";
import { clearSession, getSession, refreshSession } from "../../api/session";
import { exchangeMagicLinkToken } from "./createSession";
import { signOut } from "./signOut";

afterEach(() => {
  clearSession();
});

/**
 * CLAUDE.md rule 10 is absolute: the access token lives in memory only. A grep proves no source
 * file names a storage API; this proves no code path reaches one at run time, including through
 * a dependency. The whole sign-in, refresh and sign-out cycle runs with every accessor spied on.
 */
describe("web storage", () => {
  it("is never read or written during a sign-in, refresh and sign-out cycle", async () => {
    const spies = {
      localGet: vi.spyOn(window.localStorage, "getItem"),
      localSet: vi.spyOn(window.localStorage, "setItem"),
      sessionGet: vi.spyOn(window.sessionStorage, "getItem"),
      sessionSet: vi.spyOn(window.sessionStorage, "setItem"),
    };

    try {
      const queryClient = createQueryClient();

      await exchangeMagicLinkToken("magic-link-token-3f9ac1d2b7e04a6c");
      expect(getSession()).toBeDefined();

      await refreshSession();
      expect(getSession()).toBeDefined();

      await signOut(queryClient);
      expect(getSession()).toBeUndefined();

      expect(spies.localGet).not.toHaveBeenCalled();
      expect(spies.localSet).not.toHaveBeenCalled();
      expect(spies.sessionGet).not.toHaveBeenCalled();
      expect(spies.sessionSet).not.toHaveBeenCalled();
    } finally {
      for (const spy of Object.values(spies)) {
        spy.mockRestore();
      }
    }
  });
});
