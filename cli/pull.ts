/**
 * `bun run pull` — fetch + aggregate + write public/data/ (PRD §2, §13).
 *
 * Pulls are **incremental**: each handle's normalized entities are cached under
 * `.cache/pull/`, and a run only fetches the gap between what that cache already
 * covers and what was asked for (plus a couple of days of overlap). History
 * accumulates — `--weeks N` means "reach at least N weeks back" and never
 * truncates what the cache already holds.
 *
 * With a real GITHUB_TOKEN in .env it performs a live pull of the teams in
 * teamvelocity.config.json. With no token (or --dry-run) it runs the full
 * pipeline over bundled fixtures — no network, no token, no cache files —
 * writing Zod-valid JSON, so the pipeline is verifiable in CI (DoD item 6).
 *
 * Flags: --dry-run  --config <path>  --data-dir <path>  --team <id>
 *        --weeks <N>  --since <ISO>  --until <ISO>  --verbose
 *        --full  --no-cache  --overlap-days <N>  --cache-dir <path>
 */

import { pathToFileURL } from "node:url";
import { ConfigError } from "../shared/schema/config";
import type { TeamConfig } from "../shared/schema/config";
import { buildTeamDataset } from "../shared/aggregate/dataset";
import { emptyHandleCache, type HandleCache } from "../shared/schema/cache";
import { createConsoleLogger } from "./logger";
import { getGithubToken, loadConfig } from "./config";
import { writeTeamDataset, writeTeamsIndex } from "./writer";
import { explicitReposOf, githubMembers, toDatasetTeam } from "./team-mapping";
import { getConnectorFactory } from "./connectors"; // importing registers v1 connectors
import { createGitHubConnector } from "./connectors/github/connector";
import { createFakeGitHubClient, type GitHubFixtures } from "./connectors/github/fake-client";
import fixturesJson from "./connectors/github/__fixtures__/github-fixtures.json";
import type { CollectedEntities, Logger, SourceConnector } from "./connectors/types";
import { flattenCollected } from "./cache/flatten";
import { planFetchWindows, unionWindow, type Window } from "./cache/plan";
import { mergeHandleCache } from "./cache/merge";
import {
  createFileCacheStore,
  createMemoryCacheStore,
  loadHandleCache,
  saveHandleCache,
  type CacheStore,
} from "./cache/store";

const SOURCE = "github" as const;
const DEFAULT_CACHE_DIR = ".cache/pull";
const DEFAULT_OVERLAP_DAYS = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** How far coverage may fall behind before the growing re-fetch is worth flagging. */
const STALE_WARN_DAYS = 7;

export interface Flags {
  dryRun: boolean;
  verbose: boolean;
  config: string;
  dataDir: string;
  team?: string;
  weeks: number;
  since?: string;
  until?: string;
  full: boolean;
  noCache: boolean;
  overlapDays: number;
  cacheDir: string;
}

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    dryRun: false,
    verbose: false,
    config: "teamvelocity.config.json",
    dataDir: "public/data",
    weeks: 26,
    full: false,
    noCache: false,
    overlapDays: DEFAULT_OVERLAP_DAYS,
    cacheDir: DEFAULT_CACHE_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    switch (arg) {
      case "--dry-run": flags.dryRun = true; break;
      case "--verbose": flags.verbose = true; break;
      case "--config": flags.config = next(); break;
      case "--data-dir": flags.dataDir = next(); break;
      case "--team": flags.team = next(); break;
      case "--weeks": flags.weeks = Number(next()); break;
      case "--since": flags.since = next(); break;
      case "--until": flags.until = next(); break;
      case "--full": flags.full = true; break;
      case "--no-cache": flags.noCache = true; break;
      case "--overlap-days": flags.overlapDays = Number(next()); break;
      case "--cache-dir": flags.cacheDir = next(); break;
      default: throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (!Number.isFinite(flags.weeks) || flags.weeks <= 0) throw new Error("--weeks must be a positive number");
  if (!Number.isFinite(flags.overlapDays) || flags.overlapDays < 0) {
    throw new Error("--overlap-days must be zero or a positive number");
  }
  return flags;
}

function resolveRange(flags: Flags, now: Date): Window {
  const until = flags.until ? new Date(flags.until) : now;
  const since = flags.since ? new Date(flags.since) : new Date(until.getTime() - flags.weeks * 7 * 24 * 3600 * 1000);
  return { since, until };
}

/** The smallest window containing both, tolerating an absent second window. */
function widen(window: Window, other: Window | undefined): Window {
  return other ? unionWindow(window, other) : window;
}

