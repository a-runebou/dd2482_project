import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { server } from "../../mocks/server";
import { mockUrl } from "../../mocks/urls";
import {
  groupsPage1Fixture,
  groupsPage2Fixture,
  serviceUnavailableProblem,
} from "../../mocks/fixtures";
import { createQueryClient } from "../../api/queryClient";
import { GroupsList } from "./GroupsList";

const NETWORK_TIMEOUT = { timeout: 3000 };

function renderGroupsList() {
  const client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GroupsList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

/** A GET /groups handler that counts requests and serves the two fixture pages by cursor. */
function countingGroupsHandler(onRequest: (cursor: string | null) => void) {
  return http.get(mockUrl("/groups"), ({ request }) => {
    const cursor = new URL(request.url).searchParams.get("cursor");
    onRequest(cursor);
    if (cursor === null) {
      return HttpResponse.json(groupsPage1Fixture);
    }
    if (cursor === "page2") {
      return HttpResponse.json(groupsPage2Fixture);
    }
    return HttpResponse.json(
      {
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        code: "validation_failed",
      },
      { status: 400, headers: { "content-type": "application/problem+json" } },
    );
  });
}

describe("GroupsList", () => {
  let requestCount: number;
  let cursorsSeen: (string | null)[];

  beforeEach(() => {
    requestCount = 0;
    cursorsSeen = [];
    server.use(
      countingGroupsHandler((cursor) => {
        requestCount += 1;
        cursorsSeen.push(cursor);
      }),
    );
  });

  it("shows a loading state, then the first page's items", async () => {
    renderGroupsList();

    expect(screen.getByRole("status")).toBeInTheDocument();

    expect(
      await screen.findByText("Algorithms study group"),
    ).toBeInTheDocument();
    expect(screen.getByText("Thesis planning")).toBeInTheDocument();
    expect(screen.queryByText("Project kickoff")).not.toBeInTheDocument();
    expect(requestCount).toBe(1);
  });

  it("fetches the second page with the cursor when Load more is clicked, then hides the button", async () => {
    renderGroupsList();

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Project kickoff")).toBeInTheDocument();
    expect(screen.getByText("Open house committee")).toBeInTheDocument();
    expect(screen.getByText("Algorithms study group")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
    expect(requestCount).toBe(2);
    expect(cursorsSeen).toEqual([null, "page2"]);
  });

  it("shows the empty state when there are no groups", async () => {
    server.resetHandlers();
    server.use(
      http.get(mockUrl("/groups"), () => {
        requestCount += 1;
        return HttpResponse.json({ data: [], next_cursor: null });
      }),
    );

    renderGroupsList();

    expect(
      await screen.findByText("You are not in any groups yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create a group" }),
    ).toHaveAttribute("href", "/groups/new");
    expect(requestCount).toBe(1);
  });

  it("shows a retryable notice when a background refresh fails on an empty list", async () => {
    server.resetHandlers();
    server.use(
      http.get(mockUrl("/groups"), () => {
        requestCount += 1;
        // The first load is an empty list; every refresh afterwards fails. Both the refetch and
        // createQueryClient's automatic single network retry must fail to reach the error state.
        if (requestCount === 1) {
          return HttpResponse.json({ data: [], next_cursor: null });
        }
        return HttpResponse.error();
      }),
    );

    const client = renderGroupsList();
    await screen.findByText("You are not in any groups yet.");

    await client.refetchQueries({ queryKey: ["groups", "list"] });

    const alert = await screen.findByRole("alert", {}, NETWORK_TIMEOUT);
    expect(alert).toHaveTextContent(/could not reach the server/i);
    // The empty state stays: a failed refresh must not be mistaken for a list that vanished.
    expect(
      screen.getByText("You are not in any groups yet."),
    ).toBeInTheDocument();
    expect(requestCount).toBe(3);
  });

  it("shows the sign-in message for a 401 unauthenticated problem on the first page", async () => {
    server.resetHandlers();
    server.use(
      http.get(mockUrl("/groups"), () => {
        requestCount += 1;
        return HttpResponse.json(
          {
            type: "about:blank",
            title: "x",
            status: 401,
            code: "unauthenticated",
          },
          {
            status: 401,
            headers: { "content-type": "application/problem+json" },
          },
        );
      }),
    );

    renderGroupsList();

    expect(await screen.findByRole("alert")).toHaveTextContent(/sign in/i);
    expect(requestCount).toBe(1);
  });

  it("keeps the first page visible and shows a retryable error when a later page fails on the network, then loads it on retry", async () => {
    let secondPageAttempts = 0;
    server.resetHandlers();
    server.use(
      http.get(mockUrl("/groups"), ({ request }) => {
        requestCount += 1;
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (cursor === null) {
          return HttpResponse.json(groupsPage1Fixture);
        }
        secondPageAttempts += 1;
        // Fail both the initial attempt and createQueryClient's automatic single network retry,
        // so the UI genuinely reaches the error state before the user clicks Retry.
        if (secondPageAttempts <= 2) {
          return HttpResponse.error();
        }
        return HttpResponse.json(groupsPage2Fixture);
      }),
    );

    renderGroupsList();

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    const alert = await screen.findByRole("alert", {}, NETWORK_TIMEOUT);
    expect(alert).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByText("Algorithms study group")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(
      await screen.findByText("Project kickoff", {}, NETWORK_TIMEOUT),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // 1 first page + 2 failed second-page attempts (original + automatic retry) + 1 successful
    // manual retry.
    expect(requestCount).toBe(4);
  });

  it("renders owner, member and missing-role items as specified", async () => {
    renderGroupsList();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByText("Project kickoff");

    const ownerItem = screen.getByText("Algorithms study group").closest("li");
    expect(ownerItem).not.toBeNull();
    if (ownerItem) {
      expect(within(ownerItem).getByText("Owner")).toBeInTheDocument();
      expect(ownerItem).toHaveTextContent("4 members");
      expect(ownerItem).toHaveTextContent("1 Oct 2026 to 14 Oct 2026");
      expect(ownerItem).toHaveTextContent("Open");
    }

    const memberItem = screen.getByText("Thesis planning").closest("li");
    expect(memberItem).not.toBeNull();
    if (memberItem) {
      expect(within(memberItem).getByText("Member")).toBeInTheDocument();
    }

    const confirmedItem = screen.getByText("Project kickoff").closest("li");
    expect(confirmedItem).not.toBeNull();
    if (confirmedItem) {
      expect(confirmedItem).toHaveTextContent("Confirmed");
    }

    // "3 members" contains the substring "member", so this must check for an element whose
    // exact text is "Owner" or "Member", not a substring/regex match against the whole item.
    const noRoleItem = screen.getByText("Open house committee").closest("li");
    expect(noRoleItem).not.toBeNull();
    if (noRoleItem) {
      expect(within(noRoleItem).queryByText("Owner")).not.toBeInTheDocument();
      expect(within(noRoleItem).queryByText("Member")).not.toBeInTheDocument();
    }

    expect(requestCount).toBe(2);
  });

  it("keeps the groups visible and shows a retryable error when a background refetch fails", async () => {
    const client = renderGroupsList();
    await screen.findByText("Algorithms study group");
    expect(requestCount).toBe(1);

    server.resetHandlers();
    server.use(
      http.get(mockUrl("/groups"), () => {
        requestCount += 1;
        return HttpResponse.json(serviceUnavailableProblem, {
          status: 503,
          headers: { "content-type": "application/problem+json" },
        });
      }),
    );

    // Trigger a background refetch the same way any consumer would: invalidating the query key
    // that groupsInfiniteQueryOptions uses, not a page fetch and not the initial fetch.
    void client.invalidateQueries({ queryKey: ["groups", "list"] });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/temporarily unavailable/i);
    expect(screen.getByText("Algorithms study group")).toBeInTheDocument();
    expect(requestCount).toBe(2);
  });
  it("links each item's name to its detail route", async () => {
    renderGroupsList();

    const link = await screen.findByRole("link", {
      name: "Algorithms study group",
    });
    expect(link).toHaveAttribute("href", "/groups/7fQ2mXk9Lp3R");
    expect(
      screen.getByRole("link", { name: "Thesis planning" }),
    ).toHaveAttribute("href", "/groups/9gR3nYq8Mh4S");
    expect(requestCount).toBe(1);
  });
});
