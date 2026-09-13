import type { components } from "../api/generated/schema";

// Values are deliberately unlike ARCHITECTURE section 8 (for example max_members 7),
// to prove the client returns whatever the server sends rather than any built-in default.
export const configFixture: components["schemas"]["Config"] = {
  slot_minutes: 30,
  max_range_days: 13,
  max_members: 7,
  max_groups_per_user: 3,
  max_proposals_per_group: 4,
  max_calendar_sources: 2,
  max_ics_bytes: 1024,
  max_ics_events: 9,
  min_duration_minutes: 30,
  max_duration_minutes: 90,
  reminder_lead_hours: 1,
  poll_interval_seconds: 5,
  environment: "development",
  build_sha: "test-sha",
};

export const serviceUnavailableProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Service Unavailable",
  status: 503,
  detail: "A dependency is down.",
  code: "service_unavailable",
};

// One owner group, one member group, one confirmed group and one group without my_role
// (Group.my_role is optional; a missing key, not a fallback, is what the UI must render).
export const ownerGroupFixture: components["schemas"]["Group"] = {
  slug: "7fQ2mXk9Lp3R",
  name: "Algorithms study group",
  owner_id: "b6e1d1d0-1f0a-4a3b-8c2e-111111111111",
  timezone: "Europe/Stockholm",
  date_start: "2026-10-01",
  date_end: "2026-10-14",
  window_start_minute: 480,
  window_end_minute: 1080,
  slot_minutes: 30,
  state: "open",
  member_count: 4,
  my_role: "owner",
  version: 3,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-05T10:00:00Z",
};

export const memberGroupFixture: components["schemas"]["Group"] = {
  slug: "9gR3nYq8Mh4S",
  name: "Thesis planning",
  owner_id: "b6e1d1d0-1f0a-4a3b-8c2e-222222222222",
  timezone: "Europe/Stockholm",
  date_start: "2026-11-01",
  date_end: "2026-11-07",
  window_start_minute: 540,
  window_end_minute: 1020,
  slot_minutes: 30,
  state: "open",
  member_count: 2,
  my_role: "member",
  version: 1,
  created_at: "2026-09-02T09:00:00Z",
  updated_at: "2026-09-02T09:00:00Z",
};

export const confirmedGroupFixture: components["schemas"]["Group"] = {
  slug: "2hT5pDn9Kf6V",
  name: "Project kickoff",
  owner_id: "b6e1d1d0-1f0a-4a3b-8c2e-333333333333",
  timezone: "Europe/Stockholm",
  date_start: "2026-10-05",
  date_end: "2026-10-05",
  window_start_minute: 480,
  window_end_minute: 1020,
  slot_minutes: 30,
  state: "confirmed",
  member_count: 5,
  my_role: "member",
  version: 6,
  created_at: "2026-08-20T08:00:00Z",
  updated_at: "2026-08-25T08:00:00Z",
};

export const roleUnknownGroupFixture: components["schemas"]["Group"] = {
  slug: "3jU6qEm2Ng7W",
  name: "Open house committee",
  owner_id: "b6e1d1d0-1f0a-4a3b-8c2e-444444444444",
  timezone: "Europe/Stockholm",
  date_start: "2026-12-01",
  date_end: "2026-12-03",
  window_start_minute: 480,
  window_end_minute: 1020,
  slot_minutes: 30,
  state: "archived",
  member_count: 3,
  version: 2,
  created_at: "2026-07-01T08:00:00Z",
  updated_at: "2026-07-10T08:00:00Z",
};

export const groupsPage1Fixture: components["schemas"]["GroupPage"] = {
  data: [ownerGroupFixture, memberGroupFixture],
  next_cursor: "page2",
};

export const groupsPage2Fixture: components["schemas"]["GroupPage"] = {
  data: [confirmedGroupFixture, roleUnknownGroupFixture],
  next_cursor: null,
};

export const validationFailedProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Bad Request",
  status: 400,
  detail: "Unknown cursor.",
  code: "validation_failed",
};

// The group POST /groups invents. Slug matches the contract's base58 pattern; the invite token
// is 32 characters, the shortest the task allows, so a test asserting a minimum is meaningful.
export const createdGroupSlug = "5kW8rFj4Qz7X";
export const createdGroupInviteToken = "n7Qw2vK9pR4tYs6bZ1cM3dH5gJ8kL0xA";

/**
 * A GroupWithInvite echoing what the caller asked for, with the server-owned fields the client
 * cannot know. The invite URL has the shape ARCHITECTURE 6.5 defines and points at the frontend
 * origin, not the API.
 */
export function createdGroupFixture(
  body: components["schemas"]["GroupCreate"],
): components["schemas"]["GroupWithInvite"] {
  return {
    slug: createdGroupSlug,
    name: body.name,
    description: body.description ?? null,
    owner_id: "b6e1d1d0-1f0a-4a3b-8c2e-555555555555",
    timezone: body.timezone ?? "Europe/Stockholm",
    date_start: body.date_start,
    date_end: body.date_end,
    window_start_minute: body.window_start_minute,
    window_end_minute: body.window_end_minute,
    slot_minutes: 30,
    state: "open",
    member_count: 1,
    my_role: "owner",
    version: 1,
    created_at: "2026-09-12T09:00:00Z",
    updated_at: "2026-09-12T09:00:00Z",
    invite_url: `${globalThis.location.origin}/join/${createdGroupSlug}?invite=${createdGroupInviteToken}`,
  };
}