/** A cache's entities, for the flatten step. */
function cacheEntities(cache: HandleCache): CollectedEntities {
  return {
    prs: [...cache.prs.values()],
    commits: [...cache.commits.values()],
    comments: [...cache.comments.values()],
    repos: cache.repos,
  };
}

export interface RunPullOptions {
  teams: TeamConfig[];
  /** Every configured team, so a `--team` refresh never drops the others from teams.json. */
  indexTeams: { id: string; name: string }[];
  connector: SourceConnector;
  store: CacheStore;
  logger: Logger;
  dataDir: string;
  requested: Window;
  now: Date;
  overlapDays: number;
  full: boolean;
}

/**
 * Bring every configured handle's cache up to date, then rebuild each team's
 * dataset from the whole cache. Injectable so tests drive it with a fake client
 * and an in-memory store.
 *
 * The rebuild is always total: velocity is normalized against a rolling baseline
 * over the entire series, so a partially rebuilt dataset would be wrong. It costs
 * only CPU — the expensive part is the network, and that is what the cache trims.
 */
export async function runPull(opts: RunPullOptions): Promise<void> {
  const { connector, store, logger, requested, overlapDays, full } = opts;

  for (const team of opts.teams) {
    const members = githubMembers(team);
    logger.info(`Team ${team.name} (${team.id}) — ${String(members.length)} github members`);

    const explicitRepos = explicitReposOf(team);
    const caches: HandleCache[] = [];

    // Load every handle before planning any of them. The dataset spans the union
    // of the team's coverage, so a handle that just joined — or whose cache was
    // discarded as unreadable — has to be backfilled to that union, not merely to
    // `requested`. Otherwise it renders as real zeros in every earlier week its
    // teammates cover, which reads as "did nothing" rather than "not fetched".
    const storedByHandle = new Map<string, HandleCache>();
    for (const member of members) {
      storedByHandle.set(member.github, await loadHandleCache(store, SOURCE, member.github, logger));
    }
    let target = requested;
    for (const cache of storedByHandle.values()) target = widen(target, cache.coverage);

    for (const member of members) {
      const handle = member.github;
      const stored = storedByHandle.get(handle) ?? emptyHandleCache(SOURCE, handle);

      // --full drops the cached entities so records deleted upstream disappear.
      // It still fetches the full team target, so it can never shrink accumulated
      // history just because --weeks is smaller this time.
      let cache = full ? emptyHandleCache(SOURCE, handle) : stored;
      const windows = planFetchWindows(cache.coverage, target, overlapDays);

      if (windows.length === 0) {
        logger.debug(`@${handle}: cache already covers the range — no requests`);
      }
      // A handle whose fetches keep failing never advances its coverage, so the
      // forward gap grows by a day per pull and eventually costs more than a
      // cold backfill. Clamping the gap's start is NOT the fix: it would leave
      // the skipped span unfetched while coverage unions over it, turning a cost
      // problem into silent data loss. Say it out loud instead.
      const staleDays = stored.coverage
        ? (target.until.getTime() - stored.coverage.until.getTime()) / MS_PER_DAY
        : 0;
      if (staleDays > STALE_WARN_DAYS) {
        logger.warn(
          `@${handle}: cache has not advanced for ${String(Math.floor(staleDays))} days — each pull now re-fetches that whole span. Check earlier warnings for why its fetches are failing.`,
        );
      }
      let everyWindowComplete = true;
      for (const window of windows) {
        logger.debug(
          `@${handle}: fetching ${window.since.toISOString()} .. ${window.until.toISOString()}`,
        );
        const result = await connector.collect({
          team,
          members: [member],
          since: window.since,
          until: window.until,
          explicitRepos,
          logger,
        });
        // Keep whatever arrived, but only widen coverage over a window that was
        // fully seen, so a failed search is retried on the next pull.
        cache = mergeHandleCache(cache, result, result.complete ? window : null);
        if (!result.complete) {
          everyWindowComplete = false;
          logger.warn(`@${handle}: window only partly fetched — left uncovered so the next pull retries it`);
        }
      }

      if (full && !everyWindowComplete) {
        // --full threw the cached entities away before re-fetching. Saving the
        // half-built replacement would destroy accumulated history that GitHub
        // may no longer return inside --weeks, so keep what we already had and
        // let the next pull try again.
        logger.warn(`@${handle}: --full rebuild was incomplete — keeping the existing cache`);
        cache = stored;
      } else if (windows.length > 0) {
        // Nothing fetched means `cache` is still exactly what was loaded, and
        // re-writing it would re-validate and re-serialize the handle's entire
        // accumulated history for no change — the cost grows forever, and it
        // lands precisely on the runs this feature exists to make cheap.
        try {
          await saveHandleCache(store, cache);
        } catch (err) {
          // Symmetric with the load path: the cache is an optimization, so a
          // failed write costs the next pull some API calls rather than
          // throwing away a dataset that was fetched successfully.
          const reason = err instanceof Error ? err.message.split("\n")[0] : String(err);
          logger.warn(`@${handle}: could not write the cache (${reason}) — the next pull will re-fetch this range`);
        }
      }
      caches.push(cache);
    }

    // History accumulates: the dataset spans everything ever pulled for this
    // team, not just the window this run asked for. This starts from `target`
    // rather than `requested` so the rendered range matches the range every
    // handle was planned against, even where a fetch left coverage short.
    let range = target;
    for (const cache of caches) range = widen(range, cache.coverage);

    const entities = flattenCollected(caches.map(cacheEntities));
    const dataset = buildTeamDataset({
      team: toDatasetTeam(team, SOURCE),
      since: range.since,
      until: range.until,
      pullRequests: entities.pullRequests,
      commits: entities.commits,
      comments: entities.comments,
      now: opts.now,
    });
    await writeTeamDataset(opts.dataDir, dataset);
    logger.info(`  wrote ${opts.dataDir}/${team.id}/ (${String(dataset.index.weeks.length)} weeks)`);
  }

  await writeTeamsIndex(opts.dataDir, opts.indexTeams);
}

