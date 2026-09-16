import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http, HttpResponse } from "msw";
import type { components } from "../../api/generated/schema";
import { createQueryClient } from "../../api/queryClient";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  dbCircuitOpenProblem,
  dstConfirmedGroupFixture,
  dstGroupFixture,
  groupConfirmedProblem,
  groupNotFoundProblem,
  serviceUnavailableProblem,
  slotNotInWindowProblem,
  unauthenticatedProblem,
} from "../../mocks/fixtures";
import { resetMockAvailability, resetMockGroups } from "../../mocks/handlers";
import { AvailabilityBoard } from "./AvailabilityBoard";

const SLUG = dstGroupFixture.slug;

// The instants the fixture group's window generates, spelled out rather than computed, so a
// regression in generateSlots shows up here as a wrong request body instead of being hidden by
// the same helper producing the same wrong answer on both sides.
const DAY1_0100 = "2026-10-23T23:00:00Z";
const DAY1_0130 = "2026-10-23T23:30:00Z";
const DAY2_0100 = "2026-10-24T23:00:00Z";
const DAY2_0200_CEST = "2026-10-25T00:00:00Z";

const path = (suffix: string) => new URL(mockUrl(suffix)).pathname;
const MATRIX_PATH = path(`/groups/${SLUG}/availability`);
const ME_PATH = path(`/groups/${SLUG}/availability/me`);
const GROUP_PATH = path(`/groups/${SLUG}`);
const BUSY_PATH = path("/me/busy");

let requestCounts: Record<string, number>;

function countRequest({ request }: { request: Request }) {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;
  requestCounts[key] = (requestCounts[key] ?? 0) + 1;
}

function countOf(method: string, pathname: string): number {
  return requestCounts[`${method} ${pathname}`] ?? 0;
}

beforeEach(() => {
  requestCounts = {};
  server.events.on("request:start", countRequest);
  resetMockGroups();
  resetMockAvailability();
});

afterEach(() => {
  server.events.removeListener("request:start", countRequest);
});

