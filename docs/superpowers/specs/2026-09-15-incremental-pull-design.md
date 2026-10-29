# Incremental pulls — design

**Date:** 2026-09-15
**Status:** approved, ready for an implementation plan
**Implements:** PRD §13 ("Incremental & resilient pulls") and the caching clause of PRD §5

## 1. Problem

`bun run pull` re-fetches the entire history on every run. For the two configured teams
(7 GitHub handles each, ~26 weeks) that is 2 GraphQL searches per handle, each paginated at
50 nodes per page — roughly 28 requests per team, returning ~670 PR nodes for `jdt` and ~390
for `perf`, of which almost nothing has changed since the previous pull.

The goal is to minimize GitHub API calls. A 1–2 day overlap (re-fetching data already held) is
explicitly acceptable; exactness at the boundary is not required.

A second, structural motive: GitHub's `search` connection returns **at most 1,000 results** per
query. A growing team or a longer window will silently hit that ceiling, so an approach that
re-fetches all of history from a single search does not scale.

## 2. Decisions taken

These were settled before this document and are not re-opened here:

1. **History accumulates.** Once pulled, data is kept. `--weeks N` becomes *"reach at least N
   weeks back"*; it never truncates history that the cache already holds. The dataset's far end
   advances with every pull.
2. **`updated:` everywhere.** The authored-PR search moves from `created:` to `updated:` for both
   the initial backfill and incremental deltas. One rule for both paths, and it fixes an existing
   gap: a PR created *before* the window but merged inside it currently contributes no `prsMerged`
   and no LOC.
3. **The cache holds normalized entities and is owned by `cli/pull.ts`**, not raw GitHub payloads
   owned by the connector. One cache implementation serves every future connector.

Consequence of (3): normalization changes do **not** apply retroactively to already-cached data.
Improving `normalize.ts` (for example, fetching real per-commit LOC) requires `--full` to take
effect on history. This is the accepted cost of a source-agnostic cache.

## 3. Cache layout

One file per `(source, handle)`:

```
.cache/pull/<source>/<handle>.json
```

Git-ignored, disposable, never under `public/data/`. Handles are already normalized to
`^[A-Za-z0-9-]+$` by `GithubHandleSchema`, so they are safe as filenames.

```jsonc
{
  "version": 2,
  "source": "github",
  "handle": "angelozerr",
  "coverage": {
    "since": "2026-03-10T00:00:00.000Z",
    "until": "2026-09-15T09:12:00.000Z"
  },
  "prs": {
    "github:eclipse-jdtls/eclipse.jdt.ls#1234": {
      "pr":      { /* PullRequest, dates as ISO strings */ },
      "commits": [ /* Commit[], dates as ISO strings */ ]
    }
  },
  "comments": {
    "https://github.com/eclipse-jdtls/eclipse.jdt.ls/pull/1240": { /* Comment */ }
  },
  "commits": {
    "<sha>": { /* Commit — only for commits owned by no PR */ }
  },
  "repos": [ { "source": "github", "owner": "…", "name": "…", "url": "…" } ]
}
```

### Keys

| Collection | Key | Rationale |
|---|---|---|
| `prs` | `prIdentity(pr)` — the source's own opaque id (GitHub's GraphQL node id), falling back to `` `${repoKey(repo)}#${number}` `` | The location key embeds `owner/name`, so a repo rename or transfer would file the same PR under a second key and double-count it. The node id survives both. |
| `comments` | `url` | Every comment has one. A `review_summary` carries the reviewed PR's own URL, so within a single handle's file this gives exactly one entry per (handle, PR) — the intended cardinality. A composite `repo#pr:kind` key would instead collide for any future connector emitting several comments of one kind on one PR. **Note the flatten step keys on author *and* URL** (§6): across handles that same PR URL is shared by every reviewer, so URL alone would drop all but one reviewer's credit. |
| `commits` | `sha` | Only reached by connectors that emit PR-less commits. GitHub emits none today. |

### Why a PR bundles its commits

A pull request's commit set is **replaced wholesale** when the PR is re-fetched. Keying commits
independently by SHA would let a rebased or force-pushed PR accumulate the SHAs of every
rewritten version, permanently inflating the `commits` velocity signal (`wCommit`). Nesting the
commits under the PR record makes the correct behaviour the automatic one.

### Why per-handle, not per-team

