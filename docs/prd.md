# TeamVelocity — Product Requirements Document

> A local-first, backend-free tool that turns a software team's GitHub (later Bitbucket/JIRA)
> activity into weekly analytics: a team **velocity** trend, per-member and per-repo
> contribution breakdowns, and a ranked list of the week's most meaningful PRs for status reports.

**Status:** approved design, ready for implementation
**Date:** 2026-09-02
**Owner:** Martin Večeřa

---

## 1. Goal & philosophy

I want a small utility that gives me *insight into how my team works* — not a scoreboard.
I run one team (sometimes several) in weekly sprints and want to see, at a glance:

- how the team's overall rhythm ("velocity") trends week over week,
- what each person has been focused on and their style of contribution,
- which pull requests mattered most this sprint, so I can write status reports quickly.

**This is explicitly not a tool for evaluating or ranking people.** The metrics describe
*contribution volume and shape*, not individual worth. Copy in the UI must reflect that.

### Non-goals

- No backend, no server, no database, no cloud deployment (no Vercel, no Supabase).
- No authentication / multi-user access control — it runs on my machine only.
- No writing back to GitHub; read-only analytics.
- No real-time streaming; data is a weekly snapshot refreshed on demand.

---

## 2. Users & core workflow

Single user (a team lead) on their own laptop.

```
1. Configure teams + members (+ optional private repos) in teamvelocity.config.json
2. Put a GitHub Personal Access Token in .env
3. Weekly, after the sprint boundary:  bun run pull
      → CLI fetches fresh data via connector plugins, aggregates by week, writes JSON
4. bun run dev  → open the local browser app
      → pick a team → explore velocity + drill down → copy the top PRs into a status report
```

"Fresh data" == re-run `bun run pull`, then refresh the browser tab. The app itself never
calls GitHub and never sees the token.

---

## 3. Architecture

Two halves that share one source-agnostic **aggregation library**.

```
                         teamvelocity.config.json   .env (GITHUB_TOKEN)
                                    │                     │
                                    ▼                     ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  CLI PULLER  (bun run pull)  — Node/TS, has the token           │
  │                                                                 │
  │   config (zod)                                                  │
  │      │                                                          │
  │      ▼                                                          │
  │   SourceConnector plugins  ── GitHub (Octokit) ──┐              │
  │   (fetch + normalize)         Bitbucket (future) │              │
  │                               JIRA (future)      │              │
  │                                                  ▼              │
  │   normalized: PullRequest[] Commit[] Comment[] RepoRef[]        │
  │      │                                                          │
  │      ▼                                                          │
  │   AGGREGATION LIB (pure, source-agnostic, unit-tested)          │
  │     • week bucketing (sprint boundary)                          │
  │     • velocity (0–100)   • PR relevance score (0–100)           │
  │      │                                                          │
  │      ▼                                                          │
  │   writer → public/data/*.json  (validated against zod schema)   │
  └───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼  (static JSON files on disk)
  ┌───────────────────────────────────────────────────────────────┐
  │  REACT SPA  (bun run dev / Vite)  — NO token, NO GitHub calls   │
  │   fetch('/data/…') → render dashboards + drill-down             │
  └───────────────────────────────────────────────────────────────┘
```

**Hard architectural invariants** (enforced in review and, where feasible, by lint/structure):

1. The SPA (`src/`) must never import the connector layer, Octokit, the config file, or the
   token, and must never make a network request to GitHub. Its only data source is `fetch` of
   files under `/data/`.
2. Connectors only **fetch + normalize**. They contain no metric math. All aggregation and
   scoring lives in the shared library and is identical across sources.
3. Velocity, PR-score, and week-bucketing are **pure functions** — deterministic given their
   inputs, no I/O — so they can be unit-tested directly (this is the TDD core).
4. Everything written to and read from `public/data/` is validated against a shared Zod schema.
   The CLI validates before writing; the SPA validates after fetching (fail loud on drift).

---

## 4. Configuration

### `teamvelocity.config.json` (git-ignored; ship `teamvelocity.config.example.json`)

```jsonc
{
  "teams": [
    {
      "id": "jdt",                       // stable slug used in data paths + URLs
      "name": "JDT",
      "sprintStartsOn": "Wed",           // sprint/week boundary: Mon..Sun (default Mon)
      "sprintStartHour": 0,              // hour of day the boundary flips (default 0 = midnight)
      "members": [
        { "name": "Jeff", "github": "jeffhandle" },
        { "name": "Jack", "github": "jackhandle", "bitbucket": "jack_bb" }
      ],
      "repos": [                         // OPTIONAL — explicit repos (needed for private ones)
        "acme/backend",
        "acme/web"
      ],
      "velocityWeights": { },            // OPTIONAL overrides — see §7.1
      "thresholds": { "red": 40, "green": 70 }  // OPTIONAL — velocity color bands
    }
  ]
}
```