// The signed-in user. display_name is deliberately distinctive so a test can assert that the
// chrome renders the name the server sent rather than the e-mail or any placeholder.
export const userFixture: components["schemas"]["User"] = {
  id: "b6e1d1d0-1f0a-4a3b-8c2e-777777777777",
  email: "ada@example.com",
  display_name: "Ada Lovelace",
  timezone: "Europe/Stockholm",
  notify_email_default: true,
  created_at: "2026-08-01T08:00:00Z",
};

// Two distinct access tokens, so a test can tell an exchanged token from a refreshed one and
// prove the retry carried the new one.
export const exchangedSessionFixture: components["schemas"]["SessionResponse"] =
  {
    access_token: "access-token-from-exchange",
    token_type: "Bearer",
    expires_in: 900,
    user: userFixture,
  };

export const refreshedSessionFixture: components["schemas"]["SessionResponse"] =
  {
    access_token: "access-token-from-refresh",
    token_type: "Bearer",
    expires_in: 900,
    user: userFixture,
  };

export const unauthenticatedProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Unauthorized",
  status: 401,
  detail: "No credentials.",
  code: "unauthenticated",
};

export const tokenExpiredProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Unauthorized",
  status: 401,
  detail: "The access token has expired.",
  code: "token_expired",
};

// --- Group detail -----------------------------------------------------------------------

type Member = components["schemas"]["Member"];
type Group = components["schemas"]["Group"];

/**
 * The mock ETag. The contract calls it "derived from the group version" and says nothing more,
 * so the shape here is deliberately opaque and not reconstructible from the body: a test that
 * asserts If-Match is proving the client echoed the header it was given rather than rebuilding
 * a string from `version`.
 */
export function groupEtag(group: Group): string {
  return `W/"${group.slug}-v${group.version}"`;
}

export const ownerMemberFixture: Member = {
  user_id: ownerGroupFixture.owner_id,
  display_name: "Grace Hopper",
  role: "owner",
  responded: true,
  joined_at: "2026-09-01T10:00:00Z",
};

export const respondedMemberFixture: Member = {
  user_id: "b6e1d1d0-1f0a-4a3b-8c2e-888888888888",
  display_name: "Alan Turing",
  role: "member",
  responded: true,
  joined_at: "2026-09-02T10:00:00Z",
};

export const pendingMemberFixture: Member = {
  user_id: "b6e1d1d0-1f0a-4a3b-8c2e-999999999999",
  display_name: "Edsger Dijkstra",
  role: "member",
  responded: false,
  joined_at: "2026-09-03T10:00:00Z",
};

export const ownerMembersPageFixture: components["schemas"]["MemberPage"] = {
  data: [ownerMemberFixture, respondedMemberFixture, pendingMemberFixture],
  next_cursor: null,
};

// The member group's roster contains the signed-in user as an ordinary member, so a test can
// exercise leaving: the user id comes from the session store, not from the roster.
export const memberGroupOwnerFixture: Member = {
  user_id: memberGroupFixture.owner_id,
  display_name: "Barbara Liskov",
  role: "owner",
  responded: true,
  joined_at: "2026-09-02T09:00:00Z",
};

export const selfMemberFixture: Member = {
  user_id: userFixture.id,
  display_name: userFixture.display_name,
  role: "member",
  responded: false,
  joined_at: "2026-09-04T09:00:00Z",
};

export const memberGroupMembersPageFixture: components["schemas"]["MemberPage"] =
  {
    data: [memberGroupOwnerFixture, selfMemberFixture],
    next_cursor: null,
  };

/** Every group a detail handler can serve, by slug. */
export const groupsBySlugFixture: Record<string, Group> = {
  [ownerGroupFixture.slug]: ownerGroupFixture,
  [memberGroupFixture.slug]: memberGroupFixture,
  [confirmedGroupFixture.slug]: confirmedGroupFixture,
  [roleUnknownGroupFixture.slug]: roleUnknownGroupFixture,
};

export const membersBySlugFixture: Record<
  string,
  components["schemas"]["MemberPage"]
> = {
  [ownerGroupFixture.slug]: ownerMembersPageFixture,
  [memberGroupFixture.slug]: memberGroupMembersPageFixture,
  [confirmedGroupFixture.slug]: memberGroupMembersPageFixture,
  [roleUnknownGroupFixture.slug]: ownerMembersPageFixture,
};

/** The invite URL a rotation answers with. Distinct from the creation one, so a test can tell. */
export const rotatedInviteToken = "q2Zx7wB5nT8mV1cJ4hK6rD9sG3fP0aLe";

export function rotatedInviteUrl(slug: string): string {
  return `${globalThis.location.origin}/join/${slug}?invite=${rotatedInviteToken}`;
}

export const groupNotFoundProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Not Found",
  status: 404,
  detail: "No such group.",
  code: "group_not_found",
};

export const notFoundProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Not Found",
  status: 404,
  detail: "No such member.",
  code: "not_found",
};

export const versionConflictProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Precondition Failed",
  status: 412,
  detail: "The group has changed.",
  code: "version_conflict",
};

export const groupConfirmedProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Conflict",
  status: 409,
  detail: "The group is confirmed.",
  code: "group_confirmed",
};

export const notOwnerProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Forbidden",
  status: 403,
  detail: "Owner only.",
  code: "not_owner",
};