function renderBoard(slug: string = SLUG) {
  const queryClient = createQueryClient();
  const router = createMemoryRouter(
    [
      {
        path: "/groups/:slug/availability",
        element: <AvailabilityBoard slug={slug} />,
      },
      { path: "/groups/:slug", element: <h1>Group detail</h1> },
    ],
    { initialEntries: [`/groups/${slug}/availability`] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** Render the board for the fixture group and wait for the grid to arrive. */
async function grid(): Promise<HTMLElement> {
  renderBoard();
  return screen.findByRole("grid", { name: /availability grid/i });
}

/** Slot rows only; row 0 of the grid is the header row of column names. */
function slotRows(): HTMLElement[] {
  return screen.getAllByRole("row").slice(1);
}

function cellAt(row: number, column: number): HTMLElement {
  return within(slotRows()[row]!).getAllByRole("gridcell")[column]!;
}

/** Cells that stand for a real slot, as opposed to the padding a short local day leaves. */
function slotCells(): HTMLElement[] {
  return screen
    .getAllByRole("gridcell")
    .filter((cell) => cell.getAttribute("aria-disabled") !== "true");
}

/**
 * A click on a cell, as a pointer really delivers it. The grid drives selection from pointer
 * events alone and the keyboard from keydown alone, never from a synthesized click, so that a
 * real browser's pointerdown-then-click pair cannot cycle a cell twice.
 */
function clickCell(cell: HTMLElement): void {
  fireEvent.pointerDown(cell);
  fireEvent.pointerUp(cell);
}

function saveButton(): HTMLElement {
  return screen.getByRole("button", { name: /save availability/i });
}

describe("AvailabilityBoard rendering", () => {
  it("draws one column per local date and the extra cells the clocks change creates", async () => {
    await grid();

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual(["Time", "Sat 24 Oct", "Sun 25 Oct", "Mon 26 Oct"]);

    // Six slots on each ordinary day and eight on the 25th, which runs 25 hours.
    expect(slotCells()).toHaveLength(20);
    expect(slotRows()).toHaveLength(8);
    expect(screen.getAllByRole("gridcell")).toHaveLength(24);

    expect(countOf("GET", MATRIX_PATH)).toBe(1);
    expect(countOf("GET", ME_PATH)).toBe(1);
    expect(countOf("GET", GROUP_PATH)).toBe(1);
    expect(countOf("GET", BUSY_PATH)).toBe(1);
  });

  it("repeats the local hour the autumn change rewinds", async () => {
    await grid();

    const labels = screen
      .getAllByRole("rowheader")
      .map((header) => header.textContent);
    expect(labels).toEqual([
      "01:00",
      "01:30",
      "02:00",
      "02:30",
      "02:00",
      "02:30",
      "03:00",
      "03:30",
    ]);
  });

  it("shades a cell from the aggregate, weighting a preference twice", async () => {
    await grid();

    // One of two responders available; one of two available plus one preferring; one
    // preferring alone. Warmer means more, and a preference outweighs an availability.
    expect(cellAt(0, 1)).toHaveAttribute("data-heat", "1");
    expect(cellAt(2, 1)).toHaveAttribute("data-heat", "3");
    expect(cellAt(3, 1)).toHaveAttribute("data-heat", "2");
    expect(cellAt(0, 0)).toHaveAttribute("data-heat", "0");
  });

  it("names the available, the preferring and the missing members in a cell's description", async () => {
    await grid();

    expect(cellAt(0, 1)).toHaveAccessibleDescription(
      /Available: Grace Hopper\./,
    );
    expect(cellAt(0, 1)).toHaveAccessibleDescription(
      /Not available: Alan Turing\./,
    );
    expect(cellAt(2, 1)).toHaveAccessibleDescription(/Prefers: Grace Hopper\./);
  });

  it("leaves a member who has never responded out of the denominator and the names", async () => {
    await grid();

    expect(cellAt(0, 1)).toHaveAccessibleDescription(
      /1 of 2 responded members available/,
    );
    expect(cellAt(0, 1)).not.toHaveAccessibleDescription(/Edsger Dijkstra/);
  });

  it("shows who is available in the detail panel when a cell is focused", async () => {
    await grid();

    fireEvent.focus(cellAt(2, 1));

    const details = screen.getByRole("region", { name: /slot details/i });
    expect(within(details).getByText(/Grace Hopper/)).toBeInTheDocument();
  });

  it("explains the shades and the three own-selection states in a legend", async () => {
    await grid();

    const legend = screen.getByRole("region", { name: /legend/i });
    expect(within(legend).getByText(/nobody/i)).toBeInTheDocument();
    expect(within(legend).getByText(/^Available$/)).toBeInTheDocument();
    expect(within(legend).getByText(/^Preferred$/)).toBeInTheDocument();
    expect(within(legend).getByText(/^Not selected$/)).toBeInTheDocument();
  });
});

describe("AvailabilityBoard busy blocks", () => {
  it("marks a slot an imported calendar covers and still lets it be selected", async () => {
    await grid();

    // The busy blocks are their own request, so the hint appears a moment after the grid.
    await waitFor(() =>
      expect(cellAt(2, 1)).toHaveAttribute("data-busy", "true"),
    );
    const busyCell = cellAt(2, 1);
    expect(busyCell).toHaveAccessibleDescription(/Busy in your calendar\./);
    expect(busyCell).toBeEnabled();

    clickCell(busyCell);

    expect(busyCell).toHaveAccessibleDescription(/Your selection: available\./);
  });
});

describe("AvailabilityBoard selection", () => {
  it("cycles a cell through unselected, available and preferred on click", async () => {
    await grid();
    const cell = cellAt(0, 0);

    clickCell(cell);
    expect(cell).toHaveAccessibleDescription(/Your selection: available\./);

    clickCell(cell);
    expect(cell).toHaveAccessibleDescription(/Your selection: preferred\./);

    clickCell(cell);
    expect(cell).toHaveAccessibleDescription(/Your selection: not selected\./);
  });

  it("paints a drag uniformly instead of cycling every cell it crosses", async () => {
    await grid();
    const first = cellAt(0, 0);

    // The first cell is already available, so the drag's target is preferred. A drag that
    // cycled each cell would leave the other two merely available.
    clickCell(first);
    fireEvent.pointerDown(first);
    fireEvent.pointerOver(cellAt(1, 0));
    fireEvent.pointerOver(cellAt(2, 0));
    fireEvent.pointerUp(window);

    expect(first).toHaveAccessibleDescription(/Your selection: preferred\./);
    expect(cellAt(1, 0)).toHaveAccessibleDescription(
      /Your selection: preferred\./,
    );
    expect(cellAt(2, 0)).toHaveAccessibleDescription(
      /Your selection: preferred\./,
    );
  });

  it("ends the drag when the pointer is released outside the grid", async () => {
    await grid();

    fireEvent.pointerDown(cellAt(0, 0));
    fireEvent.pointerOver(cellAt(1, 0));
    fireEvent.pointerUp(document.body);
    fireEvent.pointerOver(cellAt(2, 0));

    expect(cellAt(1, 0)).toHaveAccessibleDescription(
      /Your selection: available\./,
    );
    expect(cellAt(2, 0)).toHaveAccessibleDescription(
      /Your selection: not selected\./,
    );
  });

  it("moves between cells with the arrow keys and cycles with the space bar", async () => {
    await grid();
    const start = cellAt(0, 0);

    act(() => start.focus());
    expect(start).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cellAt(0, 1));

    fireEvent.keyDown(cellAt(0, 1), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cellAt(1, 1));

    fireEvent.keyDown(cellAt(1, 1), { key: " " });
    expect(cellAt(1, 1)).toHaveAccessibleDescription(
      /Your selection: available\./,
    );

    // Only the focused cell is in the tab order, so a grid is one stop rather than hundreds.
    expect(cellAt(0, 0)).toHaveAttribute("tabindex", "-1");
  });

  it("does not move focus onto the padding a short local day leaves", async () => {
    await grid();
    const lastOnLongDay = cellAt(7, 1);

    act(() => lastOnLongDay.focus());
    fireEvent.keyDown(lastOnLongDay, { key: "ArrowLeft" });

    expect(document.activeElement).toBe(lastOnLongDay);
  });
});

describe("AvailabilityBoard saving", () => {
  it("sends the selected instants as instants, in the two arrays", async () => {
    let body: components["schemas"]["AvailabilitySelection"] | undefined;
    server.use(
      http.put(
        mockUrl("/groups/:slug/availability/me"),
        async ({ request }) => {
          body = (await request.json()) as typeof body;
          return HttpResponse.json(body);
        },
      ),
    );
    await grid();

    clickCell(cellAt(0, 0));
    clickCell(cellAt(1, 0));
    clickCell(cellAt(1, 0));
    fireEvent.click(saveButton());

    await screen.findByText(/availability saved/i);
    expect(body).toEqual({
      available: [DAY1_0100],
      preferred: [DAY1_0130],
    });
    expect(countOf("PUT", ME_PATH)).toBe(1);
  });

  it("keeps a slot the server stored in both arrays in preferred alone", async () => {
    let body: components["schemas"]["AvailabilitySelection"] | undefined;
    server.use(
      http.get(mockUrl("/groups/:slug/availability/me"), () =>
        HttpResponse.json({
          available: [DAY1_0100, DAY1_0130],
          preferred: [DAY1_0100],
        }),
      ),
      http.put(
        mockUrl("/groups/:slug/availability/me"),
        async ({ request }) => {
          body = (await request.json()) as typeof body;
          return HttpResponse.json(body);
        },
      ),
    );
    await grid();

    expect(cellAt(0, 0)).toHaveAccessibleDescription(
      /Your selection: preferred\./,
    );

    clickCell(cellAt(0, 1));
    fireEvent.click(saveButton());

    await screen.findByText(/availability saved/i);
    expect(body).toEqual({
      available: [DAY1_0130, DAY2_0100],
      preferred: [DAY1_0100],
    });
  });

  it("disables saving until the selection changes and re-disables it after a save", async () => {
    await grid();
    expect(saveButton()).toBeDisabled();

    clickCell(cellAt(0, 0));
    expect(saveButton()).toBeEnabled();

    fireEvent.click(saveButton());
    await screen.findByText(/availability saved/i);

    expect(saveButton()).toBeDisabled();
    expect(countOf("PUT", ME_PATH)).toBe(1);
  });

  it("restores the last saved selection when the change is discarded", async () => {
    await grid();

    clickCell(cellAt(0, 0));
    expect(cellAt(0, 0)).toHaveAccessibleDescription(
      /Your selection: available\./,
    );

    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));

    expect(cellAt(0, 0)).toHaveAccessibleDescription(
      /Your selection: not selected\./,
    );
    expect(saveButton()).toBeDisabled();
    expect(countOf("PUT", ME_PATH)).toBe(0);
  });

  it("sends one request when the save button is clicked twice", async () => {
    await grid();

    clickCell(cellAt(0, 0));
    const save = saveButton();
    fireEvent.click(save);
    fireEvent.click(save);

    await screen.findByText(/availability saved/i);
    expect(countOf("PUT", ME_PATH)).toBe(1);
  });

  it("refetches the matrix after a save, so the heatmap includes the caller", async () => {
    await grid();

    clickCell(cellAt(0, 0));
    fireEvent.click(saveButton());
    await screen.findByText(/availability saved/i);

    expect(countOf("GET", MATRIX_PATH)).toBe(2);
    expect(countOf("GET", ME_PATH)).toBe(2);
  });

  it("keeps the saved selection on screen when the refetch that follows fails", async () => {
    let reads = 0;
    server.use(
      http.get(mockUrl("/groups/:slug/availability/me"), () => {
        reads += 1;
        // The first read seeds the grid; the refetch a save triggers never arrives. The saved
        // selection must come from the write's own response, not from a stale read.
        return reads === 1
          ? HttpResponse.json({ available: [], preferred: [] })
          : HttpResponse.json(dbCircuitOpenProblem, {
              status: 503,
              headers: { "Content-Type": "application/problem+json" },
            });
      }),
    );
    await grid();

    clickCell(cellAt(0, 0));
    fireEvent.click(saveButton());
    await screen.findByText(/availability saved/i);

    expect(cellAt(0, 0)).toHaveAccessibleDescription(
      /Your selection: available\./,
    );
    expect(saveButton()).toBeDisabled();
  });

  it("keeps the grid on screen but stops accepting edits while a save is in flight", async () => {
    server.use(
      http.put(
        mockUrl("/groups/:slug/availability/me"),
        () => new Promise(() => {}),
      ),
    );
    await grid();

    clickCell(cellAt(0, 0));
    fireEvent.click(saveButton());

    await waitFor(() => expect(cellAt(0, 0)).toBeDisabled());
    expect(
      screen.getByRole("grid", { name: /availability grid/i }),
    ).toBeInTheDocument();
    // The save button relabels itself while the request is out.
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /discard changes/i }),
    ).toBeDisabled();
  });

  it("warns before navigating away with unsaved changes", async () => {
    await grid();

    clickCell(cellAt(0, 0));
    fireEvent.click(screen.getByRole("link", { name: dstGroupFixture.name }));

    expect(await screen.findByText(/unsaved changes/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Group detail" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /leave without saving/i }),
    );
    expect(
      await screen.findByRole("heading", { name: "Group detail" }),
    ).toBeInTheDocument();
  });

  it("does not warn when there is nothing unsaved", async () => {
    await grid();

    fireEvent.click(screen.getByRole("link", { name: dstGroupFixture.name }));

    expect(
      await screen.findByRole("heading", { name: "Group detail" }),
    ).toBeInTheDocument();
  });
});

