import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  proposalsGroupFixture,
  suggestedProposalFixture,
} from "../../mocks/fixtures";
import {
  resetMockAvailability,
  resetMockGroups,
  resetMockProposals,
} from "../../mocks/handlers";
import { groupQueryOptions } from "../groups/groupQueries";
import { ConfirmProposalAction } from "./ConfirmProposalAction";
import { renderWithProviders } from "./testHarness";

const SLUG = proposalsGroupFixture.slug;
const WINDOW = "Sun 25 Oct 2026, 01:00 to 02:30";

const path = (suffix: string) => new URL(mockUrl(suffix)).pathname;
const GROUP_PATH = path(`/groups/${SLUG}`);
const CONFIRMATION_PATH = path(`/groups/${SLUG}/confirmation`);

let counts: Record<string, number>;
let bodies: unknown[];

function countRequest({ request }: { request: Request }) {
  const key = `${request.method} ${new URL(request.url).pathname}`;
  counts[key] = (counts[key] ?? 0) + 1;
  if (request.method === "POST" && key.endsWith("/confirmation")) {
    void request
      .clone()
      .json()
      .then((body) => bodies.push(body));
  }
}

function countOf(method: string, pathname: string): number {
  return counts[`${method} ${pathname}`] ?? 0;
}

beforeEach(() => {
  counts = {};
  bodies = [];
  server.events.on("request:start", countRequest);
  resetMockGroups();
  resetMockAvailability();
  resetMockProposals();
});

afterEach(() => {
  server.events.removeListener("request:start", countRequest);
});

/** The action beside an observer of the group's own query, which is what must be invalidated. */
function Harness() {
  const groupQuery = useQuery(groupQueryOptions(SLUG));
  return (
    <div>
      <p>State: {groupQuery.data?.group.state ?? "unread"}</p>
      <ConfirmProposalAction
        slug={SLUG}
        proposal={suggestedProposalFixture}
        windowLabel={WINDOW}
      />
    </div>
  );
}

async function openConfirmation(): Promise<void> {
  renderWithProviders(<Harness />);
  await screen.findByText("State: open");
  fireEvent.click(
    screen.getByRole("button", { name: /confirm this proposal/i }),
  );
}

describe("ConfirmProposalAction", () => {
  it("names the window and says that availability and voting will be frozen", async () => {
    await openConfirmation();

    expect(
      screen.getByRole("heading", { name: `Confirm ${WINDOW}?` }),
    ).toBeInTheDocument();
    expect(screen.getByText(/frozen/i)).toBeInTheDocument();
    expect(countOf("POST", CONFIRMATION_PATH)).toBe(0);
  });

  it("sends the proposal id with reminders on by default and reopens the group query", async () => {
    await openConfirmation();

    expect(
      screen.getByRole("checkbox", { name: /send reminders/i }),
    ).toBeChecked();
    fireEvent.click(
      screen.getByRole("button", { name: /confirm this window/i }),
    );

    await screen.findByText("State: confirmed");
    await waitFor(() =>
      expect(bodies).toEqual([
        { proposal_id: suggestedProposalFixture.id, send_reminders: true },
      ]),
    );
    expect(countOf("POST", CONFIRMATION_PATH)).toBe(1);
    // The first read and the one the invalidation triggered.
    expect(countOf("GET", GROUP_PATH)).toBe(2);
  });

  it("sends send_reminders false when the reader turns reminders off", async () => {
    await openConfirmation();

    fireEvent.click(screen.getByRole("checkbox", { name: /send reminders/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /confirm this window/i }),
    );

    await screen.findByText("State: confirmed");
    await waitFor(() =>
      expect(bodies).toEqual([
        { proposal_id: suggestedProposalFixture.id, send_reminders: false },
      ]),
    );
  });

  it("sends nothing when the confirmation is cancelled", async () => {
    await openConfirmation();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("button", { name: /confirm this window/i }),
    ).toBeNull();
    expect(countOf("POST", CONFIRMATION_PATH)).toBe(0);
    expect(countOf("GET", GROUP_PATH)).toBe(1);
  });
});
