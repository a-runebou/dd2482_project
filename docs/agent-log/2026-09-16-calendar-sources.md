# Calendar source management

## Task
Expose the existing calendar-source backend through an authenticated frontend management page.

## Model
GitHub Copilot

## Files changed
- `frontend/src/features/calendar/calendarSources.ts`
- `frontend/src/pages/CalendarSourcesPage.tsx`
- `frontend/src/pages/CalendarSourcesPage.test.tsx`
- `frontend/src/mocks/fixtures.ts`
- `frontend/src/mocks/handlers.ts`
- `frontend/src/app/routes.tsx`
- `frontend/src/features/auth/SessionStatus.tsx`

## What I did
Added typed list, URL creation, ICS upload, refresh and delete mutations using the generated API client and idempotency keys. Added the `/calendar-sources` page with loading, empty, status, error-code and Retry-After states, plus authenticated navigation. Added MSW coverage and focused tests for loading, empty, URL add, upload, refresh, delete and Problem responses.

## Discrepancies noticed
The generated OpenAPI binary multipart field is typed as `string`, so the browser `File` crosses that generated-client boundary with a narrow cast. In the Node test runtime, multipart binary representation differs from a browser; the upload test asserts endpoint invocation.

## Assumptions made
The existing backend endpoints and generated contract are authoritative. Upload starts on file selection and source deletion does not require an additional confirmation because the current UI primitives do not establish a confirmation pattern for this page.

## Follow-ups for later
Consider per-source pending indicators and a confirmation step for destructive deletion if the product workflow requires them.

## Commands to verify
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run check:api`
- `git diff --check`

All frontend commands passed in a Node 24 Alpine validation environment; 454 tests passed.