- Every GitHub query is per-handle, so coverage is a per-handle fact.
- Two teams sharing a member share the cache for free.
- A member removed from the config is simply never read again — the reader is config-driven, so
  no pruning code is needed. (Note this matters: `buildTeamDataset` adds a contribution to
  *team* totals even when the author matches no configured member, so leaking a removed member's
  entities into the rebuild would silently inflate team velocity.)

Stale files for handles no longer configured are dead weight on disk only. No `--prune` flag in
this iteration.

## 4. Fetch planning

A new pure module, `cli/cache/plan.ts`:

```ts
export interface Window { since: Date; until: Date }
export interface Coverage { since: Date; until: Date }

export function planFetchWindows(
  coverage: Coverage | undefined,
  requested: Window,
  overlapDays: number,
): Window[]
```

Rules:

- `coverage === undefined` → `[requested]` (full backfill for that handle).
- Otherwise, up to two windows:
  - **back-gap** `[requested.since, coverage.since)` — emitted only when `requested.since <
    coverage.since`.
  - **forward-gap** `[max(coverage.since, coverage.until − overlapDays), requested.until]` —
    emitted only when `requested.until > coverage.until`.
- `[]` when the request is already fully covered.

`overlapDays` defaults to **2** and is settable with `--overlap-days N`.

`pull.ts` computes a plan per handle, groups the handles that need the **exact same window**
(`groupByWindow` in `plan.ts`), and calls `connector.collect()` once per group, oldest window
first. Handles kept in step share every window, so a routine pull makes one call per team; a handle
that fell out of step (just joined, cache discarded, last fetch failed) lands in a group of its own.
Only identical windows group — recording a narrower window as covered would strand data.

