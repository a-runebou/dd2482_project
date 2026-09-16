import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import { configFixture, serviceUnavailableProblem } from "../mocks/fixtures";
import { createQueryClient } from "./queryClient";
import { useConfig } from "./config";

// Every test builds its own QueryClient so no cache is shared between tests.
function renderUseConfig() {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useConfig(), { wrapper });
}

describe("useConfig", () => {
  let requestCount = 0;

  beforeEach(() => {
    requestCount = 0;
    server.use(
      http.get(mockUrl("/config"), () => {
        requestCount += 1;
        return HttpResponse.json(configFixture);
      }),
    );
  });

  it("returns the server's config values unchanged", async () => {
    const { result } = renderUseConfig();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.max_members).toBe(7);
    expect(result.current.data).toEqual(configFixture);
    expect(requestCount).toBe(1);
  });

  it("de-duplicates concurrent consumers and does not refetch on remount", async () => {
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const first = renderHook(() => useConfig(), { wrapper });
    const second = renderHook(() => useConfig(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    first.unmount();
    second.unmount();

    const remounted = renderHook(() => useConfig(), { wrapper });
    await waitFor(() => expect(remounted.result.current.isSuccess).toBe(true));

    expect(requestCount).toBe(1);
  });

  it("surfaces a 503 problem with retryAfterSeconds and does not retry", async () => {
    server.use(
      http.get(mockUrl("/config"), () => {
        requestCount += 1;
        return HttpResponse.json(serviceUnavailableProblem, {
          status: 503,
          headers: {
            "content-type": "application/problem+json",
            "retry-after": "30",
          },
        });
      }),
    );

    const { result } = renderUseConfig();
    await waitFor(() => expect(result.current.isError).toBe(true));
    const error = result.current.error;
    expect(error?.kind).toBe("problem");
    if (error?.kind === "problem") {
      expect(error.code).toBe("service_unavailable");
      expect(error.retryAfterSeconds).toBe(30);
    }
    expect(requestCount).toBe(1);
  });

  it("classifies a network failure as network after exactly one retry", async () => {
    server.use(
      http.get(mockUrl("/config"), () => {
        requestCount += 1;
        return HttpResponse.error();
      }),
    );

    const { result } = renderUseConfig();
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5000,
    });
    expect(result.current.error?.kind).toBe("network");
    expect(requestCount).toBe(2);
  });
});