async function runDryRun(flags: Flags, logger: Logger): Promise<void> {
  logger.info("DRY RUN — no token needed; using bundled fixtures.");
  const fixtures = fixturesJson as unknown as GitHubFixtures;
  const team: TeamConfig = {
    id: "acme",
    name: "Acme",
    sprintStartsOn: "Mon",
    sprintStartHour: 0,
    members: [
      { name: "Alice", github: "alice" },
      { name: "Bob", github: "bob" },
    ],
    repos: [],
  };
  // A memory store keeps the run hermetic: no cache files, and the fixed range
  // below makes the output byte-identical on every run.
  await runPull({
    teams: [team],
    indexTeams: [{ id: team.id, name: team.name }],
    connector: createGitHubConnector(createFakeGitHubClient(fixtures)),
    store: createMemoryCacheStore(),
    logger,
    dataDir: flags.dataDir,
    requested: { since: new Date(2026, 7, 3), until: new Date(2026, 7, 31) },
    now: new Date(2026, 7, 31, 8, 0, 0),
    overlapDays: flags.overlapDays,
    full: false,
  });
}

async function runLivePull(flags: Flags, token: string, logger: Logger): Promise<void> {
  const config = loadConfig(flags.config);
  const teams = flags.team ? config.teams.filter((t) => t.id === flags.team) : config.teams;
  if (teams.length === 0) throw new ConfigError(`No team matches --team ${flags.team ?? ""}`);

  const factory = getConnectorFactory("github");
  if (!factory) throw new Error("github connector is not registered");
  const connector = factory({ tokens: { github: token }, logger });

  const now = new Date();
  const requested = resolveRange(flags, now);
  logger.info(`Range ${requested.since.toISOString()} .. ${requested.until.toISOString()}`);

  const store = flags.noCache ? createMemoryCacheStore() : createFileCacheStore(flags.cacheDir);
  if (flags.noCache) logger.info("--no-cache: fetching the whole range and keeping nothing.");
  else if (flags.full) logger.info(`--full: re-fetching everything into ${flags.cacheDir}`);
  else logger.info(`Cache ${flags.cacheDir} (${String(flags.overlapDays)}-day overlap)`);

  await runPull({
    teams,
    indexTeams: config.teams.map((t) => ({ id: t.id, name: t.name })),
    connector,
    store,
    logger,
    dataDir: flags.dataDir,
    requested,
    now,
    overlapDays: flags.overlapDays,
    full: flags.full,
  });
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const logger = createConsoleLogger(flags.verbose);
  const token = getGithubToken();

  process.stdout.write("TeamVelocity pull\n");
  if (flags.dryRun || !token) {
    if (!token && !flags.dryRun) logger.warn("No GITHUB_TOKEN found — running dry-run over fixtures.");
    await runDryRun(flags, logger);
  } else {
    await runLivePull(flags, token, logger);
  }
  process.stdout.write("Done.\n");
}

/** Only pull when run as the entrypoint, so tests can import `runPull`. */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\n✖ pull failed:\n${message}\n`);
    process.exit(1);
  });
}