Inside `collect()` the GitHub connector searches each group in **batches**, ORing the members into
one query (`author:a author:b …`, `reviewed-by:a reviewed-by:b …`; repeated qualifiers are not
boolean operators, so GitHub's five-operator limit does not apply). Batches are sized so the query
stays within GitHub's 256-character limit — about 7 handles. Results are split back per member:

- **Authored PRs** go to the member matching `author.login`, case-insensitively. A PR naming none
  of them — seen live for PRs the Copilot agent opened on a member's behalf, and possible for
  deleted accounts — is credited only to a member whose *own* search returns it. Members taking
  part in the PR are asked first, and asking stops once every such PR has turned up, so this
  usually costs one extra query.
- **Reviewed PRs** carry `reviews(first: 100) { author { login } }`, and every batch member listed
  is credited. A list cut short at 100, or one naming no member, makes the batch re-ask each
  member alone. Live, the reviewer lists reproduced the per-handle searches exactly (JDT 180/180
  and perf 83/83 handle–PR pairs over six weeks), at no extra cost per page.
- **Over the 1000-result ceiling** a batch is halved and re-asked. The client gives up after the
  first page when `issueCount` already exceeds the ceiling, so pages that would be discarded are
  not fetched. Only a lone handle is ever reported as truncated.

Every search page costs one rate-limit point however few results it holds, so the old one query
per handle put a floor of 2 points per member under every pull. Measured on the two live teams (14
handles):

| Pull | Per handle | Batched |
| --- | --- | --- |
| Warm cache, ~2-day window | 28 points | 5 points |
| No cache, 6 weeks | 30 points | 12 points |
| No cache, 26 weeks | 52 points | 51 points |

A full backfill is dominated by result pages, so batching saves little there; the saving is on the
routine pulls this design exists for. The dataset written was byte-identical to the per-handle
code in all three comparisons (bar `lastPulledAt`).

## 5. Connector interface change

`collect()` returns one `CollectResult` per member (`CollectByHandle`, keyed by handle), so each can
be cached under its own coverage however the connector batched the requests behind it. Every
supported member gets an entry, even one with no activity — an empty, complete result is what lets
their window be recorded as covered.

`CollectResult` gains explicit commit ownership so the cache can replace a PR's commits as a unit:

```ts
export interface CollectedPr {
  pr: PullRequest;
  commits: Commit[];
}

export interface CollectResult {
  prs: CollectedPr[];
  /** Commits owned by no pull request. GitHub emits none today. */
  commits: Commit[];
  comments: Comment[];
  /** Union of discovered + explicit repos. */
  repos: RepoRef[];
}
```

`buildTeamDataset` keeps its flat `pullRequests` / `commits` / `comments` inputs — `pull.ts`
flattens on the way in. Files touched: `cli/connectors/types.ts`,
`cli/connectors/github/connector.ts`, `cli/pull.ts`, `cli/connectors/github/connector.test.ts`.
Nothing in `shared/aggregate/`, `src/`, or the on-disk `public/data/` contract changes.

## 6. Merge and rebuild

Per handle, in `cli/cache/merge.ts` (pure):

```ts
export function mergeHandleCache(
  cached: HandleCache | undefined,
  fetched: CollectResult,
  window: Window,
): HandleCache
```

- Replace by key in each collection (last write wins).
- A re-fetched PR replaces its whole `commits` array.
- `repos` becomes the union, deduped by `repoKey`.
- `coverage` becomes the union of the old coverage and `window`. Because plans only ever produce
  windows adjacent to or overlapping existing coverage, the union is always a single interval.

When a plan yields two windows, `mergeHandleCache` is applied once per fetched window, in the
order the windows were fetched, each merge folding that window into coverage. Merging is
associative over disjoint windows, so the order only matters for entities that appear in both —
where last-write-wins on the more recent fetch is the behaviour we want anyway.

Then `pull.ts`:

1. Loads the cache for every configured handle on the team.
2. Flattens to `pullRequests` / `commits` / `comments`, deduping PRs across handles by key
   (a PR can only be authored once, but the existing dedupe is kept as a guard).
3. Rebuilds the **entire** dataset with `buildTeamDataset`.

The full rebuild is not an optimization target: velocity is normalized against a rolling
baseline over the whole series, so a partially-rebuilt dataset would be wrong. Rebuilding is pure
CPU with no network cost.

### Dataset window

- `since = min(requested since, earliest coverage.since across the team's handles)`
- `until = max(requested until, latest coverage.until)`

With the default `--weeks 26` and no `--until`, this means: at least 26 weeks back, everything
ever pulled, ending now. `meta.rangeStart` / `meta.rangeEnd` report it as they do today.

## 7. Query changes

In `cli/connectors/github/octokit-client.ts`:

- `searchPrsByAuthor`: `author:${handle} type:pr updated:${since}..${until}`
  (was `created:`). Both searches then share windowing semantics, which is what makes a single
  coverage interval per handle correct.
- A search that yields ≥ 1,000 nodes has hit GitHub's documented `search` ceiling and lost its
  oldest matches. The client reports that as `truncated`, the connector turns it into
  `complete: false`, and the window is therefore **never recorded as covered** — so it is retried
  on every pull instead of the dropped matches being lost forever. It also warns, naming the
  handle and how to narrow the window.
- Add `rateLimit { cost remaining }` to both search queries and log the accumulated point cost
  per pull. It is free to request and it makes the saving this feature exists for measurable.

## 8. CLI flags

| Flag | Default | Meaning |
|---|---|---|
| `--full` | off | Discard the cached entities and re-fetch over `[min(requested.since, coverage.since), max(requested.until, coverage.until)]`, replacing the handle's cache. Widening to the existing coverage is deliberate: `--full` must not silently shrink accumulated history when `--weeks` is smaller than what the cache already holds. This is the only way to drop entities that disappeared upstream or to re-apply a `normalize.ts` change to history. |
| `--no-cache` | off | Neither read nor write the cache — today's behaviour. The dataset then covers only the requested window, so it does **not** accumulate; use it for one-off exploratory pulls, not for the regular refresh. |
| `--overlap-days N` | `2` | How far back before `coverage.until` the forward-gap starts. |
| `--cache-dir <path>` | `.cache/pull` | Where cache files live. |

`--weeks`, `--since`, `--until`, `--team`, `--config`, `--data-dir`, `--dry-run` and `--verbose`
keep their meanings, with `--weeks` reinterpreted per §2(1).

`--dry-run` continues to run over bundled fixtures with an in-memory store — no cache files are
written, so CI stays hermetic.

## 9. Storage seam

```ts
export interface CacheStore {
  load(source: SourceId, handle: string): Promise<unknown | undefined>;
  save(source: SourceId, handle: string, value: unknown): Promise<void>;
}
```

`createFileCacheStore(dir)` for real pulls, `createMemoryCacheStore()` for tests and `--dry-run`.
All filesystem access stays in `cli/`; the pure planning and merging modules never touch disk.

`cli/pull.ts` currently calls `main()` at module scope, so importing it from a test would fire a
real pull. It must be refactored to export an injectable
`runPull({ flags, connector, store, logger, now })` with the `main()` invocation guarded behind an
"executed directly" check. That refactor is a prerequisite for the integration test in §13, not
optional cleanup.

## 10. Failure behaviour

- **Unreadable / malformed / schema-drifted / version-mismatched cache file** → warn naming the
  file, treat that handle as uncached, backfill it. The cache is disposable by design, so it
  self-heals rather than aborting a pull. This is deliberately weaker than invariant #4, which
  governs `public/data/` — the SPA contract still fails loud.
- **A per-handle fetch failure** already only warns. With a cache it additionally does not advance
  *that handle's* coverage, so the next pull retries the same gap. Partial failure becomes
  self-healing instead of silently lossy.
- **Writes are per-handle**, so a crash midway through a team leaves the handles already merged
  correctly cached and the rest untouched.

## 11. Secret hygiene

The cache holds the same class of data as `public/data/` — PR titles, URLs, handles, timestamps —
and never the token (invariant #6). `.cache/` is added to `.gitignore`.

## 12. Known semantic changes

1. **Review timestamps freeze.** A review is recorded as a `review_summary` comment stamped with
   the PR's `updatedAt` (PRD §5). Today a full pull re-stamps every such comment with the PR's
   *current* `updatedAt`, so old review activity slides forward in time. With the cache, a cached
   entry keeps the timestamp observed when it was fetched and only moves if the PR is re-fetched.
   This is more faithful attribution, but it means a cached dataset and a `--full` dataset can
   differ for the same historical week.
2. **First pull after this lands shifts numbers.** There is no cache yet, so it backfills, and
   `updated:` credits long-lived PRs whose merge falls in-window but whose creation does not.
   Existing `jdt` / `perf` figures will move up slightly. Expected, not a regression.
3. **Deletions are not observed.** A deleted PR or a withdrawn review stays cached until `--full`.
   Acceptable for this tool.
4. **The cache is at version 2.** Keying pull requests by the source's rename-stable id rather
   than by `repo#number` changed the key scheme, so any v1 file is discarded on first load and
   that handle is backfilled once.

## 13. Testing

TDD the pure core before any wiring:

- `cli/cache/plan.test.ts` — no coverage; back-gap only; forward-gap only; both gaps; fully
  covered → `[]`; overlap clamped so the forward-gap never starts before `coverage.since`;
  `overlapDays: 0`.
- `cli/cache/merge.test.ts` — PR replaced by key; a re-fetched PR's commit set *replaces* rather
  than unions (the rebase case); comment replaced by key; repos deduped; coverage unioned into a
  single interval.
- `shared/schema/cache.test.ts` — Zod round-trip with `Date` ⇄ ISO, rejection of a bad version,
  rejection of a malformed entity.

Then:

- `cli/connectors/github/connector.test.ts` — updated for the grouped `CollectResult`; a new case
  asserting the authored search string uses `updated:`.
- `cli/pull.test.ts` (new integration test) — fake client + in-memory store. Pull twice; assert
  the second pull requests only the delta window, and that the dataset rebuilt from cache equals
  the dataset from a single full pull over the same data.

`bun run lint` (0 warnings), `bun run test`, and `bun run test:e2e` must all be green. The SPA and
e2e suites are untouched because the on-disk contract does not change.

## 14. Documentation

- PRD §5 and §13 currently describe "per-week response caching". Rewrite both to describe the
  per-handle normalized-entity cache, coverage intervals, and the `updated:` windowing.
- README: a short "Incremental pulls" section covering `.cache/pull/`, the new flags, and when to
  reach for `--full`.

## 15. Out of scope

- Pruning cache files for handles no longer configured.
- Chunking a backfill into sub-windows to stay under the 1,000-result search cap. This iteration
  refuses to cache a truncated window (so nothing is silently lost) and warns, but it does not
  split the window automatically — a persistently capped window is re-fetched every pull until the
  operator narrows it.
- Caching for Bitbucket/JIRA connectors — they do not exist yet, but they inherit the cache
  without new cache code.
- Any change to the SPA, the aggregation math, or the `public/data/` contract.
