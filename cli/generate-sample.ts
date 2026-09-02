/**
 * Generate the committed sample dataset (public/data/sample/ and
 * public/data/sample-solo/). Deterministic (seeded RNG, fixed dates, no
 * Date.now) so the output is stable and reviewable. Powers `bun run dev` and
 * the Playwright e2e suite with zero network and no token.
 *
 * Run with a fixed timezone so week boundaries match the rest of the project:
 *   bun run generate:sample   (script sets TZ=Europe/Prague)
 */

import type { Comment, CommentKind, Commit, PrState, PullRequest, RepoRef } from "../shared/types";
import type { DatasetTeam } from "../shared/aggregate/dataset";
import { buildTeamDataset } from "../shared/aggregate/dataset";
import { enumerateWeeks, type WeekConfig, type WeekWindow } from "../shared/aggregate/weeks";
import { writeTeamDataset, writeTeamsIndex } from "./writer";

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const rand = (rng: () => number, lo: number, hi: number): number => lo + (hi - lo) * rng();
const randInt = (rng: () => number, lo: number, hi: number): number => Math.floor(rand(rng, lo, hi + 1));
const dateIn = (win: WeekWindow, rng: () => number): Date =>
  new Date(win.weekStart.getTime() + rng() * (win.weekEnd.getTime() - win.weekStart.getTime()));

interface MemberSpec {
  name: string;
  handle: string;
  /** Baseline PRs/week. */
  prBase: number;
  /** LOC magnitude per PR. */
  locBase: number;
  /** Review-comment tendency. */
  reviewBase: number;
}

interface TeamSpec {
  id: string;
  name: string;
  members: MemberSpec[];
  repos: RepoRef[];
  seed: number;
  /** Week index that is a team-wide crunch (spike). */
  crunchWeek: number;
  /** Week index that is a team-wide quiet week. */
  quietWeek: number;
  /** A member index + week index that is PTO (no activity). */
  pto: { member: number; week: number };
}

const WEEK_CFG: WeekConfig = { sprintStartsOn: "Mon", sprintStartHour: 0 };
// Anchor to fixed Mondays so output never depends on the current date.
const SINCE = new Date(2026, 3, 27); // Mon 2026-04-27
const UNTIL = new Date(2026, 7, 31); // Mon 2026-08-31
const NOW = new Date(2026, 7, 31, 9, 0, 0);

function repo(owner: string, name: string): RepoRef {
  return { source: "github", owner, name, url: `https://github.com/${owner}/${name}` };
}

interface Entities {
  pullRequests: PullRequest[];
  commits: Commit[];
  comments: Comment[];
}

function generateEntities(spec: TeamSpec, windows: WeekWindow[]): Entities {
  const rng = makeRng(spec.seed);
  const pullRequests: PullRequest[] = [];
  const commits: Commit[] = [];
  const comments: Comment[] = [];
  const prCounter = new Map<string, number>();
  const nextPr = (r: RepoRef): number => {
    const key = `${r.owner}/${r.name}`;
    const n = (prCounter.get(key) ?? 0) + 1;
    prCounter.set(key, n);
    return n;
  };

  windows.forEach((win, wi) => {
    // Team-level activity multiplier shape.
    let mult = 1 + 0.25 * Math.sin(wi / 2);
    if (wi === spec.crunchWeek) mult = 2.2;
    if (wi === spec.quietWeek) mult = 0.15;

    spec.members.forEach((m, mi) => {
      const pto = spec.pto.member === mi && spec.pto.week === wi;
      // Margaret (last member) ramps up over the series.
      const ramp = mi === spec.members.length - 1 ? Math.min(1, 0.2 + wi / windows.length) : 1;
      const activity = pto ? 0 : m.prBase * mult * ramp;

      const numPrs = Math.max(0, Math.round(activity * rand(rng, 0.7, 1.3)));
      const weekPrNumbers: { repo: RepoRef; number: number }[] = [];

      for (let p = 0; p < numPrs; p++) {
        const r = spec.repos[randInt(rng, 0, spec.repos.length - 1)];
        const number = nextPr(r);
        weekPrNumbers.push({ repo: r, number });
        const created = dateIn(win, rng);
        const roll = rng();
        let state: PrState;
        let mergedAt: Date | undefined;
        let closedAt: Date | undefined;
        if (roll < 0.72) {
          state = "merged";
          mergedAt = new Date(Math.min(created.getTime() + rand(rng, 1, 40) * 3600 * 1000, win.weekEnd.getTime() - 1));
        } else if (roll < 0.9) {
          state = "open";
        } else {
          state = "closed";
          closedAt = new Date(Math.min(created.getTime() + rand(rng, 1, 40) * 3600 * 1000, win.weekEnd.getTime() - 1));
        }
        const additions = Math.round(m.locBase * mult * rand(rng, 0.4, 1.8));
        const deletions = Math.round(additions * rand(rng, 0.1, 0.6));
        const others = spec.members.filter((_, j) => j !== mi);
        const participantCount = randInt(rng, 0, Math.min(2, others.length));
        const participants = [m.handle, ...others.slice(0, participantCount).map((o) => o.handle)];
        pullRequests.push({
          source: "github",
          repo: r,
          number,
          title: prTitle(rng, r),
          authorHandle: m.handle,
          state,
          createdAt: created,
          mergedAt,
          closedAt,
          additions,
          deletions,
          changedFiles: randInt(rng, 1, 14),
          commits: randInt(rng, 1, 8),
          reviewCommentsCount: randInt(rng, 0, 6),
          issueCommentsCount: randInt(rng, 0, 4),
          reviewsCount: randInt(rng, 0, 3),
          participants,
          linkedIssues: randInt(rng, 0, 2),
          url: `${r.url}/pull/${String(number)}`,
        });
      }

      // Commits.
      const numCommits = Math.max(0, Math.round(activity * rand(rng, 1, 5)));
      for (let c = 0; c < numCommits; c++) {
        const r = spec.repos[randInt(rng, 0, spec.repos.length - 1)];
        const sha = `${spec.id}${String(wi)}${m.handle}${String(c)}`;
        commits.push({
          source: "github",
          repo: r,
          sha,
          authorHandle: m.handle,
          committedAt: dateIn(win, rng),
          additions: 0,
          deletions: 0,
          url: `${r.url}/commit/${sha}`,
        });
      }

      // Comments (review activity + conversation).
      const numComments = Math.max(0, Math.round((activity + m.reviewBase * mult) * rand(rng, 0.3, 1.1)));
      for (let k = 0; k < numComments; k++) {
        const r = spec.repos[randInt(rng, 0, spec.repos.length - 1)];
        const kinds: CommentKind[] = ["review", "review_summary", "issue"];
        const kind = kinds[randInt(rng, 0, 2)];
        const target = weekPrNumbers.length > 0 ? weekPrNumbers[randInt(rng, 0, weekPrNumbers.length - 1)] : undefined;
        comments.push({
          source: "github",
          repo: target?.repo ?? r,
          kind,
          authorHandle: m.handle,
          createdAt: dateIn(win, rng),
          prNumber: target?.number,
          url: `${(target?.repo ?? r).url}/pull/${String(target?.number ?? randInt(rng, 1, 99))}#c${String(k)}`,
        });
      }
    });
  });

  return { pullRequests, commits, comments };
}

