/**
 * `bun run pull` — fetch + aggregate + write public/data/ (PRD §2, §13).
 *
 * With a real GITHUB_TOKEN in .env it performs a live pull of the teams in
 * teamvelocity.config.json. With no token (or --dry-run) it runs the full
 * pipeline over bundled fixtures — no network, no token — writing Zod-valid
 * JSON, so the pipeline is verifiable in CI (DoD item 6).
 *
 * Flags: --dry-run  --config <path>  --data-dir <path>  --team <id>
 *        --weeks <N>  --since <ISO>  --until <ISO>  --verbose
 */

import { ConfigError } from "../shared/schema/config";
import type { TeamConfig } from "../shared/schema/config";
import type { TeamsIndex } from "../shared/schema/data";
import { buildTeamDataset } from "../shared/aggregate/dataset";
import { createConsoleLogger } from "./logger";
import { getGithubToken, loadConfig } from "./config";
import { writeTeamDataset, writeTeamsIndex } from "./writer";
import { explicitReposOf, githubMembers, toDatasetTeam } from "./team-mapping";
import { getConnectorFactory } from "./connectors"; // importing registers v1 connectors
import { createGitHubConnector } from "./connectors/github/connector";
import { createFakeGitHubClient, type GitHubFixtures } from "./connectors/github/fake-client";
import fixturesJson from "./connectors/github/__fixtures__/github-fixtures.json";
import type { Logger } from "./connectors/types";

interface Flags {
  dryRun: boolean;
  verbose: boolean;
  config: string;
  dataDir: string;
  team?: string;
  weeks: number;
  since?: string;
  until?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dryRun: false, verbose: false, config: "teamvelocity.config.json", dataDir: "public/data", weeks: 26 };
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
      default: throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (!Number.isFinite(flags.weeks) || flags.weeks <= 0) throw new Error("--weeks must be a positive number");
  return flags;
}

function resolveRange(flags: Flags, now: Date): { since: Date; until: Date } {
  const until = flags.until ? new Date(flags.until) : now;
  const since = flags.since ? new Date(flags.since) : new Date(until.getTime() - flags.weeks * 7 * 24 * 3600 * 1000);
  return { since, until };
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
  const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
  const since = new Date(2026, 7, 3);
  const until = new Date(2026, 7, 31);
  const result = await connector.collect({
    team,
    members: team.members,
    since,
    until,
    explicitRepos: [],
    logger,
  });
  const dataset = buildTeamDataset({
    team: toDatasetTeam(team, "github"),
    since,
    until,
    pullRequests: result.pullRequests,
    commits: result.commits,
    comments: result.comments,
    now: new Date(2026, 7, 31, 8, 0, 0),
  });
  await writeTeamsIndex(flags.dataDir, [{ id: team.id, name: team.name }]);
  await writeTeamDataset(flags.dataDir, dataset);
  logger.info(`Wrote ${flags.dataDir}/${team.id}/ (${String(dataset.index.weeks.length)} weeks).`);
}

async function runLivePull(flags: Flags, token: string, logger: Logger): Promise<void> {
  const config = loadConfig(flags.config);
  const teams = flags.team ? config.teams.filter((t) => t.id === flags.team) : config.teams;
  if (teams.length === 0) throw new ConfigError(`No team matches --team ${flags.team ?? ""}`);

  const factory = getConnectorFactory("github");
  if (!factory) throw new Error("github connector is not registered");
  const connector = factory({ tokens: { github: token }, logger });

  const now = new Date();
  const { since, until } = resolveRange(flags, now);
  logger.info(`Range ${since.toISOString()} .. ${until.toISOString()}`);

  const teamsIndex: TeamsIndex = [];
  for (const team of teams) {
    logger.info(`Team ${team.name} (${team.id}) — ${String(githubMembers(team).length)} github members`);
    const result = await connector.collect({
      team,
      members: team.members,
      since,
      until,
      explicitRepos: explicitReposOf(team),
      logger,
    });
    const dataset = buildTeamDataset({
      team: toDatasetTeam(team, "github"),
      since,
      until,
      pullRequests: result.pullRequests,
      commits: result.commits,
      comments: result.comments,
      now,
    });
    await writeTeamDataset(flags.dataDir, dataset);
    teamsIndex.push({ id: team.id, name: team.name });
    logger.info(`  wrote ${flags.dataDir}/${team.id}/ (${String(dataset.index.weeks.length)} weeks)`);
  }
  await writeTeamsIndex(flags.dataDir, teamsIndex);
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

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\n✖ pull failed:\n${message}\n`);
  process.exit(1);
});