- `github` may be a plain handle or a full profile URL (`https://github.com/jeffhandle`); the
  loader normalizes to a handle.
- Repo scope is **hybrid**: the GitHub connector auto-discovers repos from each member's PR /
  commit activity in the window **and** always includes the explicit `repos` list (this is how
  private repos that don't surface via search get covered).
- Config is parsed and validated with Zod; invalid config aborts the pull with a clear message.

### `.env` (git-ignored; ship `.env.example`)

```
GITHUB_TOKEN=ghp_xxx          # PAT with repo + read:org scope; used only by the CLI
```

---

## 5. Connector plugin interface

The single extension point. GitHub ships in v1; Bitbucket and JIRA must be addable later with
zero changes to the UI or the metrics.

```ts
export interface SourceConnector {
  readonly id: string                         // 'github' | 'bitbucket' | 'jira'
  /** True if this member has a handle this connector can use. */
  supportsMember(member: Member): boolean
  /** Fetch + normalize all contributions in [since, until) for the given members/repos. */
  collect(ctx: CollectContext): Promise<CollectResult>
}

export interface CollectContext {
  team: TeamConfig
  members: Member[]
  since: Date
  until: Date
  explicitRepos: RepoRef[]
  logger: Logger
}

export interface CollectResult {
  pullRequests: PullRequest[]   // normalized, see §6
  commits: Commit[]
  comments: Comment[]
  repos: RepoRef[]              // union of discovered + explicit
}
```

Connectors are registered in a small registry keyed by `id`; the puller selects the connectors
needed by the members present in a team. The **GitHub connector** uses Octokit (GraphQL for PR
detail — additions/deletions/reviews/participants/comments in one query; REST where simpler for
commits), authenticated with `GITHUB_TOKEN`, with rate-limit-aware backoff and per-week response
caching so re-pulls are incremental (already-closed weeks are not re-fetched).

> Verify current Octokit / GitHub GraphQL syntax via **context7** before writing connector code.

---

## 6. Data model

### 6.1 Normalized domain entities (in memory, produced by connectors)

- **RepoRef** `{ source, owner, name, url }`
- **PullRequest** `{ source, repo:RepoRef, number, title, authorHandle, state:'open'|'merged'|'closed', createdAt, mergedAt?, closedAt?, additions, deletions, changedFiles, commits, reviewCommentsCount, issueCommentsCount, reviewsCount, participants:string[], linkedIssues:number, url }`
  - `state:'closed'` == closed **without** merging (the "rejected" bucket).
- **Commit** `{ source, repo:RepoRef, sha, authorHandle, committedAt, additions, deletions, url }`
- **Comment** `{ source, repo:RepoRef, kind:'issue'|'review'|'review_summary', authorHandle, createdAt, prNumber?, url }`

### 6.2 On-disk JSON contract (`public/data/`, git-ignored; a small committed sample powers dev + e2e)

- `teams.json` — `[{ id, name }]` for the team-select screen (no member/token data leaked here).
- `<teamId>/meta.json` — `{ lastPulledAt, rangeStart, rangeEnd, source, sprintStartsOn, warmingUpUntil }`
- `<teamId>/index.json` — the full weekly series (loaded up front):
  ```
  { weeks: [ { weekStart, weekEnd, label, velocity, velocityBand,
               totals: { prsOpened, prsMerged, prsClosed, commits, comments, locAdded, locRemoved },
               members: [ { handle, name, velocity, totals } ] } ] }
  ```
- `<teamId>/weeks/<weekStart>.json` — drill-down detail for one week (lazy-loaded on selection):
  team PR list with scores; a team-level `repos:[{repo, totals, velocity, velocityBand, warmingUp}]`;
  per-member `{ totals, repos:[{repo, totals, velocity, velocityBand, warmingUp}], prs:[…],
  comments:[…], commits:[…] }`; per-PR relevance breakdown. Each repo carries its **own** velocity
  (§7.1, §8-D) — independent, not a share of the scope velocity. Each `commits` row is
  `{ sha, repo, authorHandle, committedAt, url }` — **no line stats**: live pulls don't fetch
  per-commit additions/deletions (LOC is delivered by PRs, §5), so the row carries only what every
  source can supply. This backs the repo drill-down's Commits tab.

`weekStart` is the ISO date (`YYYY-MM-DD`) of the sprint window start, used as the id in paths
and URLs. `label` is the human range, e.g. `2026/08/24–08/30`.

---

## 7. Metrics (the parts delegated to design)

Both metrics are **relative and self-normalizing** — there are no magic absolute thresholds, and
they adapt to the team's own history. Both are pure functions with configurable weights.

### 7.1 Team velocity (0–100)

A *team-rhythm* indicator, not a productivity grade. Requirements it must satisfy: 0–100 range,
drops on low-output weeks (e.g. PTO-heavy), rises on stronger weeks, colorable red/yellow/green.

**Step 1 — raw weekly signal.** Weighted sum of per-week signals, each log-dampened so a single
huge refactor or a burst of tiny commits can't dominate:

```
raw_w = wPR·log1p(mergedPRs)
      + wOpen·log1p(prsOpened)
      + wReview·log1p(reviews + reviewComments)
      + wCommit·log1p(commits)
      + wLoc·log1p(locAdded + locRemoved)
```

Default weights (overridable per team via `velocityWeights`): `wPR 1.0, wReview 0.7,
wCommit 0.5, wOpen 0.4, wLoc 0.3`. Weights are documented in one place.

**Step 2 — normalize against the team's own baseline.** Over a trailing window (default last 12
weeks, expanding while <12 weeks of history exist), compute the median and MAD (median absolute
deviation) of `raw`. Then:

