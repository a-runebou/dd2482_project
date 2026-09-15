# 2026-09-13 — Availability grid (T15a)

## Task

Round T15a: a member can open a group's availability grid, see everyone's responses as a
heatmap, select their own available and preferred slots by clicking or dragging, and save them
as a full replacement, proven against MSW.

## Model

Opus 5.

## Files changed

New:

- `frontend/src/lib/slots.ts`, `slots.test.ts`
- `frontend/src/features/availability/availabilityModel.ts`, `availabilityModel.test.ts`
- `frontend/src/features/availability/slotDescription.ts`, `slotDescription.test.ts`
- `frontend/src/features/availability/availabilityQueries.ts`
- `frontend/src/features/availability/availabilityMutations.ts`
- `frontend/src/features/availability/availabilityErrors.ts`
- `frontend/src/features/availability/SlotGrid.tsx`
- `frontend/src/features/availability/AvailabilityLegend.tsx`
- `frontend/src/features/availability/AvailabilityBoard.tsx`, `AvailabilityBoard.test.tsx`
- `frontend/src/pages/AvailabilityPage.tsx`, `AvailabilityPage.test.tsx`

Edited:

- `frontend/src/app/routes.tsx` — added `groups/:slug/availability`.
- `frontend/src/app/routes.test.tsx` — two cases added; `resetMockGroups`/`resetMockAvailability`
  added to the existing `beforeEach`. No existing case changed.
- `frontend/src/features/groups/GroupDetail.tsx` — "Open the availability grid" link only.
- `frontend/src/mocks/fixtures.ts`, `frontend/src/mocks/handlers.ts` — availability fixtures and
  handlers, appended.
- `docs/frontend/DECISIONS.md` — F22 appended.

No existing test was deleted, skipped or weakened.

## What I did

`lib/slots.ts` generates the slot vector per local day rather than by adding a fixed day length.
Each date's window start and window end are resolved to real instants independently and the
slots between them are stepped in UTC, so a 25-hour day yields more slots than a 24-hour one and
consecutive slots stay exactly `slot_minutes` apart in real time. A wall-clock time is resolved
by taking the zone's offsets a day either side of it — the only two it can have — and keeping
the candidates that format back to the time asked for: two survive for the repeated autumn hour,
none for the hour the spring change deletes, in which case the edge rolls forward. Nothing in
the file or the feature calls `new Date`; `Intl` with an explicit `timeZone` reads instants and
`Date.parse` writes them, so the runtime's own zone cannot leak in. Its tests run with the
process timezone stubbed to `Pacific/Auckland`, which is asserted, so a helper that reached for
the default would fail them.

The board runs four queries — the group (reused, for its timezone, range and window), the
matrix, the caller's own selection, and `/me/busy` over the group's range via `skipToken` until
the range is known. Reads index into the server's slot vector and the write sends plain
instants; no index and no local wall-clock time is ever sent. The selection is one map from
instant to state, so a slot cannot be in both arrays. Saving invalidates the `["availability",
slug]` prefix, which covers the matrix and the caller's own read because the latter is nested
under the former.

The grid is `role="grid"` with a roving tabindex, columns of local dates and rows of local times
of day. Pointer interaction is `pointerdown` plus `pointerover` only and the keyboard is
`keydown` with the default prevented, so one press cycles a cell exactly once in a real browser;
a drag paints the state the first cell is moving to across every cell the pointer crosses, and
the release is watched on the window so letting go outside the grid ends it cleanly.

Heatmap weighting, as F22 records: `(available + 2 x preferred) / (2 x responded)` in five
levels, with never-responded members excluded from the denominator. Shade is never the only
carrier — each cell's accessible description gives the counts and names the available, the
preferring and the missing members, and a detail panel repeats it on hover or focus.

Two real bugs were found by tests written before the fix and are covered by regression cases:

1. After a successful save the board reset its "seeded" marker, so the stale `me` response still
   in the cache seeded over the just-saved selection on the very next render. The write's own
   response is now the new baseline and the marker is left alone.
2. A double click on Save sent two requests, because the flag that disables the button is set by
   a state update the second click can beat. A ref now guards the mutation.

## Discrepancies noticed

None between the code and `contracts/openapi.yaml`. The contract, ARCHITECTURE 7.3 and the
generated types agree on the read/write asymmetry.

## Assumptions made

- `slot_minutes` is read from `Group`, not from `GET /config`. The contract carries it on the
  group and a group is what the window belongs to, so this is not a hard-coded limit (rule 7).
- `SlotAggregate.available_count` and `preferred_count` are disjoint — a member is available or
  preferred, not both — matching the `availability.state` enum in ARCHITECTURE section 5.
- The denominator is the matrix's `responded_count` (the server's number); the name lists come
  from `participants`. They are expected to agree.
- On a transition day one local column has more cells than its neighbours. The row labels are
  taken from the longest day and shorter days are padded at the end; every cell carries its own
  date and time in its description, so a label is a guide and never what assistive technology
  relies on.
- "Interactive controls are disabled while saving" was read to include the cells, not only the
  buttons: the body being written is the selection as it was when Save was pressed.
- The mock serves the same three other participants for every group. Harmless for a mock, but it
  means any group's grid shows Grace, Alan and Edsger.

## Follow-ups for later

- Polling with `If-None-Match` and 304 handling is a separate task and was not added.
- The 375-pixel check is by hand (below); the Chrome extension was not connected in this
  session, so no browser was driven.
- `PageContainer` is `max-w-2xl`, so on a wide screen a long group scrolls horizontally sooner
  than it needs to. Widening the page column is a design decision, not this task's.
- Pointer capture is not used, so a very fast drag can skip a cell. Standard for this pattern.

## Commands to verify

From `frontend/` on Node 24:

```
npm run typecheck        # exit 0
npm run lint             # exit 0
npm run format:check     # exit 0
npm test                 # 44 files, 318 tests (baseline 39 / 243)
npm run build            # exit 0
npm run check:api        # exit 0
grep -rn "new Date(" src/lib/slots.ts src/features/availability        # no matches
grep -rnE "localStorage|sessionStorage" src/features/availability src/pages   # no matches
grep -rnE "#[0-9a-fA-F]{3,8}" src --include='*.tsx' --include='*.ts'   # no matches
```

By hand: `npm run dev:mock`, open a group, open its availability grid, drag a region, save,
reload and see the selection restored, and check the grid at a 375 pixel width.
