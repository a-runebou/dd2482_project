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
