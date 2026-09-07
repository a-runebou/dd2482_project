# 2026-09-13 — Visual design pass (T13)

## Task

Give the frontend a deliberate visual design: one token set, a small set of shared primitives,
and every existing screen rebuilt on them, with no change to behaviour. Direction chosen by
Adrian at the start of the session: quiet utilitarian — warm-grey neutrals, a single deep
indigo accent, generous whitespace, small radii, hairline borders instead of shadows, system UI
font stack.

## Model

Opus 5.

## Files changed

- `frontend/src/index.css` — the token set (`@theme`) and a base layer for `body`.
- `frontend/src/components/` — new: `cx.ts`, `Button.tsx`, `Field.tsx`, `TextInput.tsx`,
  `Textarea.tsx`, `Select.tsx`, `Card.tsx`, `PageContainer.tsx`, `PageHeading.tsx`,
  `Spinner.tsx`, each with a colocated test written first. Restyled: `ApiErrorNotice.tsx`.
- `frontend/src/app/` — `RootLayout.tsx` (now also renders the application header),
  `BootFailure.tsx`, `RootErrorBoundary.tsx`, `RootLayout.test.tsx` (two tests appended).
- `frontend/src/pages/` — `HomePage.tsx`, `NotFoundPage.tsx`, `SignInPage.tsx`,
  `GroupsPage.tsx`, `CreateGroupPage.tsx`, `AuthCallbackPage.tsx`.
- `frontend/src/features/auth/` — `SignInForm.tsx`, `SessionStatus.tsx`.
- `frontend/src/features/groups/` — `GroupsList.tsx`, `CreateGroupForm.tsx`,
  `InviteLinkPanel.tsx`.
- `docs/frontend/DECISIONS.md` — F20 appended.
- `docs/agent-log/2026-09-13-visual-design-pass.md`, `docs/agent-log/INDEX.md`.

No test file other than `RootLayout.test.tsx` was touched, and that one only by appending.

## What I did

**Preflight.** `git status --short` listed only `?? .DS_Store`, so the tree was clean.
`npm test` baseline: **28 files, 174 tests**. Node v24.21.0, matching `.nvmrc`.

**Tokens** (`src/index.css`). Tailwind v4 CSS-first, so `@theme` *is* the configuration.
Five warm neutrals plus white (`50 #fafaf9` page, `200 #e7e5e4` hairline and disabled surface,
`500 #78716c` control border and placeholder, `600 #57534e` muted text, `900 #1c1917` ink),
accent `#4338ca` with hover `#3730a3` and subdued `#eef2ff`, danger `#b91c1c`. Five type sizes
(12/14/16/20/28) with line heights, weights 400 and 600, radii 4/6/8, shadows `sm` and `md`
(neither is currently used: cards get a border instead, which is the direction). Spacing left on
Tailwind's default scale.

**Primitives.** Written test-first; the tests were confirmed red before any implementation
existed. `Button` takes `variant` (`primary`, `secondary`, `quiet`), defaults to
`type="button"`, exposes the variant as `data-variant` so a test can assert on it without
asserting on a class name, and forwards everything else. Disabled is rendered as a muted
fill with a legible label, never as reduced opacity, because opacity below full makes the label
fail contrast. `Field` generates the control id with `useId` and wires `aria-describedby` and
`aria-invalid`; the control is a render prop, because the wiring has to reach the control
itself. `TextInput`, `Textarea` and `Select` share one `CONTROL` class and forward all props
including `ref` (React 19 ref-as-prop, which is what `InviteLinkPanel` needs). `PageContainer`
renders the `main` landmark and forwards `role`, so the boot and callback screens stay
`role="status"` / `role="alert"` without nesting an extra element. `Spinner` is
`aria-hidden`, so it goes *inside* an existing `role="status"` rather than replacing one.

**Chrome.** A single application header now lives in `RootLayout`, inside the success branch of
the boot gate only — the boot loading and boot failure screens stay full-page and chrome-free.
It holds the product name as a link to `/` on the left and `SessionStatus` on the right.
`SessionStatus` moved off `HomePage`; its own tests render it standalone at a route of their
own, so they were unaffected. `HomePage` keeps its `<h1>Schedular</h1>`, which several boot-gate
tests use as the proof that boot succeeded; the header's product name is a link, not a heading,
so there is still exactly one element with role `heading` and name "Schedular".

**Screens.** Every screen listed in the task now uses `PageContainer` + `PageHeading` and the
primitives. Roles, labels, error associations and text content are unchanged. `GroupsList` keeps
one `<li>` per group (its tests use `.closest("li")`), with the content moved inside a `Card`.

**Layout.** One maximum width (`max-w-2xl`) and one horizontal padding (`px-4`, `sm:px-6`) on
every route, header included, so the header's inner column lines up with the page column.

## Discrepancies noticed

