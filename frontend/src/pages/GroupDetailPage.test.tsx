import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { server } from "../mocks/server";
import { mockUrl } from "../mocks/urls";
import {
  confirmedGroupFixture,
  confirmedMemberGroupFixture,
  groupConfirmedProblem,
  groupEtag,
  groupNotFoundProblem,
  groupsBySlugFixture,
  memberGroupFixture,
  membersBySlugFixture,
  notFoundProblem,
  notOwnerProblem,
  ownerGroupFixture,
  pendingMemberFixture,
  proposalsConfirmedGroupFixture,
  respondedMemberFixture,
  roleUnknownGroupFixture,
  rotatedInviteUrl,
  serviceUnavailableProblem,
  userFixture,
  versionConflictProblem,
} from "../mocks/fixtures";
import type { components } from "../api/generated/schema";
import { createQueryClient } from "../api/queryClient";
import { clearSession, setSession } from "../api/session";
import { GroupDetailPage } from "./GroupDetailPage";

type GroupPatch = components["schemas"]["GroupPatch"];

interface Counts {
  group: number;
  members: number;
  patch: number;
  deleteGroup: number;
  removeMember: number;
}

interface Recorded {
  patchBodies: GroupPatch[];
  ifMatch: (string | null)[];
  idempotencyKeys: (string | null)[];
  removedUserIds: string[];
}

let counts: Counts;
let recorded: Recorded;

function slugOf(value: string | readonly string[] | undefined): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
}

