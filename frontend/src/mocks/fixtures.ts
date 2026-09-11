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
