# Frontend Decisions

F1 Package manager and runtime: npm and Node 24 LTS, pinned by `.nvmrc` and enforced by engines with engine-strict.

F2 Router: React Router, chosen for the fewest moving parts and no route code generation.

F3 Runtime API client: openapi-fetch, typed by the generated paths type; its middleware is the place for the bearer token and refresh-and-retry-once.

F4 Mocking: MSW, in Vitest and optionally in development, because it can script 304, 503 db_circuit_open with Retry-After and token_expired.

F5 Layout: hand-written API code in `src/api/`, generated types in `src/api/generated/`, generated output committed and verified by check:api.

F6 (provisional) API base URL: relative `/api/v1` by default, overridable at build time through `VITE_API_BASE_URL`; runtime configuration for the deployed image is undecided and depends on the CORS and origin question. Note: the resolver takes an explicit origin (`resolveBaseUrl(configured, origin)`) and the client passes `globalThis.location.origin`, because Node's `Request`, used by the Vitest jsdom environment, cannot parse a bare relative URL; in a browser this is equivalent to the relative default.

F7 Error model: `ApiError` kinds `problem`, `network` and `unexpected`; UI code switches on `code` only for kind `problem`, and a code outside `ErrorCode` is never cast, it is `unexpected`.

F8 Routing and boot: React Router data router in library mode, with no loaders or actions for server data. Routes render only after GET /config succeeds; boot failures are full-page states chosen by ApiError kind and code, with automatic retry only when Retry-After was readable.

F9 Source layout: src/api for data access, src/app for the shell (providers, routes, boot gate, error boundary), src/pages for route-level components. The layout for feature code is decided when the first feature lands.

F10 Development mocking: an MSW browser worker runs only in development and only under vite --mode mock (VITE_API_MOCKING=enabled). Handlers are shared with tests and match the real base URL. The production bundle contains no MSW code; the generated worker file is copied to dist but never registered.

F11 Dates: user-facing dates format in en-GB; calendar dates from the API (YYYY-MM-DD) are formatted as calendar dates and never converted through an instant or the browser's timezone.

F12 Feature layout: feature code in src/features/<feature>/ (query options, hooks, components, colocated tests), shared presentational components in src/components/, framework-free pure helpers in src/lib/, thin route components in src/pages/; query keys start with the feature name.

F13 Development API proxy: the Vite dev and preview servers forward `/api` to `http://localhost:8000`, the contract's local server, so the browser talks to a single origin in development, matching the single-origin proposal in item C1 of `docs/coordination/frontend-backend.md`.
F14 Group creation form: the timezone is preselected from the browser when `Intl.supportedValuesOf("timeZone")` contains the resolved zone, otherwise the contract default `Europe/Stockholm`, which is always present in the options so the preselection is selectable. The daily window is offered as 24-hour labels over minutes from local midnight, in steps of `config.slot_minutes` from `GET /config`, defaulting to 08:00 to 18:00, with the final end option labelled "24:00"; a label is a rendering of a minute offset, never a wall-clock instant. An `Idempotency-Key` is generated per distinct serialized body with `crypto.getRandomValues` (never `crypto.randomUUID`, which needs a secure context) and reused only when resubmitting identical values, so a retry after a failure is the same request and an edit is a new one. UX validation covers only a non-blank name, both dates present, the date order, the configured range limit and the window order; the schema's length limits belong to the backend and are surfaced through `errors[]`. Copying the invite link never relies on the clipboard API alone, because the development VM has no TLS (ARCHITECTURE R1): a missing or rejecting `navigator.clipboard` selects the field and shows the keyboard shortcut. `invite_url` exists only in component state, never in web storage, a URL, the query cache or the console, so the creation response is deliberately not seeded into the cache.

F15 Frontend image: a multi-stage build producing an nginx image that serves the static bundle and proxies `/api` to `BACKEND_ORIGIN`, substituted at container start. The application and the API therefore share one origin in every environment, which is the single-origin topology proposed in item C1. The image bakes in no API URL, so `VITE_API_BASE_URL` is not used in deployment and F6 needs no runtime mechanism.
