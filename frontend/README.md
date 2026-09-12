# Schedular frontend

React 19 + TypeScript SPA for Schedular, built with Vite.

## Requirements

Node.js 24 or later (see `.nvmrc`).

## Scripts

- `npm run dev` — start the Vite development server with hot module replacement.
- `npm run dev:mock` — start the development server against the in-browser MSW mock worker, with no backend running.
- `npm run build` — type-check the project, then produce a production build in `dist/`.
- `npm run preview` — serve the production build locally for a final check.
- `npm run generate:api` — regenerate TypeScript types from the API contract in `../contracts/openapi.yaml`. The contract is the single source of truth; the generated output is never edited by hand. Commit the result after any contract change.
- `npm run check:api` — verify that the generated types are up-to-date with the contract, using `openapi-typescript`'s built-in `--check` flag. Exits non-zero if `src/api/generated/schema.d.ts` is missing or out of sync.
- `npm run typecheck` — run `tsc -b --noEmit` across the application and config projects.
- `npm run lint` — run ESLint.
- `npm run format` — apply Prettier formatting.
- `npm run format:check` — check formatting without writing changes.
- `npm test` — run the Vitest suite once.
- `npm run test:watch` — run the Vitest suite in watch mode.

## Development mocking

`npm run dev:mock` runs the app against an MSW service worker in the browser, so the frontend works with no backend. It uses `vite --mode mock`, which loads `.env.mock` and sets `VITE_API_MOCKING=enabled`; the worker starts only when that flag is `enabled` and only in a development build, so production bundles contain no mock code. Plain `npm run dev` leaves mocking off, so the app shows its normal boot-failure state until a real backend answers `GET /api/v1/config`.

`npm run dev` forwards `/api` requests to a backend expected at `http://localhost:8000` (the contract's local server). Without a backend running, the application displays its failure state, allowing you to verify error handling. `npm run dev:mock` requires no backend.

Two environment variables control this (see `.env.example`):

- `VITE_API_BASE_URL` — override the API base URL; unset means the relative `/api/v1` path on the app's own origin.
- `VITE_API_MOCKING` — set to `enabled` to turn on the browser mock worker in development.
