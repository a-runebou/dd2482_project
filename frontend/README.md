# Schedular frontend

React 19 + TypeScript SPA for Schedular, built with Vite.

## Requirements

Node.js 24 or later (see `.nvmrc`).

## Scripts

- `npm run dev` — start the Vite development server with hot module replacement.
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
