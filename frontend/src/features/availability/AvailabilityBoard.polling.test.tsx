import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http, HttpResponse } from "msw";
import { createQueryClient } from "../../api/queryClient";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  dstGroupFixture,
  fastPollingConfigFixture,
} from "../../mocks/fixtures";
import {
  markMockParticipantAvailable,
  resetMockAvailability,
  resetMockGroups,
} from "../../mocks/handlers";
import { AvailabilityBoard } from "./AvailabilityBoard";

/**
 * Polling runs on real timers against a one-second interval from the config fixture, because
 * TanStack Query's refetch interval and its focus manager both live outside React's control
 * and faking time around them would test the fake rather than the loop. The waits below are
 * therefore genuine, which is why this file is deliberately small.
 */
const SLUG = dstGroupFixture.slug;
const INTERVAL_MS = fastPollingConfigFixture.poll_interval_seconds * 1000;

const path = (suffix: string) => new URL(mockUrl(suffix)).pathname;
const MATRIX_PATH = path(`/groups/${SLUG}/availability`);
const ME_PATH = path(`/groups/${SLUG}/availability/me`);

let requestCounts: Record<string, number>;
let matrixStatuses: number[];

function countRequest({ request }: { request: Request }) {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;
  requestCounts[key] = (requestCounts[key] ?? 0) + 1;
}

function countOf(method: string, pathname: string): number {
  return requestCounts[`${method} ${pathname}`] ?? 0;
}

/** The status of every matrix response, so a test can prove a 304 really happened. */
function recordResponse({
  request,
  response,
}: {
  request: Request;
  response: Response;
}) {
  if (new URL(request.url).pathname === MATRIX_PATH) {
    matrixStatuses.push(response.status);
  }
}

beforeEach(() => {
  requestCounts = {};
  matrixStatuses = [];
  server.events.on("request:start", countRequest);
  server.events.on("response:mocked", recordResponse);
  resetMockGroups();
  resetMockAvailability();
  // Every test in this file needs the short interval; the shared fixture keeps the development
  // mock at a realistic one.
  server.use(
    http.get(mockUrl("/config"), () =>
      HttpResponse.json(fastPollingConfigFixture),
    ),
  );
});

afterEach(() => {
  server.events.removeListener("request:start", countRequest);
  server.events.removeListener("response:mocked", recordResponse);
  setVisibility("visible");
  Reflect.deleteProperty(document, "visibilityState");
});

/**
 * Stub the document's visibility and tell the listeners. TanStack Query's focus manager reads
 * `document.visibilityState` on a `visibilitychange` event, and the event is dispatched on the
 * document but listened for on the window, so it has to bubble.
 */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
}

function renderBoard() {
  const queryClient = createQueryClient();
  const router = createMemoryRouter(
    [
      {
        path: "/groups/:slug/availability",
        element: <AvailabilityBoard slug={SLUG} />,
      },
      { path: "/groups/:slug", element: <h1>Group detail</h1> },
    ],
    { initialEntries: [`/groups/${SLUG}/availability`] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function grid(): Promise<HTMLElement> {
  renderBoard();
  return screen.findByRole("grid", { name: /availability grid/i });
}

function slotRows(): HTMLElement[] {
  return screen.getAllByRole("row").slice(1);
}

function cellAt(row: number, column: number): HTMLElement {
  return within(slotRows()[row]!).getAllByRole("gridcell")[column]!;
}

function clickCell(cell: HTMLElement): void {
  fireEvent.pointerDown(cell);
  fireEvent.pointerUp(cell);
}

function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: /save availability/i });
}

/** Wait until the matrix has been read at least `count` times. */
async function matrixReads(count: number): Promise<void> {
  await waitFor(
    () => expect(countOf("GET", MATRIX_PATH)).toBeGreaterThanOrEqual(count),
    { timeout: INTERVAL_MS * 4 },
  );
}

