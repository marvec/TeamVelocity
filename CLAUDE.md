# TeamVelocity

A **local-first, backend-free** analytics tool for a software team's GitHub (later
Bitbucket/JIRA) activity. A CLI puller fetches + aggregates data into JSON files; a Vite/React
SPA reads those JSON files and renders weekly velocity + drill-down dashboards. **No server, no
database, no Supabase, no Vercel, no deployment.** The full spec is `docs/prd.md` — read it
before implementing anything.

# Always verify libraries against current docs

Your training data lags. Before writing code that calls **Vite**, **React 19**, **Tailwind v4**,
**shadcn/base-ui**, **Recharts**, **Zod**, or **Octokit / the GitHub GraphQL API**, verify the
current syntax and conventions via the **context7 MCP** (`plugin:context7:context7` →
`query-docs`, `resolve-library-id`). Make the query specific ("tailwind v4 @theme oklch tokens",
"recharts stacked bar chart v3", "octokit graphql search pullRequests additions deletions",
"vite public directory static assets"), not a broad topic. WebFetch official docs as a fallback.

# Tech stack

Framework, libraries, and language are readable from `package.json`. What isn't:

- **Runtime / package manager:** Bun — never use `npm`, `yarn`, or `pnpm`.
- **App:** Vite + React 19 + TypeScript (strict). A static SPA — no SSR, no server, no routing framework beyond a light client router.
- **CLI puller:** Node/TS run via Bun (`bun run pull`); Octokit for GitHub.
- **Styling:** Tailwind v4 (`@theme` inline, OKLCH), shadcn/base-ui primitives, `tw-animate-css`.
- **Charts:** Recharts. **Validation:** Zod. **Data-only state:** Zustand; **selection state:** URL search params.
- **Tests:** Vitest (unit/integration) + Playwright (e2e).
- **Deployment:** none. It runs on the user's machine via `bun run dev`.

# Architectural invariants (do not violate)

These come from `docs/prd.md §3` and are the point of the design:

1. **The SPA (`src/`) never touches GitHub or the token.** It must not import `cli/`, Octokit,
   the config file, or any secret, and must make no network request to GitHub. Its only data
   source is `fetch` of files under `/data/`.
2. **Connectors only fetch + normalize.** No metric math lives in a connector. All aggregation
   and scoring is source-agnostic and lives in `shared/aggregate/`, identical across sources.
3. **Velocity, PR-score, and week bucketing are pure functions** (no I/O) so they are unit-tested
   directly. This is the TDD core.
4. **Everything in `public/data/` is Zod-validated** — the CLI writer validates before writing,
   the SPA loader validates after fetching. Fail loud on drift.
5. **Source connectors are a plugin interface** (`SourceConnector`). GitHub ships first; adding
   Bitbucket/JIRA must need zero changes to the UI or the metrics.
6. **Secret hygiene:** `GITHUB_TOKEN` lives only in `.env` (git-ignored). Never write it into
   `public/data/`, never import it from `src/`, never log it.

# Git workflow

- Work on feature branches — never commit directly to `main`.
- Branch prefixes: `feature/`, `fix/`, `chore/`.
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`.
- End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

# Code conventions

- **Language:** English for all code — names, comments, files.
- **Components:** PascalCase filenames + exports (`VelocityGauge.tsx`). **Functions/vars:** camelCase.
- **TypeScript:** strict — no `any`, no `@ts-ignore` without an explanatory comment.
- **UI primitives:** use shadcn/base-ui first — don't hand-roll primitives.
- **Styling:** Tailwind only. Design tokens (colors, spacing, radii) are defined once in the
  `@theme` block in `globals.css` as OKLCH CSS variables; components reference tokens via class
  names — never hardcode arbitrary values like `text-[#3a3a3a]` or `p-[13px]`.
- **Themes:** five switchable token sets in `globals.css` — Daylight (default), Nightlight (dark),
  Poster, Sorbet, Solarized. The `@theme` block IS Daylight; every other theme is a
  `[data-theme="…"]` override of the same variables, stamped on `<html>` by `src/theme/themes.ts`
  and persisted in localStorage. New colors go into `@theme` AND every override block. Category +
  velocity-band colors are tokens; `band-*` is the fill, `band-*-ink` the text-safe step, and text
  never wears a bright band fill (use `BandChip` or the `-ink` class). Series hues were chosen by
  palette-validator search — keep the role→hue mapping (PRs blue · commits lime · comments violet ·
  LOC+ teal · LOC− orange · issues pink) when tuning.

# Tailwind v4

- No `tailwind.config.ts` — all config via `@theme inline` in `globals.css`.
- Colors in **OKLCH**. `tw-animate-css` replaces `tailwindcss-animate`.

# Lint & code quality

- **`bun run lint` must be clean before every commit — 0 errors, 0 warnings.** No exceptions.
- Write code that doesn't trip the rules in the first place. When a rule fires, understand why and
  fix the code — don't silence it. `eslint-disable` is a last resort: one line only
  (`eslint-disable-next-line <rule>`), never a whole file, always with a named rule and a
  `-- <reason>` comment. Warnings are deferred errors; same standard.

# Testing

- **No red test is tolerated** — regardless of who or what broke it. A failing test (unit,
  integration, or e2e) is fixed or explicitly escalated with a concrete finding; "pre-existing /
  not my change / flaky" is a description of state, not an excuse. Never claim "green" while a
  relevant test is red.
- **TDD for pure logic:** write tests first (red → green → refactor) for week bucketing, velocity,
  PR-score, and config/JSON parsing. UI + e2e tests are written right after their feature.
- **Unit/integration:** Vitest. Run date-sensitive tests under a fixed timezone
  (`TZ=Europe/Prague`) for determinism. Connector tests use **recorded fixtures — no live
  network**.
- **E2E:** Playwright over the committed sample dataset in `public/data/`.
- Run `bun run test` (and `bun run test:e2e` for UI work) before marking any task complete. Bare
  `bun test` invokes Bun's own runner (no `vi` global) — use the `bun run` script.

# Code navigation

Use the **cclsp MCP** (LSP) for symbol-level work — definitions, references, rename, call
hierarchy — instead of `grep`. Run `restart_server` the first time you use it in a session; its
index goes stale across sessions. First cclsp call should be file-based
(`find_definition`/`find_references`). Treat a fresh `bunx tsc --noEmit` as ground truth over
cclsp/IDE diagnostics when they disagree.

# Project structure & data contract

See `docs/prd.md §12` (structure) and `§6` (the `public/data/` JSON contract). Key dirs:
`src/` (SPA), `cli/` (puller), `shared/` (pure aggregation + Zod schema, imported by both cli and
tests), `public/data/` (generated, git-ignored; with a committed `sample/` fixture set), `e2e/`.