- The acceptance grep as written in the task fails under zsh, which expands `--include=*.tsx`
  as a glob and errors with "no matches found" before `grep` ever runs. Quote the patterns:
  `grep -rnE "#[0-9a-fA-F]{3,8}\b" src --include="*.tsx" --include="*.ts"`. It then exits 1
  with no output, which is the required result.
- `ApiErrorNotice` previously carried its own `mt-4`. A shared component should not decide its
  own position in someone else's layout, so the margin moved to the four call sites.

## Assumptions made

- **The end-date hint is now an accessible description.** `CreateGroupForm`'s "The end date is
  included in the range." was a bare `<p>` after the input, associated with nothing. Adopting
  `Field` puts it in `aria-describedby`, ahead of the error when both are present. This
  strengthens the accessible description rather than weakening it, and no test asserts on that
  field's description. It also moves the hint above the input rather than below it.
- **No text was changed and none was added.** I drafted short descriptive subtitles for the
  page headings and then removed them: the task allows wording changes only where a screen is
  inconsistent with a sibling, and none was.
- **No `Card` on the sign-in form itself**, only on the states that follow it (the confirmation,
  the invite panel, the empty groups list). A form on a page does not need a second surface.
- `accent-subtle` is used only as the quiet button's hover wash. It is the one place a subdued
  accent earns its place; an unused theme token would be dead configuration.
- Shadows `sm` and `md` are defined per the task's "at most three of each" but are not applied
  anywhere yet, because the direction calls for hairline borders. They are there for the first
  thing that genuinely floats (a menu, a dialog), not as decoration for cards.

## Contrast, computed not estimated

Ratios are WCAG 2.x relative-luminance ratios, computed from the token hex values.
All pairings introduced by this change:

| Pairing | Ratio | Needs | Use |
| --- | --- | --- | --- |
| neutral-900 on neutral-50 | 16.74:1 | 4.5 | body text on the page |
| neutral-900 on white | 17.49:1 | 4.5 | body text on a card, and control text |
| neutral-600 on neutral-50 | 7.30:1 | 4.5 | muted text on the page |
| neutral-600 on white | 7.63:1 | 4.5 | muted text on a card |
| neutral-500 on white | 4.80:1 | 4.5 | placeholder text in a control |
| accent on neutral-50 | 7.57:1 | 4.5 | link on the page |
| accent on white | 7.90:1 | 4.5 | link on a card or in the header |
| accent on accent-subtle | 7.07:1 | 4.5 | quiet button label on its hover wash |
| danger on neutral-50 | 6.19:1 | 4.5 | field error text on the page |
| danger on white | 6.47:1 | 4.5 | error text in the error notice |
| white on accent | 7.90:1 | 4.5 | primary button label |
| white on accent-hover | 9.93:1 | 4.5 | primary button label, hovered |
| neutral-600 on neutral-200 | 6.08:1 | 4.5 | disabled button label |
| neutral-500 on white | 4.80:1 | 3.0 | control border on a card |
| neutral-500 on neutral-50 | 4.59:1 | 3.0 | control border on the page |
| danger on white | 6.47:1 | 3.0 | invalid control border |
| accent on neutral-50 | 7.57:1 | 3.0 | focus outline on the page |
| accent on white | 7.90:1 | 3.0 | focus outline on a card or the header |

Nothing falls below its threshold; the smallest margin is the control border on the page at
4.59:1 against a 3:1 requirement. `neutral-200` as a hairline (1.26:1 on white) is decorative
only: no control is identified by it, and no information is carried by it.

Every interactive element carries the one focus treatment: buttons and controls through `FOCUS`
in `Button` and `CONTROL`, links through `LINK`, and the header's product name through `FOCUS`
directly. This was checked by grepping for every `<Link`, `<button>`, `<input>`, `<select>` and
`<textarea>` in non-test sources and confirming each one.

## Follow-ups for later

- The 375px walk is still a manual check (it is the one acceptance item assigned to Adrian).
  The layout is built for it — one column below `sm`, `flex-wrap` on the header and on every
  button row, `w-full` controls — but it has not been looked at in a real browser.
- The header has no navigation. When a second destination exists, "Your groups" probably wants
  to move from the home page into the header, and that is the point at which a mobile pattern
  becomes a real question.
- `shadow-sm` and `shadow-md` are defined and unused. If nothing claims them by the time the
  next screen lands, drop them.
- `PageHeading` accepts `level`, which only `SignInForm`'s confirmation would want; it currently
  renders its own `h2`. Worth unifying if a third such heading appears.

## Commands to verify

From `frontend/` on Node 24:

    npm run typecheck     # exit 0
    npm run lint          # exit 0
    npm run format:check  # exit 0
    npm test              # exit 0 — 37 files, 212 tests (baseline was 28 files, 174 tests)
    npm run build         # exit 0
    npm run check:api     # exit 0
    grep -rnE "#[0-9a-fA-F]{3,8}\b" src --include="*.tsx" --include="*.ts"   # exit 1, no output

By hand: `npm run dev:mock` and walk every screen at desktop and 375px widths; `npm run dev`
with no backend for the boot failure state.