describe("AvailabilityBoard errors", () => {
  it("becomes read-only and says so when the group is already confirmed", async () => {
    renderBoard(dstConfirmedGroupFixture.slug);

    expect(
      await screen.findByText(/confirmed, so availability can no longer/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save availability/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")[0]).toBeDisabled();
  });

  it("becomes read-only when a save is rejected because the group was confirmed", async () => {
    server.use(
      http.put(mockUrl("/groups/:slug/availability/me"), () =>
        HttpResponse.json(groupConfirmedProblem, {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );
    await grid();

    clickCell(cellAt(0, 0));
    fireEvent.click(saveButton());

    // The selection is unsaved at this point, so the wording is the mid-edit one: the work is
    // still on screen and what has changed is that it can no longer be sent.
    expect(
      await screen.findByText(/confirmed while you were editing/i),
    ).toBeInTheDocument();
    expect(cellAt(0, 0)).toBeDisabled();
  });

  it("offers to reconcile, without dropping anything, when a slot is out of the window", async () => {
    server.use(
      http.put(mockUrl("/groups/:slug/availability/me"), () =>
        HttpResponse.json(slotNotInWindowProblem, {
          status: 422,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );
    await grid();

    clickCell(cellAt(0, 0));
    fireEvent.click(saveButton());

    expect(
      await screen.findByText(/no longer inside the group's window/i),
    ).toBeInTheDocument();
    // Nothing was silently discarded: the selection is still on screen.
    expect(cellAt(0, 0)).toHaveAccessibleDescription(
      /Your selection: available\./,
    );

    fireEvent.click(screen.getByRole("button", { name: /reload the grid/i }));
    await screen.findByRole("grid", { name: /availability grid/i });
    expect(countOf("GET", MATRIX_PATH)).toBe(2);
  });

  it("shows the not-found panel, and no roster, for a group that is not visible", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug"), () =>
        HttpResponse.json(groupNotFoundProblem, {
          status: 404,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );
    renderBoard();

    expect(
      await screen.findByRole("heading", { name: /group not found/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("asks the visitor to sign in when the matrix answers unauthenticated", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/availability"), () =>
        HttpResponse.json(unauthenticatedProblem, {
          status: 401,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );
    renderBoard();

    expect(
      await screen.findByText(/please sign in to see this/i),
    ).toBeInTheDocument();
  });

  it("keeps the unsaved selection through a db_circuit_open failure and its retry", async () => {
    let attempts = 0;
    // The override has to stand in for the stored selection too, because the refetch that
    // follows a successful save reads it back and would otherwise see the untouched default.
    let stored: components["schemas"]["AvailabilitySelection"] = {
      available: [],
      preferred: [],
    };
    server.use(
      http.get(mockUrl("/groups/:slug/availability/me"), () =>
        HttpResponse.json(stored),
      ),
      http.put(
        mockUrl("/groups/:slug/availability/me"),
        async ({ request }) => {
          attempts += 1;
          if (attempts === 1) {
            return HttpResponse.json(dbCircuitOpenProblem, {
              status: 503,
              headers: {
                "Content-Type": "application/problem+json",
                "Retry-After": "30",
              },
            });
          }
          stored = (await request.json()) as typeof stored;
          return HttpResponse.json(stored);
        },
      ),
    );
    await grid();

    clickCell(cellAt(0, 0));
    fireEvent.click(saveButton());

    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(cellAt(0, 0)).toHaveAccessibleDescription(
      /Your selection: available\./,
    );

    fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));

    await screen.findByText(/availability saved/i);
    expect(cellAt(0, 0)).toHaveAccessibleDescription(
      /Your selection: available\./,
    );
    expect(countOf("PUT", ME_PATH)).toBe(2);
  });

  it("falls back to the shared notice for a code with no wording of its own", async () => {
    server.use(
      http.put(mockUrl("/groups/:slug/availability/me"), () =>
        HttpResponse.json(serviceUnavailableProblem, {
          status: 503,
          headers: { "Content-Type": "application/problem+json" },
        }),
      ),
    );
    await grid();

    clickCell(cellAt(0, 0));
    fireEvent.click(saveButton());

    expect(
      await screen.findByText(/temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^retry$/i })).toBeEnabled();
  });
});

describe("AvailabilityBoard reconciliation", () => {
  it("renders the server's slot vector and says so when it differs from the generated one", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/availability"), () =>
        HttpResponse.json({
          version: 5,
          slots: [DAY1_0100, DAY1_0130, DAY2_0100, DAY2_0200_CEST],
          participants: [],
          aggregate: [],
          responded_count: 0,
          member_count: 1,
        }),
      ),
    );
    await grid();

    expect(slotCells()).toHaveLength(4);
    expect(
      await screen.findByText(
        /differs from the slots this browser worked out/i,
      ),
    ).toBeInTheDocument();
    // The notice is not a failure state: the grid is still there and still usable.
    expect(saveButton()).toBeDisabled();
    clickCell(cellAt(0, 0));
    expect(saveButton()).toBeEnabled();
  });

  it("says nothing when the server and the browser agree", async () => {
    await grid();

    expect(
      screen.queryByText(/differs from the slots this browser worked out/i),
    ).not.toBeInTheDocument();
  });
});
