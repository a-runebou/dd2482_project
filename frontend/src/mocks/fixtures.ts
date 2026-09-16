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
  ics_poll_interval_hours: 2,
  manual_refresh_cooldown_seconds: 11,
  reminder_lead_hours: 1,
  access_token_ttl_seconds: 60,
  refresh_token_ttl_days: 3,
  magic_link_ttl_seconds: 45,
  poll_interval_seconds: 5,
  environment: "development",
  build_sha: "test-sha",
};

/**
 * The same configuration with a one-second polling interval, for tests of the availability
 * grid's polling: they run on real timers, so the interval has to be short enough to wait for
 * and still be the integer number of seconds the contract's Config schema types it as.
 */
export const fastPollingConfigFixture: components["schemas"]["Config"] = {
  ...configFixture,
  poll_interval_seconds: 1,
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

/** A group with no confirmed proposal, asked for its event. Only the export answers this. */
export const groupNotConfirmedProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Conflict",
  status: 409,
  detail: "The group is not confirmed.",
  code: "group_not_confirmed",
};

export const notOwnerProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Forbidden",
  status: 403,
  detail: "Owner only.",
  code: "not_owner",
};

// --- Availability -----------------------------------------------------------------------

type ParticipantAvailability = components["schemas"]["ParticipantAvailability"];
type BusyBlock = components["schemas"]["BusyBlock"];

/**
 * A group whose range spans 24 to 26 October 2026, so the daylight-saving change on the 25th is
 * exercised by every test that touches it. The daily window is 01:00 to 04:00 local, which
 * brackets the moment Europe/Stockholm rewinds 03:00 to 02:00: the 24th and the 26th have six
 * slots each and the 25th has eight, and the local labels 02:00 and 02:30 appear twice on it.
 */
export const dstGroupFixture: Group = {
  slug: "6mN4sGh7Rt2Y",
  name: "Clocks-change workshop",
  description: "Deliberately straddles the 25 October 2026 transition.",
  owner_id: "b6e1d1d0-1f0a-4a3b-8c2e-aaaaaaaaaaaa",
  timezone: "Europe/Stockholm",
  date_start: "2026-10-24",
  date_end: "2026-10-26",
  window_start_minute: 60,
  window_end_minute: 240,
  slot_minutes: 30,
  state: "open",
  member_count: 4,
  my_role: "member",
  version: 5,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-06T08:00:00Z",
};

/** The same group, confirmed, so the read-only branch has something to render. */
export const dstConfirmedGroupFixture: Group = {
  ...dstGroupFixture,
  slug: "8pQ1tHj5Wz3B",
  name: "Clocks-change retrospective",
  state: "confirmed",
  version: 9,
};

/**
 * The other members' responses, as indices into the generated slot vector. Index 6 is 01:00 on
 * the 25th, so 8 and 9 are the first pass through 02:00 and 02:30, the hour that repeats.
 *
 * Every combination the contract allows is present: two members who responded and marked slots,
 * one who responded and marked nothing, and one who has never responded at all. The last is what
 * proves the heatmap denominator counts responders rather than members.
 */
export const dstParticipantsFixture: ParticipantAvailability[] = [
  {
    user_id: dstGroupFixture.owner_id,
    display_name: "Grace Hopper",
    responded: true,
    available: [6, 7],
    preferred: [8, 9],
  },
  {
    user_id: "b6e1d1d0-1f0a-4a3b-8c2e-bbbbbbbbbbbb",
    display_name: "Alan Turing",
    responded: true,
    available: [7, 8],
    preferred: [],
  },
  {
    user_id: "b6e1d1d0-1f0a-4a3b-8c2e-cccccccccccc",
    display_name: "Edsger Dijkstra",
    responded: false,
    available: [],
    preferred: [],
  },
];

/** One imported busy block, covering 02:00 to 02:30 CEST on the 25th: slot index 8. */
export const dstBusyFixture: BusyBlock[] = [
  {
    start_at: "2026-10-25T00:00:00Z",
    end_at: "2026-10-25T00:30:00Z",
    source_id: "b6e1d1d0-1f0a-4a3b-8c2e-dddddddddddd",
  },
];