```
velocity_w = clamp( 50 + K · (raw_w − median) / scale , 0, 100 )
   where scale = 1.4826·MAD  (fallback to a small epsilon when MAD≈0), K = 20
```

So a typical week lands near **50**, a clearly stronger week climbs toward 100, and a quiet /
PTO-heavy week falls toward 0 — automatically, because fewer contributions were made.

**Cold start.** Until enough history exists (default <4 weeks), mark those weeks "warming up"
(`meta.warmingUpUntil`); still show the value but flag it as provisional in the UI.

**Colors.** `velocity < thresholds.red (40)` → red, `< thresholds.green (70)` → yellow, else green.

**Per-member velocity.** The same function scoped to one member's contributions, normalized
against that member's own baseline, powers the "velocity of individuals" section.

**Range velocity (no week selected).** The velocity shown for the whole selected date range is
the mean of the per-week velocities in range.

### 7.2 PR relevance score (0–100)

Answers "which PRs are worth putting in the status report?" Per-PR, log-dampened, normalized
within the selected week's PR set (min-max to 0–1 per signal), then weighted:

```
signals: log1p(additions+deletions), log1p(changedFiles),
         log1p(reviewComments+issueComments+reviews),
         log1p(participants), log1p(commits), log1p(linkedIssues)
score = 100 · Σ(weight_i · normalized_i) / Σ(weight_i)
```