const TITLES = [
  "Add",
  "Fix",
  "Refactor",
  "Improve",
  "Tidy up",
  "Optimize",
  "Document",
  "Wire up",
  "Harden",
];
const SUBJECTS = [
  "the velocity gauge",
  "week bucketing",
  "the drill-down",
  "PR scoring",
  "the data loader",
  "URL state",
  "the sample fixtures",
  "rate-limit backoff",
  "the stacked bars",
];
function prTitle(rng: () => number, r: RepoRef): string {
  const verb = TITLES[randInt(rng, 0, TITLES.length - 1)];
  const subject = SUBJECTS[randInt(rng, 0, SUBJECTS.length - 1)];
  return `${verb} ${subject} (${r.name})`;
}

function toDatasetTeam(spec: TeamSpec): DatasetTeam {
  return {
    id: spec.id,
    name: spec.name,
    source: "github",
    members: spec.members.map((m) => ({ name: m.name, handle: m.handle })),
    sprintStartsOn: WEEK_CFG.sprintStartsOn,
    sprintStartHour: WEEK_CFG.sprintStartHour,
    thresholds: { red: 40, green: 70 },
  };
}

async function buildAndWrite(dataDir: string, specs: TeamSpec[]): Promise<void> {
  const windows = enumerateWeeks(SINCE, UNTIL, WEEK_CFG);
  for (const spec of specs) {
    const entities = generateEntities(spec, windows);
    const dataset = buildTeamDataset({
      team: toDatasetTeam(spec),
      since: SINCE,
      until: UNTIL,
      now: NOW,
      ...entities,
    });
    await writeTeamDataset(dataDir, dataset);
  }
  await writeTeamsIndex(
    dataDir,
    specs.map((s) => ({ id: s.id, name: s.name })),
  );
}

const auroraRepos = [repo("aurora", "web"), repo("aurora", "api"), repo("aurora", "infra")];
const borealisRepos = [repo("borealis", "app"), repo("borealis", "core")];

const aurora: TeamSpec = {
  id: "aurora",
  name: "Aurora",
  seed: 20260831,
  crunchWeek: 12,
  quietWeek: 15,
  pto: { member: 1, week: 9 },
  repos: auroraRepos,
  members: [
    { name: "Ada Lovelace", handle: "adalovelace", prBase: 2.2, locBase: 180, reviewBase: 1.5 },
    { name: "Grace Hopper", handle: "gracehopper", prBase: 1.3, locBase: 90, reviewBase: 3.5 },
    { name: "Linus Nyman", handle: "linusn", prBase: 1.6, locBase: 320, reviewBase: 1.0 },
    { name: "Margaret Park", handle: "margaretp", prBase: 1.1, locBase: 120, reviewBase: 1.2 },
  ],
};

const borealis: TeamSpec = {
  id: "borealis",
  name: "Borealis",
  seed: 7777,
  crunchWeek: 6,
  quietWeek: 14,
  pto: { member: 0, week: 11 },
  repos: borealisRepos,
  members: [
    { name: "Rosalind Frank", handle: "rosalindf", prBase: 1.4, locBase: 140, reviewBase: 1.8 },
    { name: "Alan Turing", handle: "alanturing", prBase: 1.7, locBase: 200, reviewBase: 1.1 },
  ],
};

const nimbus: TeamSpec = {
  id: "nimbus",
  name: "Nimbus",
  seed: 4242,
  crunchWeek: 8,
  quietWeek: 16,
  pto: { member: 1, week: 5 },
  repos: [repo("nimbus", "cloud"), repo("nimbus", "edge")],
  members: [
    { name: "Katherine Johnson", handle: "katherinej", prBase: 1.9, locBase: 160, reviewBase: 2.0 },
    { name: "Dennis Ritchie", handle: "dennisr", prBase: 1.5, locBase: 240, reviewBase: 1.0 },
  ],
};

async function main(): Promise<void> {
  await buildAndWrite("public/data/sample", [aurora, borealis]);
  await buildAndWrite("public/data/sample-solo", [nimbus]);
  process.stdout.write("Sample datasets written to public/data/sample and public/data/sample-solo.\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`✖ generate-sample failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
