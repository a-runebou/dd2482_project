import { http, HttpResponse } from "msw";
import type { components } from "../api/generated/schema";
import {
  addMinutes,
  generateSlots,
  normalizeInstant,
  slotDate,
} from "../lib/slots";

type Group = components["schemas"]["Group"];
type MemberPage = components["schemas"]["MemberPage"];
type AvailabilitySelection = components["schemas"]["AvailabilitySelection"];
type Proposal = components["schemas"]["Proposal"];
type Suggestion = components["schemas"]["Suggestion"];
import {
  configFixture,
  calendarSourceFixture,
  calendarSourcesFixture,
  dstBusyFixture,
  dstParticipantsFixture,
  createdGroupFixture,
  exchangedSessionFixture,
  groupConfirmedProblem,
  groupEtag,
  groupNotConfirmedProblem,
  groupNotFoundProblem,
  groupsBySlugFixture,
  groupsPage1Fixture,
  groupsPage2Fixture,
  membersBySlugFixture,
  notFoundProblem,
  notOwnerProblem,
  confirmedProposalFixture,
  feedUrlFixture,
  proposalLimitReachedProblem,
  proposalsBySlugFixture,
  refreshedSessionFixture,
  rotatedInviteUrl,
  slotNotInWindowProblem,
  unauthenticatedProblem,
  userFixture,
  validationFailedProblem,
  versionConflictProblem,
} from "./fixtures";
import { mockUrl } from "./urls";

/**
 * Stands in for the HttpOnly refresh cookie, which JavaScript cannot see and MSW therefore
 * cannot model with a real cookie. It starts present, so a boot probe restores a session the
 * way a returning visitor's would; POST /auth/session sets it and DELETE /auth/session revokes
 * it, which is what makes signing out stick instead of the boot probe signing the user straight
 * back in. A test that wants the signed-out default calls setMockRefreshCookie(false); reset it
 * in a beforeEach, because server.resetHandlers() does not touch module state.
 */
let refreshCookiePresent = true;

export function setMockRefreshCookie(present: boolean): void {
  refreshCookiePresent = present;
}

function unauthenticatedResponse() {
  return HttpResponse.json(unauthenticatedProblem, {
    status: 401,
    headers: { "Content-Type": "application/problem+json" },
  });
}