function problem(body: components["schemas"]["Problem"]) {
  return HttpResponse.json(body, {
    status: body.status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

/**
 * Counting stand-ins for the default handlers. Every test asserts the request count per path,
 * so each one is installed here rather than relying on the shared handlers.
 */
function installCountingHandlers() {
  server.use(
    http.get(mockUrl("/groups/:slug"), ({ params }) => {
      counts.group += 1;
      const group = groupsBySlugFixture[slugOf(params.slug)];
      if (group === undefined) {
        return problem(groupNotFoundProblem);
      }
      return HttpResponse.json(group, { headers: { ETag: groupEtag(group) } });
    }),
    http.get(mockUrl("/groups/:slug/members"), ({ params }) => {
      counts.members += 1;
      const members = membersBySlugFixture[slugOf(params.slug)];
      if (members === undefined) {
        return problem(groupNotFoundProblem);
      }
      return HttpResponse.json(members);
    }),
    http.patch(mockUrl("/groups/:slug"), async ({ params, request }) => {
      counts.patch += 1;
      recorded.ifMatch.push(request.headers.get("If-Match"));
      recorded.idempotencyKeys.push(request.headers.get("Idempotency-Key"));
      const body = (await request.json()) as GroupPatch;
      recorded.patchBodies.push(body);
      const slug = slugOf(params.slug);
      const group = groupsBySlugFixture[slug];
      if (group === undefined) {
        return problem(groupNotFoundProblem);
      }
      const updated = { ...group, name: body.name ?? group.name };
      return HttpResponse.json(
        body.rotate_invite_token === true
          ? { ...updated, invite_url: rotatedInviteUrl(slug) }
          : updated,
        { headers: { ETag: groupEtag(updated) } },
      );
    }),
    http.delete(mockUrl("/groups/:slug"), () => {
      counts.deleteGroup += 1;
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(mockUrl("/groups/:slug/members/:userId"), ({ params }) => {
      counts.removeMember += 1;
      recorded.removedUserIds.push(slugOf(params.userId));
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

function renderDetail(slug: string) {
  const client = createQueryClient();
  const router = createMemoryRouter(
    [
      { path: "/groups", element: <h1>Your groups</h1> },
      { path: "/groups/:slug", element: <GroupDetailPage /> },
    ],
    { initialEntries: [`/groups/${slug}`] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  counts = {
    group: 0,
    members: 0,
    patch: 0,
    deleteGroup: 0,
    removeMember: 0,
  };
  recorded = {
    patchBodies: [],
    ifMatch: [],
    idempotencyKeys: [],
    removedUserIds: [],
  };
  installCountingHandlers();
  setSession("access-token-for-detail", userFixture);
});

afterEach(() => {
  clearSession();
});

describe("GroupDetailPage, the detail view", () => {
  it("renders the name, the range, the window as clock times, the timezone, the state and the member count", async () => {
    renderDetail(ownerGroupFixture.slug);

    expect(
      await screen.findByRole("heading", { name: ownerGroupFixture.name }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 Oct 2026 to 14 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("08:00 to 18:00")).toBeInTheDocument();
    expect(screen.getByText("Europe/Stockholm")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("4 members")).toBeInTheDocument();
    expect(counts.group).toBe(1);
  });

  it("lists every member with their role and whether they have responded", async () => {
    renderDetail(ownerGroupFixture.slug);

    const list = await screen.findByRole("list", { name: "Members" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    expect(within(rows[0]!).getByText("Grace Hopper")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Owner")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Responded")).toBeInTheDocument();

    expect(within(rows[2]!).getByText("Edsger Dijkstra")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Member")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Not responded")).toBeInTheDocument();

    expect(counts.members).toBe(1);
  });

  it("shows a not-found panel with no retry for group_not_found, after one request", async () => {
    renderDetail("zzzzzzzzzzzz");

    expect(
      await screen.findByRole("heading", { name: "Group not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Your groups" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();
    expect(counts.group).toBe(1);
  });

  it("keeps the group details visible when the members query fails", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug/members"), () => {
        counts.members += 1;
        return problem(serviceUnavailableProblem);
      }),
    );

    renderDetail(ownerGroupFixture.slug);

    expect(
      await screen.findByRole("heading", { name: ownerGroupFixture.name }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("08:00 to 18:00")).toBeInTheDocument();
    expect(counts.group).toBe(1);
    expect(counts.members).toBe(1);
  });

  it("keeps the members visible when the group query fails", async () => {
    server.use(
      http.get(mockUrl("/groups/:slug"), () => {
        counts.group += 1;
        return problem(serviceUnavailableProblem);
      }),
    );

    renderDetail(ownerGroupFixture.slug);

    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(counts.group).toBe(1);
    expect(counts.members).toBe(1);
  });
});

describe("GroupDetailPage, role chrome", () => {
  it("shows the owner actions and no leave for an owner", async () => {
    renderDetail(ownerGroupFixture.slug);

    expect(
      await screen.findByRole("button", { name: "Rename" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rotate invite link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete group" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Leave group" }),
    ).not.toBeInTheDocument();
  });

  it("shows leave and no owner actions for a member", async () => {
    renderDetail(memberGroupFixture.slug);

    expect(
      await screen.findByRole("button", { name: "Leave group" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rename" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete group" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rotate invite link" }),
    ).not.toBeInTheDocument();
  });

  it("shows no role-dependent action when my_role is absent", async () => {
    renderDetail(roleUnknownGroupFixture.slug);

    expect(
      await screen.findByRole("heading", {
        name: roleUnknownGroupFixture.name,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rename" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete group" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rotate invite link" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Leave group" }),
    ).not.toBeInTheDocument();
  });
});

describe("GroupDetailPage, rename", () => {
  it("sends only the changed property, with If-Match from the read's ETag", async () => {
    renderDetail(ownerGroupFixture.slug);

    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "Algorithms reading group" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await screen.findByRole("button", { name: "Rename" });

    expect(counts.patch).toBe(1);
    expect(recorded.patchBodies[0]).toEqual({
      name: "Algorithms reading group",
    });
    expect(recorded.ifMatch[0]).toBe(groupEtag(ownerGroupFixture));
    expect(recorded.idempotencyKeys[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("restores the original value on cancel and sends nothing", async () => {
    renderDetail(ownerGroupFixture.slug);

    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "Something else" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.getByLabelText("Group name")).toHaveValue(
      ownerGroupFixture.name,
    );
    expect(counts.patch).toBe(0);
  });
});

describe("GroupDetailPage, invite rotation", () => {
  it("shows the new link and the warning only after rotating", async () => {
    renderDetail(ownerGroupFixture.slug);

    const rotate = await screen.findByRole("button", {
      name: "Rotate invite link",
    });
    expect(
      screen.queryByDisplayValue(rotatedInviteUrl(ownerGroupFixture.slug)),
    ).not.toBeInTheDocument();

    fireEvent.click(rotate);
    fireEvent.click(screen.getByRole("button", { name: "Rotate the link" }));

    expect(
      await screen.findByDisplayValue(rotatedInviteUrl(ownerGroupFixture.slug)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/previous link no longer works/i),
    ).toBeInTheDocument();
    expect(counts.patch).toBe(1);
    expect(recorded.patchBodies[0]).toEqual({ rotate_invite_token: true });
  });
});

describe("GroupDetailPage, deletion", () => {
  it("enables confirm only on an exact, case-sensitive name, then deletes and navigates", async () => {
    const client = renderDetail(ownerGroupFixture.slug);

    fireEvent.click(
      await screen.findByRole("button", { name: "Delete group" }),
    );

    const confirm = screen.getByRole("button", { name: "Delete permanently" });
    expect(confirm).toBeDisabled();

    const field = screen.getByLabelText("Type the group name to confirm");
    fireEvent.change(field, {
      target: { value: ownerGroupFixture.name.toLowerCase() },
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(field, { target: { value: ownerGroupFixture.name } });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);

    expect(
      await screen.findByRole("heading", { name: "Your groups" }),
    ).toBeInTheDocument();
    expect(counts.deleteGroup).toBe(1);
    expect(
      client.getQueryData(["groups", "detail", ownerGroupFixture.slug]),
    ).toBeUndefined();
  });
});

describe("GroupDetailPage, member removal", () => {
  it("removes the named member after a confirmation naming them", async () => {
    renderDetail(ownerGroupFixture.slug);

    fireEvent.click(
      await screen.findByRole("button", {
        name: `Remove ${respondedMemberFixture.display_name}`,
      }),
    );
    expect(
      screen.getByRole("heading", {
        name: `Remove ${respondedMemberFixture.display_name}?`,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await screen.findByRole("button", {
      name: `Remove ${respondedMemberFixture.display_name}`,
    });
    expect(counts.removeMember).toBe(1);
    expect(recorded.removedUserIds).toEqual([respondedMemberFixture.user_id]);
  });

  it("offers no removal on the owner's row", async () => {
    renderDetail(ownerGroupFixture.slug);

    await screen.findByText("Grace Hopper");
    expect(
      screen.queryByRole("button", { name: "Remove Grace Hopper" }),
    ).not.toBeInTheDocument();
  });

  it("treats a 404 as already gone: refetches the members and shows no error", async () => {
    server.use(
      http.delete(mockUrl("/groups/:slug/members/:userId"), () => {
        counts.removeMember += 1;
        return problem(notFoundProblem);
      }),
    );

    renderDetail(ownerGroupFixture.slug);

    fireEvent.click(
      await screen.findByRole("button", {
        name: `Remove ${pendingMemberFixture.display_name}`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await screen.findByRole("button", {
      name: `Remove ${pendingMemberFixture.display_name}`,
    });
    await waitFor(() => {
      expect(counts.members).toBe(2);
    });
    expect(counts.removeMember).toBe(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("GroupDetailPage, leaving", () => {
  it("removes the signed-in user by id and navigates away", async () => {
    renderDetail(memberGroupFixture.slug);

    fireEvent.click(await screen.findByRole("button", { name: "Leave group" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(
      await screen.findByRole("heading", { name: "Your groups" }),
    ).toBeInTheDocument();
    expect(counts.removeMember).toBe(1);
    expect(recorded.removedUserIds).toEqual([userFixture.id]);
  });
});

describe("GroupDetailPage, mutation errors", () => {
  it("offers a refetch on version_conflict and keeps the typed value", async () => {
    server.use(
      http.patch(mockUrl("/groups/:slug"), () => {
        counts.patch += 1;
        return problem(versionConflictProblem);
      }),
    );

    renderDetail(ownerGroupFixture.slug);

    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "Renamed elsewhere" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(
      await screen.findByText(/changed somewhere else/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Group name")).toHaveValue(
      "Renamed elsewhere",
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh the group" }));

    await waitFor(() => {
      expect(counts.group).toBe(2);
    });
    expect(screen.getByLabelText("Group name")).toHaveValue(
      "Renamed elsewhere",
    );
  });

  it("says the group is confirmed on group_confirmed", async () => {
    server.use(
      http.patch(mockUrl("/groups/:slug"), () => {
        counts.patch += 1;
        return problem(groupConfirmedProblem);
      }),
    );

    renderDetail(ownerGroupFixture.slug);

    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "New name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(
      await screen.findByText(/confirmed and can no longer be changed/i),
    ).toBeInTheDocument();
  });

  it("says the action is not permitted on not_owner", async () => {
    server.use(
      http.patch(mockUrl("/groups/:slug"), () => {
        counts.patch += 1;
        return problem(notOwnerProblem);
      }),
    );

    renderDetail(ownerGroupFixture.slug);

    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "New name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(
      await screen.findByText(/not allowed to do that/i),
    ).toBeInTheDocument();
  });

  it("never shows a problem document's title, detail or status", async () => {
    server.use(
      http.patch(mockUrl("/groups/:slug"), () => {
        counts.patch += 1;
        return problem(groupConfirmedProblem);
      }),
    );

    renderDetail(confirmedGroupFixture.slug);

    await screen.findByRole("heading", { name: confirmedGroupFixture.name });
    expect(
      screen.queryByText(groupConfirmedProblem.detail ?? "unreachable"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(groupConfirmedProblem.title),
    ).not.toBeInTheDocument();
  });

  it("shows the confirmed window and the download to a member of a confirmed group", async () => {
    renderDetail(confirmedMemberGroupFixture.slug);

    await screen.findByRole("heading", {
      name: confirmedMemberGroupFixture.name,
    });
    expect(
      screen.getByRole("heading", { name: /confirmed meeting/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sun 25 Oct 2026, 01:00 to 02:30"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /calendar file/i }),
    ).toBeInTheDocument();
    // Unconfirming is the owner's, and this reader is not one.
    expect(
      screen.queryByRole("button", { name: /unconfirm this group/i }),
    ).toBeNull();
    expect(counts.group).toBe(1);
  });

  it("offers unconfirming to the owner of a confirmed group", async () => {
    renderDetail(proposalsConfirmedGroupFixture.slug);

    await screen.findByRole("heading", {
      name: proposalsConfirmedGroupFixture.name,
    });
    expect(
      screen.getByRole("button", { name: /unconfirm this group/i }),
    ).toBeInTheDocument();
    expect(counts.group).toBe(1);
  });
});
