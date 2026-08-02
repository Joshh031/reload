# RELOAD

A context-restore layer. Given the number of free minutes available right now,
it shows the single thing to do, with everything needed already loaded. One
card at a time — never a list of open work.

Not a task manager, not a calendar, not a scheduler. The scarce resource is the
cost of reloading mental state.

## Run

```sh
npm install
npm run dev      # local dev
npm test         # rank + storage unit tests
npm run build    # production build to dist/
```

Deploy: Vercel, framework preset "Vite", output `dist/`. Bump `CACHE_VERSION`
at the top of `public/sw.js` on every deploy that touches deployed files.

## Keys

Press `?` in the app. `C` captures from anywhere; `1–5` picks the minutes.

## Data

localStorage only, single user. Export/Import (full replace, clipboard JSON)
lives in Settings — take an export before anything risky. Seed data loads on
first run; start empty with `?empty`.

The optional Anthropic API key in Settings enables the one LLM call in the
app: parsing a captured sentence into card fields. Without it (or offline)
capture parses locally and everything still works.

Design decisions and deliberate omissions: see `DECISIONS.md`.
