import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { apiClient } from "../../api/client";
import { unwrap } from "../../api/errors";
import { randomUuidV4 } from "../../lib/uuid";
import type { components } from "../../api/generated/schema";

type CalendarSource = components["schemas"]["CalendarSource"];
type CalendarSourcePage = components["schemas"]["CalendarSourcePage"];
type CalendarSourceCreate = components["schemas"]["CalendarSourceCreate"];

export const calendarSourcesKey = ["calendar-sources"] as const;

export const calendarSourcesQueryOptions = queryOptions({
  queryKey: calendarSourcesKey,
  queryFn: () =>
    unwrap<CalendarSourcePage>(apiClient.GET("/me/calendar-sources")),
});

function invalidateSources(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: calendarSourcesKey });
}

export function createCalendarSourceMutationOptions(
  queryClient: QueryClient,
) {
  return {
    mutationFn: (body: CalendarSourceCreate) =>
      unwrap<CalendarSource>(
        apiClient.POST("/me/calendar-sources", {
          body,
          params: { header: { "Idempotency-Key": randomUuidV4() } },
        }),
      ),
    onSuccess: () => invalidateSources(queryClient),
  };
}

export function uploadCalendarSourceMutationOptions(
  queryClient: QueryClient,
) {
  return {
    mutationFn: (file: File) =>
      unwrap<CalendarSource>(
        apiClient.POST("/me/calendar-sources/upload", {
          body: { file: file as unknown as string },
          params: { header: { "Idempotency-Key": randomUuidV4() } },
        }),
      ),
    onSuccess: () => invalidateSources(queryClient),
  };
}

export function refreshCalendarSourceMutationOptions(
  queryClient: QueryClient,
) {
  return {
    mutationFn: (sourceId: string) =>
      unwrap<CalendarSource>(
        apiClient.POST("/me/calendar-sources/{sourceId}/refresh", {
          params: {
            path: { sourceId },
            header: { "Idempotency-Key": randomUuidV4() },
          },
        }),
      ),
    onSuccess: () => invalidateSources(queryClient),
  };
}

export function deleteCalendarSourceMutationOptions(
  queryClient: QueryClient,
) {
  return {
    mutationFn: (sourceId: string) =>
      unwrap<void>(
        apiClient.DELETE("/me/calendar-sources/{sourceId}", {
          params: {
            path: { sourceId },
            header: { "Idempotency-Key": randomUuidV4() },
          },
        }),
      ),
    onSuccess: () => invalidateSources(queryClient),
  };
}