function problemResponse(problem: components["schemas"]["Problem"]) {
  return HttpResponse.json(problem, {
    status: problem.status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

/**
 * A mutable copy of the group fixtures, so that the development mock behaves like a server:
 * a rename shows the new name after the refetch, a rotation bumps the version, and a delete
 * makes the slug 404. Tests that need to count requests install their own handlers; a test
 * that relies on these must call resetMockGroups() in a beforeEach, because
 * server.resetHandlers() does not touch module state.
 */
let groups: Record<string, Group> = { ...groupsBySlugFixture };
let members: Record<string, MemberPage> = structuredClone(membersBySlugFixture);

let calendarSources = structuredClone(calendarSourcesFixture);

export function resetMockCalendarSources(): void {
  calendarSources = structuredClone(calendarSourcesFixture);
}

export function resetMockGroups(): void {
  groups = { ...groupsBySlugFixture };
  members = structuredClone(membersBySlugFixture);
}

/**
 * The caller's own availability, per slug, so that a save followed by a refetch shows what was
 * saved rather than the fixture. Reset it in a beforeEach alongside resetMockGroups; MSW's
 * resetHandlers does not touch module state.
 */
let mySelections: Record<string, AvailabilitySelection> = {};

/**
 * Slots another member has marked available since the fixture was written, per slug. This is
 * what a second tab saving its own availability looks like from here: the matrix changes and
 * the group version moves, so the next conditional read is a 200 rather than a 304.
 */
let otherMemberMarks: Record<string, number[]> = {};

export function resetMockAvailability(): void {
  mySelections = {};
  otherMemberMarks = {};
}

/**
 * Bump a group's version, which is what the ETag is derived from, so that the next read with
 * If-None-Match answers 200 instead of 304. Exported for tests of the polling loop.
 */
export function advanceMockGroupVersion(slug: string): void {
  const group = groups[slug];
  if (group !== undefined) {
    groups[slug] = { ...group, version: group.version + 1 };
  }
}

/**
 * Confirm a group from outside a request, for tests of what happens when the state arrives
 * while someone is editing. The version moves with it, so the next conditional read is a 200.
 */
export function confirmMockGroup(slug: string): void {
  const group = groups[slug];
  if (group !== undefined) {
    groups[slug] = {
      ...group,
      state: "confirmed",
      confirmed_proposal:
        (proposals[slug] ?? [])[0] ?? confirmedProposalFixture,
      feed_url: feedUrlFixture(slug),
      version: group.version + 1,
    };
  }
}

/** Another member marks one slot available, and the version moves with it. */
export function markMockParticipantAvailable(
  slug: string,
  slotIndex: number,
): void {
  otherMemberMarks[slug] = [...(otherMemberMarks[slug] ?? []), slotIndex];
  advanceMockGroupVersion(slug);
}

function storedSelection(slug: string): AvailabilitySelection {
  return mySelections[slug] ?? { available: [], preferred: [] };
}

/**
 * The slot vector for a group, generated the way the backend generates it: per local day in the
 * group's timezone, so a mock of the 25 October 2026 group really does return the extra slots.
 */
function slotVector(group: Group): string[] {
  return generateSlots(
    group.date_start,
    group.date_end,
    group.window_start_minute,
    group.window_end_minute,
    group.slot_minutes,
    group.timezone,
  );
}

/**
 * The matrix, with the signed-in user folded in as a participant whose marks come from whatever
 * was last stored. That is what makes "save, reload, see it again" true in the development mock.
 */
function availabilityMatrix(
  group: Group,
): components["schemas"]["AvailabilityMatrix"] {
  const slots = slotVector(group);
  const indexOf = new Map(slots.map((slot, index) => [slot, index]));
  const stored = storedSelection(group.slug);
  const toIndices = (instants: string[]): number[] =>
    instants
      .map((instant) => indexOf.get(normalizeInstant(instant)))
      .filter((index): index is number => index !== undefined);
  const preferred = toIndices(stored.preferred);
  const preferredSet = new Set(preferred);
  const responded = stored.available.length + stored.preferred.length > 0;

  const marks = otherMemberMarks[group.slug] ?? [];
  const participants = [
    ...dstParticipantsFixture.map((participant, index) =>
      index === 1 && marks.length > 0
        ? {
            ...participant,
            available: [...new Set([...participant.available, ...marks])],
          }
        : participant,
    ),
    {
      user_id: userFixture.id,
      display_name: userFixture.display_name,
      responded,
      available: toIndices(stored.available).filter(
        (index) => !preferredSet.has(index),
      ),
      preferred,
    },
  ];

  const aggregate = slots.map((_, slotIndex) => ({
    slot_index: slotIndex,
    available_count: participants.filter(
      (participant) =>
        participant.responded && participant.available.includes(slotIndex),
    ).length,
    preferred_count: participants.filter(
      (participant) =>
        participant.responded && participant.preferred.includes(slotIndex),
    ).length,
  }));

  return {
    version: group.version,
    slots,
    participants,
    aggregate,
    responded_count: participants.filter((participant) => participant.responded)
      .length,
    member_count: participants.length,
  };
}

/**
 * A 304 when the caller's validator still matches the group's, and null when it does not, so a
 * polled read costs a header exchange and no body (ARCHITECTURE 6.3). A 304 carries no body at
 * all, which is what makes the client's cached copy the only copy.
 */
function notModified(
  request: Request,
  group: Group,
): HttpResponse<null> | null {
  const ifNoneMatch = request.headers.get("If-None-Match");
  return ifNoneMatch === groupEtag(group)
    ? new HttpResponse(null, { status: 304, headers: { ETag: ifNoneMatch } })
    : null;
}

/** One path parameter, which MSW types as string | readonly string[]. */
function pathParam(value: string | readonly string[] | undefined): string {
  return typeof value === "string" ? value : (value?.[0] ?? "");
}

/**
 * Proposals per slug, kept in module state so that a creation and a deletion are visible in the
 * list the way they would be from a server. Reset it in a beforeEach alongside resetMockGroups;
 * MSW's resetHandlers does not touch module state.
 */
let proposals: Record<string, Proposal[]> = structuredClone(
  proposalsBySlugFixture,
);

/**
 * The revision behind the proposals ETag. The list is its own resource with its own validator,
 * so it is counted separately from the group version; like the group ETag, its shape is opaque
 * and not reconstructible from the body, so a test asserting If-None-Match is proving the client
 * echoed what it was given.
 */
let proposalRevisions: Record<string, number> = {};

export function resetMockProposals(): void {
  proposals = structuredClone(proposalsBySlugFixture);
  proposalRevisions = {};
}

function proposalsEtag(slug: string): string {
  return `W/"proposals-${slug}-r${proposalRevisions[slug] ?? 0}"`;
}

function bumpProposals(slug: string): void {
  proposalRevisions[slug] = (proposalRevisions[slug] ?? 0) + 1;
}

/** The next proposal id. Sequential rather than random, so a failure names the same proposal twice. */
let nextProposalId = 1;

function mintProposalId(): string {
  const suffix = String(nextProposalId).padStart(12, "0");
  nextProposalId += 1;
  return `e5d4c3b2-0000-4000-8000-${suffix}`;
}

/**
 * Suggestions computed from the same matrix the availability handler serves, so that answering
 * the grid really does change what this returns. It follows ARCHITECTURE 5.1 closely enough to
 * be useful — windows of `duration_minutes / slot_minutes` consecutive slots that stay inside
 * one local day, scored as the mean of `2 * preferred + available` over the window, best first
 * — but it is a mock, not a second implementation to be trusted: the backend's is authoritative.
 */
function computeSuggestions(
  group: Group,
  durationMinutes: number,
  limit: number,
): Suggestion[] {
  const matrix = availabilityMatrix(group);
  const slots = matrix.slots;
  const span = Math.round(durationMinutes / group.slot_minutes);
  const stepMillis = group.slot_minutes * 60_000;
  const found: Suggestion[] = [];

  for (let start = 0; start + span <= slots.length; start += 1) {
    const window = slots.slice(start, start + span);
    const first = window[0]!;
    const last = window[span - 1]!;
    // A window must be contiguous in real time and stay inside one local day, which is what
    // rules out jumping the gap between one day's window end and the next day's start.
    if (Date.parse(last) - Date.parse(first) !== (span - 1) * stepMillis) {
      continue;
    }
    if (slotDate(first, group.timezone) !== slotDate(last, group.timezone)) {
      continue;
    }
    const indices = window.map((_, offset) => start + offset);
    const responders = matrix.participants.filter(
      (participant) => participant.responded,
    );
    const marked = (
      participant: (typeof matrix.participants)[number],
      index: number,
    ): boolean =>
      participant.available.includes(index) ||
      participant.preferred.includes(index);
    const available = responders.filter((participant) =>
      indices.every((index) => marked(participant, index)),
    );
    const availableIds = new Set(available.map((p) => p.user_id));
    const preferred = available.filter((participant) =>
      indices.every((index) => participant.preferred.includes(index)),
    );
    const score =
      indices.reduce((total, index) => {
        const cell = matrix.aggregate[index]!;
        return total + 2 * cell.preferred_count + cell.available_count;
      }, 0) / span;

    found.push({
      start_at: first,
      end_at: addMinutes(last, group.slot_minutes),
      score,
      available_user_ids: available.map((p) => p.user_id),
      preferred_user_ids: preferred.map((p) => p.user_id),
      missing_user_ids: matrix.participants
        .filter((p) => !availableIds.has(p.user_id))
        .map((p) => p.user_id),
    });
  }

  return found
    .sort(
      (a, b) =>
        b.score - a.score || Date.parse(a.start_at) - Date.parse(b.start_at),
    )
    .slice(0, limit);
}

/**
 * The caller's vote, applied as a replacement: the user id is removed from all three arrays
 * before being added to one, so changing a vote can never leave the voter counted twice.
 * `null` withdraws it.
 */
function withMyVote(
  proposal: Proposal,
  value: components["schemas"]["VoteValue"] | null,
): Proposal {
  const without = (ids: string[]): string[] =>
    ids.filter((id) => id !== userFixture.id);
  const votes = {
    yes: without(proposal.votes.yes),
    maybe: without(proposal.votes.maybe),
    no: without(proposal.votes.no),
  };
  if (value !== null) {
    votes[value] = [...votes[value], userFixture.id];
  }
  return { ...proposal, votes, my_vote: value };
}

/** An instant in the basic form iCalendar wants: 2026-10-24T23:00:00Z becomes 20261024T230000Z. */
function icsInstant(instant: string): string {
  return normalizeInstant(instant).replace(/[-:]/g, "");
}

/**
 * A minimal but valid iCalendar document with the single VEVENT the contract describes. It is
 * assembled here rather than imported as a fixture string so that the window really is the
 * confirmed proposal's, which is what makes "confirm, then download" meaningful in the
 * development mock.
 */
function icsDocument(group: Group, proposal: Proposal): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Schedular//Mock//EN",
    "BEGIN:VEVENT",
    `UID:${proposal.id}@schedular.example`,
    `DTSTAMP:${icsInstant(proposal.created_at)}`,
    `DTSTART:${icsInstant(proposal.start_at)}`,
    `DTEND:${icsInstant(proposal.end_at)}`,
    `SUMMARY:${group.name}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

// Handlers match the absolute base URL the runtime client uses, so a request to a different
// origin is not served. mockUrl resolves the same base URL as the client; jsdom (tests) and the
// browser both supply the origin the default /api/v1 path is resolved against.
export const handlers = [
  http.get(mockUrl("/config"), () => HttpResponse.json(configFixture)),
  // Two pages: no cursor returns the first page and its next_cursor; that exact cursor returns
  // the second page with next_cursor null; any other cursor is a 400 validation_failed problem.
  http.get(mockUrl("/groups"), ({ request }) => {
    const cursor = new URL(request.url).searchParams.get("cursor");
    if (cursor === null) {
      return HttpResponse.json(groupsPage1Fixture);
    }
    if (cursor === "page2") {
      return HttpResponse.json(groupsPage2Fixture);
    }
    return HttpResponse.json(validationFailedProblem, {
      status: 400,
      headers: { "Content-Type": "application/problem+json" },
    });
  }),
  // Creation succeeds and echoes the submitted body. The list fixtures are static, so a created
  // group never appears in GET /groups; that is deliberate, not a cache bug.
  http.post(mockUrl("/groups"), async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["GroupCreate"];
    return HttpResponse.json(createdGroupFixture(body), { status: 201 });
  }),
  // Always 202, whatever the address, matching the contract's reason for never disclosing
  // whether an account exists.
  http.post(
    mockUrl("/auth/magic-link"),
    () => new HttpResponse(null, { status: 202 }),
  ),
  // Exchanging a magic-link token always succeeds, whatever the token: the token's validity is
  // the backend's business, and a test that wants a rejection overrides this handler.
  http.post(mockUrl("/auth/session"), () => {
    refreshCookiePresent = true;
    return HttpResponse.json(exchangedSessionFixture);
  }),
  http.post(mockUrl("/auth/refresh"), () =>
    refreshCookiePresent
      ? HttpResponse.json(refreshedSessionFixture)
      : unauthenticatedResponse(),
  ),
  http.delete(mockUrl("/auth/session"), () => {
    refreshCookiePresent = false;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(mockUrl("/me/calendar-sources"), () =>
    HttpResponse.json(calendarSources),
  ),
  http.post(mockUrl("/me/calendar-sources"), async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["CalendarSourceCreate"];
    const source: components["schemas"]["CalendarSource"] = {
      ...calendarSourceFixture,
      id: "b6e1d1d0-1f0a-4a3b-8c2e-999999999999",
      kind: "url",
      url: body.url,
      label: body.label ?? null,
      status: "pending",
      event_count: 0,
    };
    calendarSources = { data: [...calendarSources.data, source], next_cursor: null };
    return HttpResponse.json(source, { status: 201 });
  }),
  http.post(mockUrl("/me/calendar-sources/upload"), async ({ request }) => {
    const form = await request.formData();
    const file = form.get("file");
    const fileName =
      file !== null && typeof file !== "string" && "name" in file
        ? String(file.name)
        : "Uploaded calendar";
    const source: components["schemas"]["CalendarSource"] = {
      ...calendarSourceFixture,
      id: "b6e1d1d0-1f0a-4a3b-8c2e-aaaaaaaaaaaa",
      kind: "upload",
      url: null,
      label: fileName,
      status: "ok",
      event_count: 2,
    };
    calendarSources = { data: [...calendarSources.data, source], next_cursor: null };
    return HttpResponse.json(source, { status: 201 });
  }),
  http.post(mockUrl("/me/calendar-sources/:sourceId/refresh"), ({ params }) => {
    const source = calendarSources.data.find((item) => item.id === pathParam(params.sourceId));
    return source === undefined
      ? problemResponse(notFoundProblem)
      : HttpResponse.json({ ...source, status: "pending" }, { status: 202 });
  }),
  http.delete(mockUrl("/me/calendar-sources/:sourceId"), ({ params }) => {
    calendarSources = {
      data: calendarSources.data.filter((item) => item.id !== pathParam(params.sourceId)),
      next_cursor: null,
    };
    return new HttpResponse(null, { status: 204 });
  }),
  // --- Group detail ---------------------------------------------------------------------
  // A read always carries the ETag, because every mutation below insists on a matching
  // If-Match when the client sends one. Unknown slugs are 404 group_not_found, which is also
  // what a non-member receives: the handler cannot tell the two apart, and neither can the UI.
  http.get(mockUrl("/groups/:slug"), ({ params, request }) => {
    const group = groups[pathParam(params.slug)];
    if (group === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    const unchanged = notModified(request, group);
    return (
      unchanged ??
      HttpResponse.json(group, { headers: { ETag: groupEtag(group) } })
    );
  }),
  http.post(mockUrl("/groups/:slug/join"), ({ params }) => {
    const group = groups[pathParam(params.slug)];
    return group === undefined
      ? problemResponse(groupNotFoundProblem)
      : HttpResponse.json(group);
  }),
  http.get(mockUrl("/groups/:slug/members"), ({ params }) => {
    const roster = members[pathParam(params.slug)];
    if (roster === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    return HttpResponse.json(roster);
  }),
  // The ordering of the checks matters and mirrors the backend: existence, then the
  // precondition, then the state, then the role.
  http.patch(mockUrl("/groups/:slug"), async ({ params, request }) => {
    const slug = pathParam(params.slug);
    const group = groups[slug];
    if (group === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    const ifMatch = request.headers.get("If-Match");
    if (ifMatch !== null && ifMatch !== groupEtag(group)) {
      return problemResponse(versionConflictProblem);
    }
    if (group.state === "confirmed") {
      return problemResponse(groupConfirmedProblem);
    }
    if (group.my_role !== "owner") {
      return problemResponse(notOwnerProblem);
    }
    const body = (await request.json()) as components["schemas"]["GroupPatch"];
    const rotate = body.rotate_invite_token === true;
    // The rotate flags are instructions, not properties of the group, so they are never merged.
    const { rotate_invite_token, rotate_feed_token, ...rest } = body;
    void rotate_invite_token;
    void rotate_feed_token;
    const updated = { ...group, ...rest, version: group.version + 1 };
    groups[slug] = updated;
    return HttpResponse.json(
      rotate ? { ...updated, invite_url: rotatedInviteUrl(slug) } : updated,
      { headers: { ETag: groupEtag(updated) } },
    );
  }),
  http.delete(mockUrl("/groups/:slug"), ({ params }) => {
    const slug = pathParam(params.slug);
    if (groups[slug] === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    delete groups[slug];
    delete members[slug];
    return new HttpResponse(null, { status: 204 });
  }),
  http.delete(mockUrl("/groups/:slug/members/:userId"), ({ params }) => {
    const slug = pathParam(params.slug);
    const group = groups[slug];
    const roster = members[slug];
    if (group === undefined || roster === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    const userId = pathParam(params.userId);
    // The owner can neither be removed nor leave (ARCHITECTURE section 5).
    if (roster.data.some((m) => m.user_id === userId && m.role === "owner")) {
      return problemResponse(notOwnerProblem);
    }
    const remaining = roster.data.filter((m) => m.user_id !== userId);
    if (remaining.length === roster.data.length) {
      return problemResponse(notFoundProblem);
    }
    members[slug] = { ...roster, data: remaining };
    // The version moves with the representation, because the ETag is derived from it: a group
    // whose member_count changed without a new validator would answer 304 and look unchanged.
    groups[slug] = {
      ...group,
      member_count: remaining.length,
      version: group.version + 1,
    };
    return new HttpResponse(null, { status: 204 });
  }),
  // --- Availability ---------------------------------------------------------------------
  http.get(mockUrl("/groups/:slug/availability"), ({ params, request }) => {
    const group = groups[pathParam(params.slug)];
    if (group === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    const unchanged = notModified(request, group);
    if (unchanged !== null) {
      return unchanged;
    }
    const matrix = availabilityMatrix(group);
    return HttpResponse.json(matrix, {
      headers: { ETag: groupEtag(group) },
    });
  }),
  http.get(mockUrl("/groups/:slug/availability/me"), ({ params }) => {
    const slug = pathParam(params.slug);
    if (groups[slug] === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    return HttpResponse.json(storedSelection(slug));
  }),
  // The order mirrors the backend: existence, then the group's state, then the slots
  // themselves. A full replacement, so whatever arrives is the whole stored selection.
  http.put(
    mockUrl("/groups/:slug/availability/me"),
    async ({ params, request }) => {
      const slug = pathParam(params.slug);
      const group = groups[slug];
      if (group === undefined) {
        return problemResponse(groupNotFoundProblem);
      }
      if (group.state === "confirmed") {
        return problemResponse(groupConfirmedProblem);
      }
      const body = (await request.json()) as AvailabilitySelection;
      const allowed = new Set(slotVector(group));
      const submitted = [...body.available, ...body.preferred];
      if (
        submitted.some((instant) => !allowed.has(normalizeInstant(instant)))
      ) {
        return problemResponse(slotNotInWindowProblem);
      }
      // A slot in both arrays counts as preferred, so the echo never repeats it.
      const preferred = [...new Set(body.preferred.map(normalizeInstant))];
      const preferredSet = new Set(preferred);
      const stored: AvailabilitySelection = {
        available: [...new Set(body.available.map(normalizeInstant))].filter(
          (instant) => !preferredSet.has(instant),
        ),
        preferred,
      };
      mySelections[slug] = stored;
      groups[slug] = { ...group, version: group.version + 1 };
      return HttpResponse.json(stored, {
        headers: { ETag: groupEtag(groups[slug]) },
      });
    },
  ),
  // from and to are required by the contract; a request missing either is a 400, as it would be
  // from the backend's own query validation.
  http.get(mockUrl("/me/busy"), ({ request }) => {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from === null || to === null) {
      return problemResponse(validationFailedProblem);
    }
    const fromMillis = Date.parse(from);
    const toMillis = Date.parse(to);
    return HttpResponse.json({
      data: dstBusyFixture.filter(
        (block) =>
          Date.parse(block.start_at) < toMillis &&
          Date.parse(block.end_at) > fromMillis,
      ),
      next_cursor: null,
    });
  }),
  // --- Suggestions and proposals ---------------------------------------------------------
  // Computed on request and never stored (ARCHITECTURE 5.1). The defaults here are the
  // contract's, applied when the client omits a parameter; the client always sends both.
  http.get(mockUrl("/groups/:slug/suggestions"), ({ params, request }) => {
    const group = groups[pathParam(params.slug)];
    if (group === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    const query = new URL(request.url).searchParams;
    const duration = Number(query.get("duration_minutes") ?? 60);
    const limit = Number(query.get("limit") ?? 5);
    return HttpResponse.json({
      data: computeSuggestions(group, duration, limit),
      next_cursor: null,
    });
  }),
  http.get(mockUrl("/groups/:slug/proposals"), ({ params, request }) => {
    const slug = pathParam(params.slug);
    if (groups[slug] === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    const etag = proposalsEtag(slug);
    if (request.headers.get("If-None-Match") === etag) {
      return new HttpResponse(null, { status: 304, headers: { ETag: etag } });
    }
    return HttpResponse.json(
      { data: proposals[slug] ?? [], next_cursor: null },
      { headers: { ETag: etag } },
    );
  }),
  // The order of the checks mirrors the backend: existence, then the group's state, then the
  // role, then the limit, then the window itself.
  http.post(mockUrl("/groups/:slug/proposals"), async ({ params, request }) => {
    const slug = pathParam(params.slug);
    const group = groups[slug];
    if (group === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    if (group.state === "confirmed") {
      return problemResponse(groupConfirmedProblem);
    }
    if (group.my_role !== "owner") {
      return problemResponse(notOwnerProblem);
    }
    const existing = proposals[slug] ?? [];
    if (existing.length >= configFixture.max_proposals_per_group) {
      return problemResponse(proposalLimitReachedProblem);
    }
    const body =
      (await request.json()) as components["schemas"]["ProposalCreate"];
    const allowed = new Set(slotVector(group));
    const startAt = normalizeInstant(body.start_at);
    const endAt = normalizeInstant(body.end_at);
    if (
      !allowed.has(startAt) ||
      Date.parse(endAt) <= Date.parse(startAt) ||
      !allowed.has(addMinutes(endAt, -group.slot_minutes))
    ) {
      return problemResponse(slotNotInWindowProblem);
    }
    const created: Proposal = {
      id: mintProposalId(),
      start_at: startAt,
      end_at: endAt,
      origin: body.origin ?? "manual",
      created_by: userFixture.id,
      votes: { yes: [], maybe: [], no: [] },
      my_vote: null,
      created_at: "2026-09-14T09:00:00Z",
    };
    proposals[slug] = [...existing, created];
    bumpProposals(slug);
    advanceMockGroupVersion(slug);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.delete(mockUrl("/groups/:slug/proposals/:proposalId"), ({ params }) => {
    const slug = pathParam(params.slug);
    const group = groups[slug];
    if (group === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    if (group.state === "confirmed") {
      return problemResponse(groupConfirmedProblem);
    }
    if (group.my_role !== "owner") {
      return problemResponse(notOwnerProblem);
    }
    const existing = proposals[slug] ?? [];
    const proposalId = pathParam(params.proposalId);
    const remaining = existing.filter((proposal) => proposal.id !== proposalId);
    if (remaining.length === existing.length) {
      return problemResponse(notFoundProblem);
    }
    proposals[slug] = remaining;
    bumpProposals(slug);
    advanceMockGroupVersion(slug);
    return new HttpResponse(null, { status: 204 });
  }),
  // --- Votes, confirmation and export -----------------------------------------------------
  // A vote is a full replacement of the caller's own, so the PUT answers with the whole
  // proposal: the client has no need to work out what the tally became.
  http.put(
    mockUrl("/groups/:slug/proposals/:proposalId/vote/me"),
    async ({ params, request }) => {
      const slug = pathParam(params.slug);
      const group = groups[slug];
      if (group === undefined) {
        return problemResponse(groupNotFoundProblem);
      }
      if (group.state === "confirmed") {
        return problemResponse(groupConfirmedProblem);
      }
      const existing = proposals[slug] ?? [];
      const proposalId = pathParam(params.proposalId);
      const target = existing.find((proposal) => proposal.id === proposalId);
      if (target === undefined) {
        return problemResponse(notFoundProblem);
      }
      const body = (await request.json()) as components["schemas"]["VoteInput"];
      const updated = withMyVote(target, body.value);
      proposals[slug] = existing.map((proposal) =>
        proposal.id === proposalId ? updated : proposal,
      );
      bumpProposals(slug);
      return HttpResponse.json(updated);
    },
  ),
  http.delete(
    mockUrl("/groups/:slug/proposals/:proposalId/vote/me"),
    ({ params }) => {
      const slug = pathParam(params.slug);
      const group = groups[slug];
      if (group === undefined) {
        return problemResponse(groupNotFoundProblem);
      }
      if (group.state === "confirmed") {
        return problemResponse(groupConfirmedProblem);
      }
      const existing = proposals[slug] ?? [];
      const proposalId = pathParam(params.proposalId);
      const target = existing.find((proposal) => proposal.id === proposalId);
      if (target === undefined) {
        return problemResponse(notFoundProblem);
      }
      proposals[slug] = existing.map((proposal) =>
        proposal.id === proposalId ? withMyVote(proposal, null) : proposal,
      );
      bumpProposals(slug);
      return new HttpResponse(null, { status: 204 });
    },
  ),
  // Confirming is stateful on purpose: the group this hands back is the group every other
  // handler serves from here on, so an availability write or a vote after it starts answering
  // 409 without a test having to arrange that separately.
  http.post(
    mockUrl("/groups/:slug/confirmation"),
    async ({ params, request }) => {
      const slug = pathParam(params.slug);
      const group = groups[slug];
      if (group === undefined) {
        return problemResponse(groupNotFoundProblem);
      }
      if (group.my_role !== "owner") {
        return problemResponse(notOwnerProblem);
      }
      if (group.state === "confirmed") {
        return problemResponse(groupConfirmedProblem);
      }
      const body =
        (await request.json()) as components["schemas"]["ConfirmationRequest"];
      const target = (proposals[slug] ?? []).find(
        (proposal) => proposal.id === body.proposal_id,
      );
      if (target === undefined) {
        return problemResponse(notFoundProblem);
      }
      // send_reminders is the worker's business; the mock records nothing and schedules nothing.
      const updated: Group = {
        ...group,
        state: "confirmed",
        confirmed_proposal: target,
        feed_url: feedUrlFixture(slug),
        version: group.version + 1,
      };
      groups[slug] = updated;
      return HttpResponse.json(updated, {
        headers: { ETag: groupEtag(updated) },
      });
    },
  ),
  // Idempotent: unconfirming a group that is already open answers with the group rather than a
  // conflict, because the outcome the caller asked for is the one that already holds.
  http.delete(mockUrl("/groups/:slug/confirmation"), ({ params }) => {
    const slug = pathParam(params.slug);
    const group = groups[slug];
    if (group === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    if (group.my_role !== "owner") {
      return problemResponse(notOwnerProblem);
    }
    const updated: Group = {
      ...group,
      state: "open",
      confirmed_proposal: null,
      version: group.version + 1,
    };
    groups[slug] = updated;
    return HttpResponse.json(updated, {
      headers: { ETag: groupEtag(updated) },
    });
  }),
  // Not JSON, and not a problem document either when it succeeds. A group that is not confirmed
  // has no event to export, which the contract answers 409 group_not_confirmed.
  http.get(mockUrl("/groups/:slug/event.ics"), ({ params }) => {
    const slug = pathParam(params.slug);
    const group = groups[slug];
    if (group === undefined) {
      return problemResponse(groupNotFoundProblem);
    }
    const proposal = group.confirmed_proposal;
    if (
      group.state !== "confirmed" ||
      proposal === undefined ||
      proposal === null
    ) {
      return problemResponse(groupNotConfirmedProblem);
    }
    return new HttpResponse(icsDocument(group, proposal), {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="event.ics"',
      },
    });
  }),
];
