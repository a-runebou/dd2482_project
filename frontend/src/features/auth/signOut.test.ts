import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import { configFixture } from "../../mocks/fixtures";
import { createQueryClient } from "../../api/queryClient";
import { configQueryOptions } from "../../api/config";
import { clearSession, getSession, setSession } from "../../api/session";
import { userFixture } from "../../mocks/fixtures";
import { signOut } from "./signOut";

describe("signOut", () => {
  beforeEach(() => {
    server.use(
      http.delete(
        mockUrl("/auth/session"),
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
  });

  it("keeps the configuration query cached but drops user-scoped queries", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(configQueryOptions.queryKey, configFixture);
    queryClient.setQueryData(["groups", "list"], {
      data: [],
      next_cursor: null,
    });

    await signOut(queryClient);

    expect(queryClient.getQueryData(configQueryOptions.queryKey)).toEqual(
      configFixture,
    );
    expect(queryClient.getQueryData(["groups", "list"])).toBeUndefined();
  });

  it("still clears the in-memory session store", async () => {
    setSession("a-token", userFixture);
    const queryClient = createQueryClient();

    await signOut(queryClient);

    expect(getSession()).toBeUndefined();
    clearSession();
  });
});
