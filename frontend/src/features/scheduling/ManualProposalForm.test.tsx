import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import { configFixture, proposalsGroupFixture } from "../../mocks/fixtures";
import {
  resetMockAvailability,
  resetMockGroups,
  resetMockProposals,
} from "../../mocks/handlers";
import { ManualProposalForm } from "./ManualProposalForm";
import { pathCounter, renderWithProviders } from "./testHarness";

const SLUG = proposalsGroupFixture.slug;
const creations = pathCounter(mockUrl(`/groups/${SLUG}/proposals`));

let bodies: unknown[];

beforeEach(() => {
  bodies = [];
  creations.reset();
  server.events.on("request:start", creations.listener);
  resetMockGroups();
  resetMockAvailability();
  resetMockProposals();
});

afterEach(() => {
  server.events.removeListener("request:start", creations.listener);
});

function captureCreations() {
  server.use(
    http.post(mockUrl("/groups/:slug/proposals"), async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(
        {
          id: "d4c3b2a1-0000-4000-8000-0000000000aa",
          start_at: "2026-10-26T00:00:00Z",
          end_at: "2026-10-26T01:00:00Z",
          origin: "manual",
          created_by: proposalsGroupFixture.owner_id,
          votes: { yes: [], maybe: [], no: [] },
          my_vote: null,
          created_at: "2026-09-14T09:00:00Z",
        },
        { status: 201 },
      );
    }),
  );
}

function form() {
  return (
    <ManualProposalForm group={proposalsGroupFixture} config={configFixture} />
  );
}

describe("ManualProposalForm", () => {
  it("offers only the group's own dates and the slots inside its daily window", () => {
    renderWithProviders(form());

    const dates = [
      ...screen.getByLabelText("Date").querySelectorAll("option"),
    ].map((option) => option.value);
    expect(dates).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);

    const starts = [
      ...screen.getByLabelText("Start time").querySelectorAll("option"),
    ].map((option) => option.textContent);
    // 01:00 to 04:00 on an ordinary day is six half-hour slots.
    expect(starts).toEqual([
      "01:00",
      "01:30",
      "02:00",
      "02:30",
      "03:00",
      "03:30",
    ]);
  });

  it("offers the extra slots of the 25 October 2026 local day", () => {
    renderWithProviders(form());

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-10-25" },
    });

    const starts = [
      ...screen.getByLabelText("Start time").querySelectorAll("option"),
    ].map((option) => option.textContent);
    // The hour from 02:00 comes round twice, so the day has eight slots, not six.
    expect(starts).toHaveLength(8);
    expect(starts.filter((label) => label === "02:00")).toHaveLength(2);
  });

  it("converts the local selection to UTC instants after the change", async () => {
    captureCreations();
    renderWithProviders(form());

    // 26 October is CET, so 01:00 local is 00:00Z and an hour later is 01:00Z.
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-10-26" },
    });
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "2026-10-26T00:00:00Z" },
    });
    fireEvent.change(screen.getByLabelText("Duration"), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add proposal" }));

    await waitFor(() => expect(bodies.length).toBe(1));
    expect(bodies[0]).toEqual({
      start_at: "2026-10-26T00:00:00Z",
      end_at: "2026-10-26T01:00:00Z",
      origin: "manual",
    });
  });

  it("converts a window that straddles the change into two hours of real time", async () => {
    captureCreations();
    renderWithProviders(form());

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-10-25" },
    });
    // 02:00 CEST, the first pass through the repeated hour.
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "2026-10-25T00:00:00Z" },
    });
    fireEvent.change(screen.getByLabelText("Duration"), {
      target: { value: "90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add proposal" }));

    await waitFor(() => expect(bodies.length).toBe(1));
    expect(bodies[0]).toEqual({
      start_at: "2026-10-25T00:00:00Z",
      end_at: "2026-10-25T01:30:00Z",
      origin: "manual",
    });
  });

  it("blocks a window running past the daily window's end before any request", async () => {
    captureCreations();
    renderWithProviders(form());

    // 03:30 local on the 24th is the last slot; 90 minutes from it runs past 04:00.
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "2026-10-24T01:30:00Z" },
    });
    fireEvent.change(screen.getByLabelText("Duration"), {
      target: { value: "90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add proposal" }));

    expect(
      await screen.findByText(/ends after the group's daily window/i),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
    expect(creations.count()).toBe(0);
  });

  it("sends one request for a double click", async () => {
    captureCreations();
    renderWithProviders(form());

    const submit = screen.getByRole("button", { name: "Add proposal" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(bodies.length).toBe(1));
    expect(creations.count()).toBe(1);
  });

  it("says the group is confirmed rather than retrying", async () => {
    server.use(
      http.post(mockUrl("/groups/:slug/proposals"), () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "Confirmed.",
            code: "group_confirmed",
          },
          {
            status: 409,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    renderWithProviders(form());
    fireEvent.click(screen.getByRole("button", { name: "Add proposal" }));

    expect(
      await screen.findByText(/this group is confirmed/i),
    ).toBeInTheDocument();
  });

  it("says the window is outside the group's window on slot_not_in_window", async () => {
    server.use(
      http.post(mockUrl("/groups/:slug/proposals"), () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Unprocessable Entity",
            status: 422,
            detail: "Outside.",
            code: "slot_not_in_window",
          },
          {
            status: 422,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    renderWithProviders(form());
    fireEvent.click(screen.getByRole("button", { name: "Add proposal" }));

    expect(
      await screen.findByText(
        /outside the group's date range or daily window/i,
      ),
    ).toBeInTheDocument();
  });
});
