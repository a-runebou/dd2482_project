import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import { proposalsConfirmedGroupFixture } from "../../mocks/fixtures";
import {
  resetMockAvailability,
  resetMockGroups,
  resetMockProposals,
} from "../../mocks/handlers";
import { groupQueryOptions } from "../groups/groupQueries";
import { UnconfirmAction } from "./UnconfirmAction";
import { renderWithProviders } from "./testHarness";

const SLUG = proposalsConfirmedGroupFixture.slug;

const path = (suffix: string) => new URL(mockUrl(suffix)).pathname;
const GROUP_PATH = path(`/groups/${SLUG}`);
const CONFIRMATION_PATH = path(`/groups/${SLUG}/confirmation`);

let counts: Record<string, number>;

function countRequest({ request }: { request: Request }) {
  const key = `${request.method} ${new URL(request.url).pathname}`;
  counts[key] = (counts[key] ?? 0) + 1;
}

function countOf(method: string, pathname: string): number {
  return counts[`${method} ${pathname}`] ?? 0;
}

beforeEach(() => {
  counts = {};
  server.events.on("request:start", countRequest);
  resetMockGroups();
  resetMockAvailability();
  resetMockProposals();
});

afterEach(() => {
  server.events.removeListener("request:start", countRequest);
});

function Harness() {
  const groupQuery = useQuery(groupQueryOptions(SLUG));
  return (
    <div>
      <p>State: {groupQuery.data?.group.state ?? "unread"}</p>
      <UnconfirmAction slug={SLUG} />
    </div>
  );
}

describe("UnconfirmAction", () => {
  it("explains that the group reopens and that pending reminders are cancelled", async () => {
    renderWithProviders(<Harness />);
    await screen.findByText("State: confirmed");

    fireEvent.click(
      screen.getByRole("button", { name: /unconfirm this group/i }),
    );

    expect(
      screen.getByRole("heading", { name: /reopen this group\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reminders that have not been sent are cancelled/i),
    ).toBeInTheDocument();
    expect(countOf("DELETE", CONFIRMATION_PATH)).toBe(0);
  });

  it("reopens the group and refreshes its query", async () => {
    renderWithProviders(<Harness />);
    await screen.findByText("State: confirmed");

    fireEvent.click(
      screen.getByRole("button", { name: /unconfirm this group/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /reopen the group/i }));

    await screen.findByText("State: open");
    expect(countOf("DELETE", CONFIRMATION_PATH)).toBe(1);
    expect(countOf("GET", GROUP_PATH)).toBe(2);
  });
});