export const dstMembersPageFixture: components["schemas"]["MemberPage"] = {
  data: [
    {
      user_id: dstGroupFixture.owner_id,
      display_name: "Grace Hopper",
      role: "owner",
      responded: true,
      joined_at: "2026-09-01T08:00:00Z",
    },
    {
      user_id: dstParticipantsFixture[1]!.user_id,
      display_name: "Alan Turing",
      role: "member",
      responded: true,
      joined_at: "2026-09-01T09:00:00Z",
    },
    {
      user_id: dstParticipantsFixture[2]!.user_id,
      display_name: "Edsger Dijkstra",
      role: "member",
      responded: false,
      joined_at: "2026-09-01T10:00:00Z",
    },
    {
      user_id: userFixture.id,
      display_name: userFixture.display_name,
      role: "member",
      responded: false,
      joined_at: "2026-09-01T11:00:00Z",
    },
  ],
  next_cursor: null,
};

groupsBySlugFixture[dstGroupFixture.slug] = dstGroupFixture;
groupsBySlugFixture[dstConfirmedGroupFixture.slug] = dstConfirmedGroupFixture;
membersBySlugFixture[dstGroupFixture.slug] = dstMembersPageFixture;
membersBySlugFixture[dstConfirmedGroupFixture.slug] = dstMembersPageFixture;

export const slotNotInWindowProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Unprocessable Entity",
  status: 422,
  detail: "A slot lies outside the group's window.",
  code: "slot_not_in_window",
};

export const dbCircuitOpenProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Service Unavailable",
  status: 503,
  detail: "The database circuit breaker is open.",
  code: "db_circuit_open",
};

// --- Suggestions and proposals ----------------------------------------------------------

type Proposal = components["schemas"]["Proposal"];

/**
 * A copy of the daylight-saving group that the signed-in user owns, so the proposals screen has
 * a group where the owner controls are visible and every instant still straddles the
 * 25 October 2026 change. Its roster is the same as the grid's, so a suggestion's user ids all
 * resolve to display names.
 */
export const proposalsGroupFixture: Group = {
  ...dstGroupFixture,
  slug: "4nP7uKd3Xv9C",
  name: "Reading circle",
  description: "Owned by the signed-in user, for the proposals screen.",
  my_role: "owner",
  version: 4,
};

/**
 * Two proposals of the two origins, deliberately stored out of order so that a test of the
 * rendered order is testing the sort rather than the fixture. Both windows are slot-aligned
 * inside the group's daily window: 2026-10-24T23:00Z is 01:00 local on the 25th, still CEST,
 * and 2026-10-26T00:00Z is 01:00 local on the 26th, by then CET.
 */
export const manualProposalFixture: Proposal = {
  id: "d4c3b2a1-0000-4000-8000-000000000001",
  start_at: "2026-10-26T00:00:00Z",
  end_at: "2026-10-26T01:00:00Z",
  origin: "manual",
  created_by: dstGroupFixture.owner_id,
  votes: { yes: [], maybe: [], no: [userFixture.id] },
  my_vote: "no",
  created_at: "2026-09-10T08:00:00Z",
};

/**
 * The mixture the vote tally is read against: two members voted yes, one maybe, nobody no, and
 * the signed-in user has not voted at all, which is what the "not voted yet" line names.
 */
export const suggestedProposalFixture: Proposal = {
  id: "d4c3b2a1-0000-4000-8000-000000000002",
  start_at: "2026-10-24T23:00:00Z",
  end_at: "2026-10-25T00:30:00Z",
  origin: "suggested",
  created_by: dstGroupFixture.owner_id,
  votes: {
    yes: [dstGroupFixture.owner_id, dstParticipantsFixture[1]!.user_id],
    maybe: [dstParticipantsFixture[2]!.user_id],
    no: [],
  },
  my_vote: null,
  created_at: "2026-09-11T08:00:00Z",
};

/**
 * A voter the roster does not know. The roster can legitimately lag a proposal by one read — a
 * member who voted and then left is still in the tally — so this is a normal state, not a bug,
 * and it must render as an unknown member rather than as a raw uuid.
 */
export const unknownVoterId = "b6e1d1d0-1f0a-4a3b-8c2e-eeeeeeeeeeee";

/**
 * Held out of `proposalsBySlugFixture` on purpose: a test that wants the unknown voter installs
 * it through its own handler, so the lists every other test reads are untouched by it.
 */
export const unknownVoterProposalFixture: Proposal = {
  ...manualProposalFixture,
  id: "d4c3b2a1-0000-4000-8000-000000000004",
  votes: { yes: [unknownVoterId], maybe: [], no: [userFixture.id] },
  my_vote: "no",
};

/** The proposal a confirmed group settled on, carried on `Group.confirmed_proposal`. */
export const confirmedProposalFixture: Proposal = {
  ...suggestedProposalFixture,
  id: "d4c3b2a1-0000-4000-8000-000000000003",
};

/**
 * The feed token. Deliberately a marker string rather than random characters: the secret
 * scanner flags high-entropy values, and a fixture that looks like a real credential is worth
 * neither the allowlist entry nor the doubt.
 */
