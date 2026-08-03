# DECISIONS

Choices made where the brief was ambiguous, plus anything the brief asked to be
justified here. Each entry states the decision and the reason, nothing else.

## Repo placement

Built in a Claude session originally scoped to `Joshh031/battleplan-next`
(branch `claude/reload-app-build-q3y190`), then moved to this standalone
`reload` repo with a clean history — the nine phase commits only, no
battleplan ancestry.

## Dependencies

Runtime dependencies: `react`, `react-dom`. That is all — 2 of the budget of 5.
Dev-only: vite, @vitejs/plugin-react, typescript, vitest. Fonts are vendored as
static woff2 files (required for the offline constraint; a fonts CDN would break
airplane mode on first offline load), not npm dependencies.

## Anthropic call uses raw `fetch`, not the SDK

The single capture-parse call is a browser-side `fetch` to
`POST /v1/messages` with the `anthropic-dangerous-direct-browser-access: true`
header. Using `@anthropic-ai/sdk` would spend a dependency slot on one call.
The API key is user-supplied in Settings and kept in `reload.settings`;
with no key set (or offline, or any error) capture parses locally and shows the
`parsed locally` marker — capture never blocks on the network, per the brief.

## Waiting penalty reference time

The brief's formula says the 50-point penalty applies when "waitingOn is set AND
lastNudged within 5 days", but the prose says a blocked card should be
non-actionable *until* it has sat long enough to warrant a nudge. Taken
literally, a card that was never nudged would surface immediately, which
contradicts the stated intent. Implemented: the penalty applies when
`(lastNudged ?? waitingSince)` is within the last 5 days. Setting `waitingOn`
starts the clock; each `Nudged` restarts it; after 5 quiet days the card
surfaces again. This matches the prose and keeps the formula shape.

## Place compatibility is strict equality plus `anywhere`

The brief lists one explicit exclusion (desk cards excluded on phone/home) and
says `anywhere` always matches. The simplest consistent rule is: a card is
compatible iff `card.place === selected` or `card.place === 'anywhere'`. So a
`phone` card does not surface at the desk. If that proves too strict in use,
loosening is a one-line change in `rank.ts`.

## Thread starvation baseline

`daysSinceThreadLastCompleted` needs a value for threads that have never had a
completion. Used: the most recent `lastTouchedAt` among the thread's done cards,
else `thread.createdAt`. A brand-new thread therefore starts with zero-ish
starvation rather than instantly dominating the ranking.

## "Shown because" fallback

When every score term is zero (no priority, no deadline, fresh card, fresh
thread, no fit bonus), the line reads `Shown because: oldest open card.` —
which is literally the tiebreak that selected it.

## Natural-language parse only fires for untouched forms

If the user manually set thread / minutes / place / reload in the capture form,
their explicit choices are authoritative and no API call is made. The parse
call fires only when the user typed a sentence and saved without touching the
structured fields — that is the natural-language path the brief describes.

## Snooze "Tomorrow" and "Next week"

Tomorrow = next local midnight (visible again on any session tomorrow).
Next week = +7 days at next midnight. "Pick a date" uses a plain date input;
the card returns at local midnight of the chosen day.

## Skip suppression scope

"Skipped in the current session" is scoped to one picker selection: skips
reset when the picker returns (after Done, or Esc). Within a viewing session a
skipped card never immediately returns; across sessions it competes again
unpenalised, which is what "without penalising the skipped one heavily" asks
for. An app-lifetime scope could exhaust a small deck into a false empty state.

## Stats definitions

- Days opened: distinct local days the app booted, stored in settings.
- Cards completed per week: total done outcomes / weeks since install (min 1 week).
- Skip rate: skip outcomes / all outcomes with a card shown.
- Median seconds to action: median `secondsToAction` over done/snooze/skip logs.
- "Threads with zero completions in 14 days" counts active threads only —
  parked threads are excluded by definition (they are admitted-idle).

## Sync (schema v3) — user override of the v1 scope

The brief excluded multi-device sync from v1; the owner overrode that after
first use (phone capture + desk execution is the real workflow). Design kept
deliberately small:

- Transport is the Firebase Realtime Database REST API of the existing
  `familyhub-d72f8` project (the battleplan pattern) via plain `fetch` —
  still zero new dependencies, no SDK, no auth flow. The sync location is
  `reload/{syncKey}`, where the key is a 128-bit random secret shared
  between devices through Settings. Same trust model as battleplan: anyone
  holding the key can read/write that path.
- Convergence is a record-level last-write-wins merge on a dedicated
  `updatedAt` revision (bumped on every mutation; `lastTouchedAt` keeps its
  scoring meaning and is deliberately not bumped by snooze). Cards and
  threads merge by id, session logs and opened-days union, so concurrent
  edits on two devices both survive. Merge is commutative (unit-tested).
- Triggers: boot, tab focus, reconnect, a 60s timer, and 2s after any local
  mutation. No live socket — polling is enough for a one-person, two-device
  workflow and keeps the app fully offline-tolerant; sync failures are
  silent everywhere except the Settings screen.
- RTDB strips nulls and empty arrays; `normalizePayload` restores the exact
  shapes the types promise before merging.

## Schema v2 strips demo data in place

Existing installs had seed data mixed with real entries. Migration 1→2
removes seed cards by their exact action text and then removes seed threads
that no longer hold any cards, so user-entered cards — including ones filed
under a seed thread like "House" — survive. Fresh installs are stamped v2
before the seeder runs, so first-load demo data still appears for new users
(and is removable with Reset or `?empty`).

## Reset does not reseed; Drop lives in Edit

Reset writes explicit empty arrays instead of deleting the storage keys, so
the demo seeder (which only fills untouched storage) does not resurrect the
seed cards on the next visit. Individual cards are removed via Edit → Drop
(`status: 'dropped'`), the status the data model already carried; the NOW
card and the Waiting list both stay free of any dedicated delete chrome.

## Icons

PWA icons are generated by `scripts/gen-icons.mjs` (hand-built PNG encoder,
no image dependency): ground background, three signal-colored bars. Maskable
safe zone respected by keeping the glyph in the center 60%.
