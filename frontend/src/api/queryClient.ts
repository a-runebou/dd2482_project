import { QueryClient } from "@tanstack/react-query";

/**
 * A fresh QueryClient. Queries retry only a `network` ApiError, at most once (two attempts
 * total); a `problem` or `unexpected` is never retried. Mutations never retry. Every other
 * option is left at the library default.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          error.kind === "network" && failureCount < 1,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