/** Real time, for the one thing that cannot be expressed as waiting for an assertion. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("AvailabilityBoard polling", () => {
  it("refetches the matrix at the interval GET /config serves", async () => {
    await grid();
    expect(countOf("GET", MATRIX_PATH)).toBe(1);

    await matrixReads(3);
  });

  it("leaves the grid untouched when a poll answers 304", async () => {
    await grid();
    const before = cellAt(0, 1).getAttribute("data-heat");

    await matrixReads(2);

    expect(cellAt(0, 1).getAttribute("data-heat")).toBe(before);
    expect(
      screen.getByRole("grid", { name: /availability grid/i }),
    ).toBeVisible();
    // The poll really was conditional: the first read was a 200 and the rest were 304s.
    expect(matrixStatuses[0]).toBe(200);
    expect(matrixStatuses.slice(1)).toContain(304);
  });

  it("shows another member's change once the version has moved", async () => {
    await grid();
    expect(cellAt(0, 0)).toHaveAttribute("data-heat", "0");

    markMockParticipantAvailable(SLUG, 0);

    await waitFor(
      () => expect(cellAt(0, 0)).toHaveAttribute("data-heat", "1"),
      {
        timeout: INTERVAL_MS * 4,
      },
    );
  });

  it("stops polling while the document is hidden and resumes with one refetch", async () => {
    await grid();
    await matrixReads(2);

    setVisibility("hidden");
    const whileHidden = countOf("GET", MATRIX_PATH);
    await wait(INTERVAL_MS * 2.5);
    expect(countOf("GET", MATRIX_PATH)).toBe(whileHidden);

    setVisibility("visible");
    await waitFor(() =>
      expect(countOf("GET", MATRIX_PATH)).toBe(whileHidden + 1),
    );
  });

  it("keeps an unsaved selection, and says so, when a poll brings a change", async () => {
    await grid();
    clickCell(cellAt(0, 1));
    clickCell(cellAt(1, 1));

    markMockParticipantAvailable(SLUG, 0);

    expect(
      await screen.findByText(/changed while you were editing/i, undefined, {
        timeout: INTERVAL_MS * 4,
      }),
    ).toBeInTheDocument();
    expect(cellAt(0, 1)).toHaveAccessibleDescription(
      /Your selection: available\./,
    );
    expect(cellAt(1, 1)).toHaveAccessibleDescription(
      /Your selection: available\./,
    );
    expect(saveButton()).toBeEnabled();
  });

  it("flags, rather than drops, a selected slot the server stops offering", async () => {
    let reads = 0;
    server.use(
      http.get(mockUrl("/groups/:slug/availability"), () => {
        reads += 1;
        if (reads === 1) {
          // Falling through to the default handler, so the grid starts as the fixture's.
          return undefined;
        }
        return HttpResponse.json(
          {
            version: 99,
            // Only the first slot of the first day survives; everything else is gone.
            slots: ["2026-10-23T23:00:00Z"],
            participants: [],
            aggregate: [],
            responded_count: 0,
            member_count: 1,
          },
          { headers: { ETag: 'W/"shrunk"' } },
        );
      }),
    );
    await grid();

    // The second cell of the first row is on the day the shrunken vector no longer offers.
    clickCell(cellAt(0, 1));

    expect(
      await screen.findByText(/no longer offered/i, undefined, {
        timeout: INTERVAL_MS * 4,
      }),
    ).toBeInTheDocument();
    // Nothing was discarded: there is still something to save.
    expect(saveButton()).toBeEnabled();
  });

  it("pauses while a save is in flight and refetches exactly once afterwards", async () => {
    let release: (() => void) | undefined;
    server.use(
      http.put(
        mockUrl("/groups/:slug/availability/me"),
        async ({ request }) => {
          const body = await request.json();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return HttpResponse.json(body);
        },
      ),
    );
    await grid();
    await matrixReads(2);

    clickCell(cellAt(0, 0));
    fireEvent.click(saveButton());
    await waitFor(() => expect(release).toBeDefined());

    const duringSave = countOf("GET", MATRIX_PATH);
    await wait(INTERVAL_MS * 2.5);
    expect(countOf("GET", MATRIX_PATH)).toBe(duringSave);

    release?.();
    await screen.findByText(/availability saved/i);
    // Exactly one refetch follows the save: the invalidation's, and not a poll on top of it.
    expect(countOf("GET", MATRIX_PATH)).toBe(duringSave + 1);
    expect(countOf("GET", ME_PATH)).toBe(2);
  });

  it("keeps the last matrix, and shows no error panel, when a poll fails", async () => {
    let reads = 0;
    server.use(
      http.get(mockUrl("/groups/:slug/availability"), () => {
        reads += 1;
        // One real read, then a poll that fails twice — the request and the one retry the
        // query client allows a network failure — and then recovery.
        return reads === 1 || reads > 3 ? undefined : HttpResponse.error();
      }),
    );
    await grid();
    const before = cellAt(0, 1).getAttribute("data-heat");

    expect(
      await screen.findByText(/may be out of date/i, undefined, {
        timeout: INTERVAL_MS * 6,
      }),
    ).toBeInTheDocument();
    expect(cellAt(0, 1).getAttribute("data-heat")).toBe(before);
    expect(screen.queryByRole("button", { name: /^retry$/i })).toBeNull();

    await waitFor(
      () =>
        expect(
          screen.queryByText(/may be out of date/i),
        ).not.toBeInTheDocument(),
      { timeout: INTERVAL_MS * 6 },
    );
  });
});
