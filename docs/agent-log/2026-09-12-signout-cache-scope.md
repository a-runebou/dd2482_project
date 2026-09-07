# Signout cache scope

## Task

T6b: sign-out clears the whole query cache, including the configuration query
(`["config"]`), which forces the boot gate in `RootLayout` back to its loading
state right after signing out. Scope the sign-out cache reset to user-scoped
data only, leaving the configuration query intact.

## Model

Sonnet

## Files changed

- `frontend/src/features/auth/signOut.ts` — replaced `queryClient.clear()`
  with `queryClient.removeQueries({ predicate })`, keeping any query whose
  key's first segment matches `configQueryOptions.queryKey[0]`.
- `frontend/src/features/auth/signOut.test.ts` — new colocated test file
  (none previously existed for this module; sign-out was previously exercised
  only indirectly through `SessionStatus.test.tsx`).

## What I did

1. Preflight: `git status --short` showed only `.DS_Store`, so proceeded.
2. Wrote a failing test populating the cache with the config query
   (`configQueryOptions.queryKey`, via `configFixture`) and a
   `["groups", "list"]` query, calling `signOut`, and asserting the config
   entry survives while the groups entry is removed. Confirmed it failed
   against the old `queryClient.clear()` implementation.
3. Changed `signOut` to call `queryClient.removeQueries` with a predicate
   that keeps any query whose key's first element equals
   `configQueryOptions.queryKey[0]` ("config"), rather than clearing
   everything or enumerating feature keys. The session store clear
   (`clearSession()`) and the point in the flow (still in `finally`) are
   unchanged.
4. Added a second test asserting the session store is still cleared after
   sign-out, so that existing behaviour is proven, not just assumed.
5. Searched the whole `frontend/src` tree for other whole-cache resets
   (`.clear()`, `removeQueries`, `resetQueries`) — the one in `signOut.ts`
   was the only one. Nothing else needed changing.

## Discrepancies noticed

- The task described "extend the existing sign-out test file", but no
  colocated `signOut.test.ts` existed; sign-out was only tested indirectly
  through `SessionStatus.test.tsx`. Created the colocated test file instead
  of extending it, since it did not exist.
- `RootLayout` gates on **two** queries: `configQueryOptions` (`["config"]`)
  and `sessionProbeQueryOptions` (`["auth", "probe"]`). The predicate here
  only preserves the config query, per the task's instructions and its
  "configuration is public, not user data" framing. The probe query is still
  removed by `removeQueries` and, being an active query, is refetched
  immediately by its observer. In practice `refreshSession()` resolves to
  `false` rather than throwing (per F17/F18 — being signed out is a normal
  outcome, not a failure), so this refetch cannot re-enter the boot failure
  state, but it can theoretically cause a brief re-render while it resolves.
  `sessionProbe.ts` was not in scope for this task, so I did not touch it;
  flagging in case the by-hand check below shows any flash.

## Assumptions made

- "Configuration query" means the query under `configQueryOptions.queryKey`
  (`["config"]`) exported by `frontend/src/api/config.ts`, matched by its
  first key segment so a future config-adjacent key (if ever nested under
  `["config", ...]`) would also survive without further changes here.
- Creating a new colocated test file counts as "the colocated test" named in
  the file-scope list, since none existed yet.

## Follow-ups for later

- If the by-hand check below shows any loading-state flash from the session
  probe requery, that would need a fix in `sessionProbe.ts`, which is outside
  this task's file scope.

## Commands to verify

Run from `frontend/` on Node 24 (`nvm use 24`):

- `npm run typecheck` — exit 0
- `npm run lint` — exit 0
- `npm run format:check` — exit 0
- `npm test` — exit 0, 174 tests passed (28 files), 2 new tests added, no
  existing test modified
- `npm run build` — exit 0
- By hand: `npm run dev:mock`, sign in through
  `/auth/callback?token=anything`, sign out, confirm the "Sign in" link
  appears without a boot loading-state flash.