export const feedTokenFixture = "feed-token-example-not-a-secret";

export function feedUrlFixture(slug: string): string {
  return `${globalThis.location.origin}/api/v1/groups/${slug}/feed.ics?token=${feedTokenFixture}`;
}

/** The same group confirmed, so the read-only branch of the proposals screen has a subject. */
export const proposalsConfirmedGroupFixture: Group = {
  ...proposalsGroupFixture,
  slug: "5qS9vLe4Yw1D",
  name: "Reading circle, settled",
  state: "confirmed",
  confirmed_proposal: confirmedProposalFixture,
  feed_url: feedUrlFixture("5qS9vLe4Yw1D"),
  version: 11,
};

/**
 * The same confirmed group as an ordinary member sees it: no owner controls, but the confirmed
 * window, the download and the subscribable feed are all still theirs.
 */
export const confirmedMemberGroupFixture: Group = {
  ...proposalsConfirmedGroupFixture,
  slug: "7uY2wMf5Zx8E",
  name: "Reading circle, as a member sees it",
  my_role: "member",
  feed_url: feedUrlFixture("7uY2wMf5Zx8E"),
  version: 12,
};

groupsBySlugFixture[proposalsGroupFixture.slug] = proposalsGroupFixture;
groupsBySlugFixture[proposalsConfirmedGroupFixture.slug] =
  proposalsConfirmedGroupFixture;
groupsBySlugFixture[confirmedMemberGroupFixture.slug] =
  confirmedMemberGroupFixture;
membersBySlugFixture[proposalsGroupFixture.slug] = dstMembersPageFixture;
membersBySlugFixture[proposalsConfirmedGroupFixture.slug] =
  dstMembersPageFixture;
membersBySlugFixture[confirmedMemberGroupFixture.slug] = dstMembersPageFixture;

/**
 * A window inside `memberGroupFixture`'s own daily window (09:00 to 17:00 local, 1 to 7 November
 * 2026, Europe/Stockholm, no daylight-saving change in range): 2026-11-02T08:00Z is 09:00 CET.
 * `memberGroupFixture` is already an open group with `my_role: "member"` and already reachable
 * from the groups list, so giving it a proposal is what makes the vote control reachable by hand
 * in `npm run dev:mock` without adding a group nobody would otherwise click into.
 */
export const memberGroupProposalFixture: Proposal = {
  id: "d4c3b2a1-0000-4000-8000-000000000005",
  start_at: "2026-11-02T08:00:00Z",
  end_at: "2026-11-02T08:30:00Z",
  origin: "manual",
  created_by: memberGroupFixture.owner_id,
  votes: { yes: [memberGroupOwnerFixture.user_id], maybe: [], no: [] },
  my_vote: null,
  created_at: "2026-09-05T08:00:00Z",
};

/**
 * A copy of the reading circle with no `my_role`, so the "no role, no role-dependent action"
 * invariant can be exercised on the proposals screen against a proposal to vote on, not only
 * against an empty list; `roleUnknownGroupFixture` already exercises the same absence for the
 * detail screen, but it is `archived` and carries no proposals of its own.
 */
export const proposalsRoleUnknownGroupFixture: Group = {
  ...dstGroupFixture,
  slug: "6rT8wNi6Zy2F",
  name: "Reading circle, role unknown",
  description: "No my_role on this read, with a proposal already on it.",
  my_role: undefined,
  version: 13,
};

groupsBySlugFixture[proposalsRoleUnknownGroupFixture.slug] =
  proposalsRoleUnknownGroupFixture;
membersBySlugFixture[proposalsRoleUnknownGroupFixture.slug] =
  dstMembersPageFixture;

export const proposalsBySlugFixture: Record<string, Proposal[]> = {
  [proposalsGroupFixture.slug]: [
    manualProposalFixture,
    suggestedProposalFixture,
  ],
  [proposalsConfirmedGroupFixture.slug]: [confirmedProposalFixture],
  [confirmedMemberGroupFixture.slug]: [confirmedProposalFixture],
  [memberGroupFixture.slug]: [memberGroupProposalFixture],
  [proposalsRoleUnknownGroupFixture.slug]: [suggestedProposalFixture],
};

export const proposalLimitReachedProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Conflict",
  status: 409,
  detail: "This group already has as many proposals as it may have.",
  code: "proposal_limit_reached",
};

export const forbiddenProblem: components["schemas"]["Problem"] = {
  type: "about:blank",
  title: "Forbidden",
  status: 403,
  detail: "Not allowed.",
  code: "forbidden",
};