Default weights: LOC 0.25, review-activity 0.25, participants 0.2, files 0.15, commits 0.1,
linkedIssues 0.05 (overridable). Drives both the per-PR stacked-bar chart (x = PR#) and the
sortable **repo · PR# · title · score** table (default sort: score desc).

---

## 8. UI & interactions

Solarized-light aesthetic, calm and information-dense. One consistent mental model —
**Team → Week → Person → Repo** — where each level is a selectable card that filters everything
below it and carries a clear `[x]` to deselect. All selection state lives in the URL
(`/team/:teamId?range=&week=&member=&repo=`) so views survive refresh and are shareable.

### 8.1 Team-select screen (sketch 1)
Centered "Choose team" with a clickable card per configured team. **Skipped automatically when
only one team is configured** (go straight to its dashboard).

### 8.2 Dashboard (sketch 2)

**Header:** `Team: <name>` (left) · **date-range picker** + a **"?" help control** (right; the help
opens the two score formulas — §7.1/§7.2 — with the team's actual velocity weights) · **velocity
gauge** · **velocity history** line. The **gauge** is a segmented ring: the filled arc from 0 to the
value is split into its band portions (red up to the red threshold, then yellow, then green) over a
muted 0–100 track, so you see how far the value sits above red; big number + `VELOCITY` label
inside. The **history** line is coloured by score via a vertical gradient (red below the red
threshold, yellow, green above green) with band-coloured dots, and carries the **band legend**
(`< red · red–green · ≥ green`).

**Section A — Team weekly stacked bars.** X-axis = weeks in range; each bar stacks the five
categories; carries the **category legend** (PRs, commits, comments, LOC+, LOC−). Clicking a bar
selects that week; the latest week is selected by default; the selected week is highlighted and
**clicking it again deselects** it (→ range overview) — as does the week chip.

> Rendering decision (v1): PR/commit/comment counts are single digits while LOC is in the
> hundreds, so on a single stacked axis LOC would swamp the rest. The stacked bars therefore
> render LOC added/removed **scaled to hundreds of lines** (value ÷ 100) so all five categories
> stay visible; the tooltip always shows the **exact** counts and LOC. The legend flags the LOC
> series as “LOC+ (×100)”. Same scaling applies to the per-member (Section C) and per-repo
> (Section D) horizontal stacked bars.

> URL decision (v1): all selection state is encoded in **search params on the root path**
> (`/?team=&range=&from=&to=&week=&member=&repo=`) rather than a `/team/:teamId` path segment.
> This keeps the app a pure static bundle (no server rewrites, works from `file://` and any
> base path) while preserving “all selection state lives in the URL, shareable, refresh-safe”.
> A `data` param selects the fixture dir (used by e2e).

**Section B — Week detail.** For the selected week: a team-wide PR list
(`repo · PR# · author · title ····· score%`), each row clickable through to GitHub — the raw
material for a status report. If no week is selected, this area shows the range overview.

**Section C — Velocity of individuals.** Per-member horizontal stacked bars for the selected
week (with legend), expandable. **Bar length is the member's velocity (0–100 axis)**, printed
band-colored at the bar end; the **segments are each category's contribution to that velocity**
(`weight · log1p(count)`, scaled so the stack sums to the velocity — see §7.1), *not* raw
contribution volume, so the bar reads as the score. Clicking a member selects them and reveals,
below the bars, that person's **tabbed breakdown** — the same `PRs · Commits · Comments · LOC`
tabs used in the repo drill-down (§D), but spanning all of the person's repos, so each row is
tagged with its repo.

The **velocity-by-repo** bars (§D) give **each repo its own independent velocity** (0–100), computed
exactly like team/member velocity but on that repo's *own* weekly signal series normalized against
its *own* trailing baseline — team-wide for the team chart, per-member for a person's chart. Because
velocity is non-linear, repo bars are **not** a decomposition of the scope velocity and do **not**
sum to it (just as team velocity ≠ Σ member velocities). Per-repo velocity series are computed in
the CLI and stored in the week detail (`WeekDetail.repos` for the team; a `velocity` on each member
repo), since the SPA only holds one week and can't compute a baseline. Review activity isn't tracked
per repo, so all comments stand in for the review term there.

A **"?" help control** in the header opens a plain-language explainer for the two 0–100 scores
(velocity vs PR relevance), so the distinction in §7 is discoverable in-app.

**Section D — Selected person detail.** For the selected member + week:
- their PR list (`repo · PR# · title ····· score%`), clickable to GitHub;
- **velocity by repo** — horizontal stacked bars, one row per repo, repo name clickable to GitHub;
- **repo detail** (when a repo row is selected): the repo URL and a **tabbed breakdown** — the
  four contribution metrics (`PRs · Commits · Comments · LOC`) are the tab labels, each carrying a
  count/total and revealing its own list: PRs (`PR# · title ····· score%`), Commits
  (`date · short SHA · author`), Comments (`date · kind · on PR#`), and LOC (repo `+add/−del`
  total plus a per-PR line-change breakdown). One tab is always open (PRs by default).
- If no member is selected, this area reflects the whole team.

**Section E — PR relevance.** Per-PR stacked-bar chart (x = PR#, stacks = comments, LOC,
participants, …) feeding the sortable relevance table described in §7.2.

Empty / loading / warming-up / no-data-yet states are first-class (the app must be usable before
the first pull, showing a clear "run `bun run pull`" message).

---

## 9. Design system

- **Theme:** Solarized-light-inspired. Light background, muted base0x text tones, accents for the
  five categories and the red/yellow/green velocity bands, all defined once as Tailwind v4
  `@theme` tokens in OKLCH. Components reference tokens, never hardcoded hex.
- **Components:** shadcn (base-ui) first for primitives (cards, tables, popovers, tabs, select).
- **Charts:** Recharts (stacked bars, smooth line, radial gauge).
- **Type:** a clean sans for UI + a mono for IDs/PR numbers/LOC figures (tabular numerals).
- Fully keyboard-navigable drill-down; respects reduced-motion.

---

## 10. Tech stack

- **App:** Vite + React 19 + TypeScript (strict).
- **Styling:** Tailwind v4 (`@theme`, OKLCH), shadcn/base-ui, `tw-animate-css`.
- **Charts:** Recharts. **Validation:** Zod. **State:** URL search params + a light store
  (Zustand) for loaded data only.
- **CLI:** Node/TS run via Bun; Octokit for GitHub.
- **Runtime / package manager:** Bun (never npm/yarn/pnpm).
- **Tests:** Vitest (unit/integration) + Playwright (e2e).
- **No** Next.js, Supabase, Vercel, or any database.

---

## 11. Testing strategy

TDD (red-green) for the pure logic; tests written right after the feature for UI/e2e.

- **Unit (Vitest), test-first:**
  - week bucketing across every `sprintStartsOn` + `sprintStartHour`, DST boundaries, and weeks
    with no activity (run tests under a fixed `TZ` for determinism, e.g. `TZ=Europe/Prague`);
  - velocity: cold start, a median week ≈ 50, a strong week trending up, a PTO week trending down,
    MAD≈0 fallback, clamping at 0 and 100;
  - PR relevance: ordering, normalization edges (single PR in week, all-equal signals);
  - config loader + on-disk JSON: valid parses, invalid config/JSON rejected with clear errors.
- **Integration (Vitest):** GitHub connector against **recorded fixtures** (no live network in
  tests) → asserts normalized entities; the writer produces schema-valid JSON.
- **E2E (Playwright)** over the committed sample dataset, written after each feature: team-select
  (and auto-skip with one team); the full Team→Week→Person→Repo drill-down and deselect; date-range
  change updates charts; a PR row links out to GitHub; the "no data yet" state.

---

## 12. Project structure

```
teamvelocity/
  package.json  vite.config.ts  tsconfig.json  vitest.config.ts  playwright.config.ts
  teamvelocity.config.example.json   .env.example
  src/                         # React SPA — never imports cli/ or the token
    main.tsx  App.tsx  router
    routes/         TeamSelect  Dashboard
    components/     charts/ (StackedBars, VelocityGauge, VelocityHistory, PrScoreChart)
                    cards/  tables/  drilldown/
    lib/            data-loading (fetch + zod), formatting, url-state, types
    theme/          globals.css (@theme solarized-light tokens)
  cli/                         # data puller — has the token, no React
    pull.ts                    # entrypoint (bun run pull)
    config.ts                  # load + zod validation
    connectors/  types.ts  registry.ts  github/
    writer.ts                  # emit + validate public/data
  shared/                      # pure, source-agnostic; imported by cli/ AND tested directly
    aggregate/   weeks.ts  velocity.ts  pr-score.ts
    schema/      zod schemas shared by cli writer and spa loader
    types.ts
  public/data/                 # generated (git-ignored) + a committed sample/ fixture set
  docs/                        # this PRD + any specs
  e2e/                         # Playwright specs
```

Scripts: `bun run pull`, `bun run dev`, `bun run build`, `bun run test`, `bun run test:e2e`,
`bun run lint`.

---

## 13. Non-functional requirements

- **Incremental & resilient pulls:** cache per-week responses; a re-pull only refreshes the
  current (open) week and any explicitly requested range; a mid-pull failure for one repo/member
  is logged and skipped, not fatal.
- **Rate limits:** respect GitHub limits with backoff; a `--since`/`--until` (or `--weeks N`) flag
  on the puller for bounded backfills.
- **Determinism:** identical inputs → identical JSON (stable ordering) so diffs are meaningful.
- **Fail loud on schema drift:** both writer and loader validate against the shared Zod schema.
- **Secret hygiene:** the token lives only in `.env`; it is never written into `public/data/`,
  never imported by `src/`, never logged.

---

## 14. Build order (suggested milestones for the implementation plan)

1. Scaffold (Vite+React+TS, Tailwind v4 tokens, Bun, Vitest, Playwright, lint) + shared types/schema.
2. Shared aggregation lib **test-first**: week bucketing → velocity → PR-score.
3. Config loader (Zod) + `.env`; connector interface + registry; GitHub connector (fixtures).
4. Writer → `public/data`; generate a committed sample dataset for dev/e2e.
5. SPA data-loading + URL state; theme/tokens.
6. Dashboard sections A→E + team-select; wire the drill-down.
7. E2E over the sample dataset; polish states (empty/loading/warming-up); README.

---

## 15. Future (interface-ready, out of v1 scope)

- Bitbucket and JIRA connectors (implement `SourceConnector`; no UI/metric changes).
- Optional in-browser "Refresh data" via a **dev-only** Vite middleware that shells out to the
  puller (keeps production a pure static build; leave a seam, don't build it in v1).
- Per-team custom weight tuning UI; export of a status-report draft.
