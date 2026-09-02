# TeamVelocity — implementation prompt

> Paste the block below into your goal command (e.g. `/lfg`, `/ce-work`, or your `/goal`).
> It is tuned for an autonomous, compound-engineering build that stops at **green locally**.

---

Build **TeamVelocity** v1 end-to-end, autonomously, in this repository.

## Read first (these are the source of truth)
- `CLAUDE.md` — stack, architectural invariants, conventions, lint/test rules.
- `docs/prd.md` — the full spec. §3 architecture & invariants, §5 connector plugin interface,
  §6 data model + on-disk JSON contract, §7 velocity + PR-score formulas, §8 UI/drill-down,
  §11 testing strategy, §12 project structure, §14 build order.

Treat `docs/prd.md` as authoritative. If you find a genuine gap or contradiction, make the
smallest reasonable decision, **write it down in `docs/prd.md`**, and continue — do not stop to
ask.

## How to work
- **Use compound engineering.** Plan the work (ce-plan) into the milestones in `docs/prd.md §14`,
  then implement it (ce-work). Run a self code-review (ce-code-review) before you call it done and
  fix what it finds. Use subagents for independent workstreams to conserve context.
- **Autonomy:** this is a single-run build. Do **not** stop for check-ins or approval gates. Do
  **not** push or open a PR. Finish by committing to a feature branch (see Done).
- **Verify libraries with context7** before writing code that calls Vite, React 19, Tailwind v4,
  shadcn/base-ui, Recharts, Zod, or Octokit / the GitHub GraphQL API.
- **Package manager is Bun.** Never npm/yarn/pnpm.
- **Git:** if this directory is not yet a git repository, `git init` first and make an initial
  commit of the existing docs/config (`CLAUDE.md`, `docs/`, `.claude/`). Then create and work on
  `feature/teamvelocity-v1`. Conventional commits, committed in logical increments (not one giant
  commit). End each commit message with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Testing (required — this is not optional)
- **TDD (red → green → refactor) for the pure logic in `shared/`**, written test-first:
  - **week bucketing** across every `sprintStartsOn` + `sprintStartHour`, DST boundaries, and
    empty (no-activity) weeks;
  - **velocity (0–100)**: cold start / "warming up", a median week ≈ 50, a stronger week trending
    up, a PTO/quiet week trending down, MAD≈0 fallback, clamping at 0 and 100;
  - **PR relevance score**: correct ordering, and normalization edges (single PR in a week,
    all-signals-equal);
  - **config loader + on-disk JSON**: valid input parses, invalid input is rejected with a clear
    error message.
  Run these date-sensitive tests under a fixed timezone (`TZ=Europe/Prague`).
- **Integration (Vitest):** the GitHub connector against **recorded fixtures** (no live network in
  tests) asserting normalized entities; the writer emits Zod-schema-valid JSON.
- **E2E (Playwright)** over the committed sample dataset, written right after each feature:
  team-select (and auto-skip when only one team); the full **Team → Week → Person → Repo**
  drill-down and deselect; a date-range change updates the charts; a PR row links out to GitHub;
  and the "no data yet" empty state.
- Ship a small **committed sample dataset** under `public/data/sample/` so `bun run dev` and the
  e2e suite work with zero network and no token.

## Definition of Done (all must hold; show the evidence)
1. `bun run lint` — **0 errors, 0 warnings.**
2. `bunx tsc --noEmit` — clean (strict, no `any`, no unexplained `@ts-ignore`).
3. `bun run test` — **all** Vitest unit + integration tests green, including every logic case listed above.
4. `bun run test:e2e` — **all** Playwright specs green against the sample dataset.
5. `bun run dev` boots and the app renders on the sample dataset: team-select works, the full
   drill-down works, the date-range picker works, empty/warming-up states render. Include a
   screenshot of the running dashboard as proof.
6. `bun run pull` runs against `teamvelocity.config.example.json` structure end-to-end and writes
   Zod-valid JSON to `public/data/` (use fixtures/a dry-run path so it needs no real token in CI;
   if a real token is present in `.env` it performs a real pull). No secret is ever written to
   `public/data/`, imported by `src/`, or logged.
7. **Architectural invariants hold** (`CLAUDE.md` / `docs/prd.md §3`): `src/` imports neither
   `cli/` nor Octokit nor the token and makes no GitHub request; connectors contain no metric
   math; `SourceConnector` is a clean plugin interface with GitHub as the only v1 implementation.
8. `teamvelocity.config.example.json` and `.env.example` exist and are committed; the real config,
   `.env`, and generated `public/data/` (except `sample/`) are git-ignored.
9. `README.md` documents setup, `.env`/config, and the weekly workflow (`bun run pull` →
   `bun run dev`).
10. The repo is initialized if needed and work is committed to `feature/teamvelocity-v1` in
    conventional-commit increments. **Do not push and do not open a PR.**

## Guardrails (must-not)
- No backend, server, database, Supabase, Vercel, or deployment config. Static SPA + local CLI only.
- Don't leave any test red or any lint warning. "Pre-existing / flaky" is not an exception.
- Don't hardcode colors/spacing — use the `@theme` OKLCH tokens.
- Don't invent scope beyond `docs/prd.md`; the Bitbucket/JIRA connectors and the in-browser
  "Refresh" button are explicitly **future** — leave the interface seam, don't build them.

When every Definition-of-Done item is satisfied and verified, stop and summarize what was built,
the test counts, and how to run it.
