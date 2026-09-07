# T18 — Votes, confirmation and event export

## Task

Let members vote on proposals, let the owner confirm one and unconfirm it again, make the
confirmed state visibly freeze writes across the application, and let any member download the
confirmed event as an iCalendar file.

## Model

Opus 5.

## Files changed

New, `frontend/src/features/scheduling/`: `votes.ts`, `VoteTally.tsx`, `VoteControl.tsx`,
`voteMutations.ts`, `confirmationMutations.ts`, `ConfirmProposalAction.tsx`,
`UnconfirmAction.tsx`, `ConfirmedEventPanel.tsx`, plus the colocated tests
`VoteTally.test.tsx`, `VoteControl.test.tsx`, `ConfirmProposalAction.test.tsx`,
`UnconfirmAction.test.tsx`, `ConfirmedEventPanel.test.tsx`.

New, `frontend/src/features/export/`: `downloadEvent.ts`, `EventDownloadButton.tsx`,
`FeedLinkPanel.tsx` and their tests.

New primitive: `frontend/src/components/Checkbox.tsx` and its test. No checkbox existed and
`Field` puts its label above the control, which is wrong for one.

Changed: `features/scheduling/ProposalsList.tsx` (tally, vote control, confirm action, the
confirmed mark, four new props), `features/scheduling/ProposalsBoard.tsx` (passes the roster and
the vote/confirm gates), `features/scheduling/schedulingErrors.ts` (three new sentences),
`features/groups/GroupDetail.tsx` (confirmed panel, owner unconfirm),
`features/availability/AvailabilityBoard.tsx` (the group read is now polled beside the matrix;
mid-edit freeze wording), `features/availability/availabilityErrors.ts`,
`mocks/fixtures.ts`, `mocks/handlers.ts`, `docs/frontend/DECISIONS.md` (F25).

Existing tests edited, with reasons:

- `features/scheduling/ProposalsList.test.tsx` — the component gained four required props, so
  the harness had to pass them. The test that asserted "no vote control, because voting is not
  part of this screen" now asserts no vote control *for a reader who may not vote*, which is
  still a real assertion; a new test covers the confirmed mark.
- `features/scheduling/ProposalsBoard.test.tsx` — `confirm this proposal` added to the
  owner-only control set, so the existing owner / member / missing-`my_role` / confirmed tests
  cover the confirmation gate too; two tests added for the voting gate.
- `features/availability/AvailabilityBoard.test.tsx` — the test for a save rejected with
  `group_confirmed` now expects the mid-edit wording, because at that moment there *is* an
  unsaved selection and the mid-edit sentence is the accurate one. Nothing was weakened: the
  new assertion is more specific than the old.
- `features/availability/AvailabilityBoard.polling.test.tsx` — one test added for the freeze
  arriving under polling; it uses the new `confirmMockGroup` helper.
- `pages/GroupDetailPage.test.tsx` — two tests added for the confirmed panel and the
  owner-only unconfirm action.

## What I did

Voting is a radio group in a fieldset, one per proposal, with a withdrawal button beside it.
The PUT returns the updated proposal, so its body is spliced into the cached proposals page and
the page's ETag is dropped with it — the validator described what the server sent, not what is
now held, and a 304 answered against a stale validator would pin the changed body forever. The
invalidation that follows is what resynchronises, not the source of the tally. The DELETE
(204, no body) only invalidates. A vote answering `not_found` refetches the list and says
nothing, as the deletion already did.

The tally names voters through the existing roster query, shows an unresolved id as an unknown
member, and derives "not voted yet" by subtracting the three vote arrays from the roster,
because the contract carries no such field.

Confirmation is owner-only, behind `ConfirmPanel`, naming the window in the group's timezone,
with a `send_reminders` checkbox defaulting to true. It is deliberately *not* marked
destructive: it is reversible, and the destructive treatment asserts otherwise. Both the
confirm and the unconfirm invalidate the group's own read (exact) and the proposals key, which
is what makes the freeze reach every screen.

The freeze: the availability board now polls the group's conditional read alongside the matrix,
on the same interval, because `Group.state` is where the freeze comes from and a confirmation
made elsewhere has to reach an open grid. When it lands mid-edit the selection stays on screen,
the save and discard controls go, and the notice says the work is still there and can no longer
be sent. Every affected screen still handles a server 409 `group_confirmed`.

The download goes through the typed client with `parseAs: "blob"`, so the session middleware's
refresh-and-retry still applies, and is handed to the browser through an anchor with a
`download` attribute; the object URL is revoked from a timeout, because the click that starts
the download reads it. The filename is the group's name reduced to `[a-z0-9-]`, capped, with
`event.ics` as the fallback. The feed link is treated as sensitive and follows the invite-link
copy pattern.

## Discrepancies noticed

- `GET /groups/{slug}/event.ics` answers 409 when the group is **not** confirmed, and
  `ErrorCode` had no code meaning that. Raised rather than worked around: Adrian added
  `group_not_confirmed` to the contract and to the ARCHITECTURE error table, regenerated the
  types, and the frontend, the error map and the mock were then updated to branch on it. Until
  that landed the code switched on `group_confirmed`, which was wrong in name if not in effect.
- The contract's 409 on `getEventIcs` still `$ref`s the shared, code-agnostic `Conflict`
  response, so nothing in the schema says *which* code it carries; it is only discoverable
  from the ARCHITECTURE table. A one-line `description` on that response would fix it.
- `DELETE /groups/{slug}/confirmation` declares a 409 but the contract does not say what it is
  for. The mock treats unconfirming an already-open group as idempotent and answers 200.

## Assumptions made

- Voting is gated on the group's state only, not on `my_role`: a non-member receives 404 for
  the group at all, so a group that renders is one the reader belongs to. Only the confirmation
  controls are gated on `my_role === "owner"`.
- The task said both vote mutations invalidate the proposals query *and* that the PUT's response
  body should be used rather than refetched for no reason. Both were done: the splice gives the
  reader the new tally at once and the invalidation keeps the cached page and its validator
  honest. The cost is one unconditional GET per vote.
- `send_reminders` is sent explicitly even though the contract defaults it to true, because a
  default a caller silently relies on is one that can move underneath it.

## Follow-ups for later

- Rotating the feed token is not implemented; `GroupPatch.rotate_feed_token` exists in the
  contract and the panel only says the owner *can* rotate it.
- Polling the group read on the availability screen doubles the conditional requests that
  screen makes. It is cheap (304 with no body) but if the interval is ever lowered it is worth
  revisiting.
- `ProposalsList.tsx` is now doing a fair amount; the row could reasonably become its own file.

## Commands to verify

From `frontend/` on Node 24:

```
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build && npm run check:api
grep -rnE "localStorage|sessionStorage" src/features src/pages   # only storageGuard.test.ts
grep -rnE "#[0-9a-fA-F]{3,8}" src --include='*.tsx' --include='*.ts'   # no matches
```

By hand: `npm run dev:mock`, vote on a proposal, confirm it as the owner, see the grid become
read-only and the confirmed window appear on the detail view, download the `.ics` and open it,
then unconfirm.
