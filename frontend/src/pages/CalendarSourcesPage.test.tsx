import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createQueryClient } from "../api/queryClient";
import { clearSession, setSession } from "../api/session";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import {
  calendarSourceFixture,
  calendarSourceLimitProblem,
  icsParseFailedProblem,
  rateLimitedProblem,
  userFixture,
} from "../mocks/fixtures";
import { resetMockCalendarSources } from "../mocks/handlers";
import { CalendarSourcesPage } from "./CalendarSourcesPage";

function renderPage() {
  const router = createMemoryRouter([
    { path: "/calendar-sources", element: <CalendarSourcesPage /> },
  ], { initialEntries: ["/calendar-sources"] });
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
}

beforeEach(() => {
  setSession("access-token", userFixture);
  resetMockCalendarSources();
});

afterEach(() => {
  clearSession();
  server.resetHandlers();
});

describe("CalendarSourcesPage", () => {
  it("loads existing sources and shows the empty state", async () => {
    renderPage();
    expect(await screen.findByText("KTH schedule")).toBeInTheDocument();

    server.use(http.get(mockUrl("/me/calendar-sources"), () => HttpResponse.json({ data: [], next_cursor: null })));
    const { unmount } = renderPage();
    expect(await screen.findByText("No calendars imported yet.")).toBeInTheDocument();
    unmount();
  });

  it("adds a URL source", async () => {
    renderPage();
    await screen.findByText("KTH schedule");
    fireEvent.change(screen.getByLabelText("Calendar URL"), { target: { value: "https://example.org/feed.ics" } });
    fireEvent.change(screen.getByLabelText(/Label/), { target: { value: "Classes" } });
    fireEvent.click(screen.getByRole("button", { name: "Add URL calendar" }));
    expect(await screen.findByText("Classes")).toBeInTheDocument();
  });

  it("uploads an .ics file", async () => {
    let uploadedFile = false;
    server.use(http.post(mockUrl("/me/calendar-sources/upload"), () => {
      uploadedFile = true;
      return HttpResponse.json(calendarSourceFixture, { status: 201 });
    }));
    renderPage();
    await screen.findByText("KTH schedule");
    const file = new File(["BEGIN:VCALENDAR\nEND:VCALENDAR"], "classes.ics", { type: "text/calendar" });
    fireEvent.change(screen.getByLabelText("ICS file"), { target: { files: [file] } });
    await waitFor(() => expect(uploadedFile).toBe(true));
  });

  it("refreshes and deletes a source", async () => {
    renderPage();
    await screen.findByText("KTH schedule");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByText("Status: ok")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No calendars imported yet.")).toBeInTheDocument();
  });

  it("renders source limit, parse, and rate-limit errors", async () => {
    server.use(
      http.post(mockUrl("/me/calendar-sources"), () => HttpResponse.json(calendarSourceLimitProblem, { status: 409, headers: { "Content-Type": "application/problem+json" } })),
      http.post(mockUrl("/me/calendar-sources/upload"), () => HttpResponse.json(icsParseFailedProblem, { status: 422, headers: { "Content-Type": "application/problem+json" } })),
      http.post(mockUrl("/me/calendar-sources/:sourceId/refresh"), () => HttpResponse.json(rateLimitedProblem, { status: 429, headers: { "Content-Type": "application/problem+json", "Retry-After": "120" } })),
    );
    renderPage();
    await screen.findByText("KTH schedule");
    fireEvent.change(screen.getByLabelText("Calendar URL"), { target: { value: "https://example.org/feed.ics" } });
    fireEvent.click(screen.getByRole("button", { name: "Add URL calendar" }));
    expect(await screen.findByText("You have reached the calendar source limit.")).toBeInTheDocument();
    const file = new File(["bad"], "bad.ics", { type: "text/calendar" });
    fireEvent.change(screen.getByLabelText("ICS file"), { target: { files: [file] } });
    expect(await screen.findByText("That calendar file could not be parsed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Refresh is rate limited. Try again in 2 minutes.")).toBeInTheDocument();
  });
});