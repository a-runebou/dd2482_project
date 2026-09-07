import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";
import { unwrap } from "./errors";

/**
 * The server-enforced limits and constants, fetched once per session. staleTime and gcTime
 * of Infinity, with no refetch on mount, window focus or reconnect, keep it cached and
 * un-refetched for the life of the session (ARCHITECTURE section 8). Exported so a later
 * shell task can prefetch it at boot.
 */
export const configQueryOptions = queryOptions({
  queryKey: ["config"],
  queryFn: () => unwrap(apiClient.GET("/config")),
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

export function useConfig() {
  return useQuery(configQueryOptions);
}
