import { describe, it, expect } from "vitest";
import { emptyTotals } from "../../shared/types";
import type { MemberWeekDetail, WeekDetail } from "../../shared/schema/data";
import { memberScope, teamScope, TEAM_SCOPE_KEY } from "./selectors";

function totals(over: Partial<ReturnType<typeof emptyTotals>>) {
  return { ...emptyTotals(), ...over };
}

const web = { source: "github" as const, owner: "acme", name: "web", url: "https://github.com/acme/web" };
const api = { source: "github" as const, owner: "acme", name: "api", url: "https://github.com/acme/api" };

const alice: MemberWeekDetail = {
  handle: "alice",
  name: "Alice",
  velocity: 60,
  velocityBand: "yellow",
  warmingUp: false,
  totals: totals({ prsMerged: 2, commits: 5 }),
  repos: [
    { repo: web, totals: totals({ prsMerged: 1, commits: 3 }), velocity: 62, velocityBand: "yellow", warmingUp: false },
    { repo: api, totals: totals({ prsMerged: 1, commits: 2 }), velocity: 55, velocityBand: "yellow", warmingUp: false },
  ],
  prs: [],
  comments: [{ kind: "review", repo: web, prNumber: 1, createdAt: "2026-08-05T10:00:00.000Z", url: "u1" }],
  commits: [{ sha: "a1sha", repo: web, authorHandle: "alice", committedAt: "2026-08-06T10:00:00.000Z", url: "c-a1" }],
};

const bob: MemberWeekDetail = {
  handle: "bob",
  name: "Bob",
  velocity: 40,
  velocityBand: "yellow",
  warmingUp: false,
  totals: totals({ commits: 4 }),
  repos: [{ repo: web, totals: totals({ commits: 4 }), velocity: 44, velocityBand: "yellow", warmingUp: false }],
  prs: [],
  comments: [{ kind: "issue", repo: api, prNumber: null, createdAt: "2026-08-04T10:00:00.000Z", url: "u2" }],
  commits: [{ sha: "b1sha", repo: web, authorHandle: "bob", committedAt: "2026-08-04T09:00:00.000Z", url: "c-b1" }],
};

const week: WeekDetail = {
  weekStart: "2026-08-03",
  weekEnd: "2026-08-10",
  label: "2026/08/03–08/09",
  velocity: 55,
  velocityBand: "yellow",
  warmingUp: false,
  totals: totals({ prsMerged: 2, commits: 9 }),
  prs: [],
  members: [alice, bob],
  repos: [
    { repo: api, totals: totals({ prsMerged: 1, commits: 2 }), velocity: 51, velocityBand: "yellow", warmingUp: false },
    { repo: web, totals: totals({ prsMerged: 1, commits: 7 }), velocity: 66, velocityBand: "yellow", warmingUp: false },
  ],
};

describe("teamScope / memberScope", () => {
  it("teamScope exposes the stored team repos + flattened comments + commits", () => {
    const scope = teamScope(week);
    expect(scope.key).toBe(TEAM_SCOPE_KEY);
    // team repos come straight from the week (each with its own velocity), not summed in the SPA
    expect(scope.repos).toBe(week.repos);
    expect(scope.repos.map((r) => r.velocity)).toEqual([51, 66]);
    expect(scope.comments).toHaveLength(2);
    // comments sorted by createdAt
    expect(scope.comments[0].url).toBe("u2");
    // commits flattened across members and sorted by committedAt
    expect(scope.commits).toHaveLength(2);
    expect(scope.commits[0].url).toBe("c-b1");
  });

  it("memberScope surfaces that member's data, including per-repo velocity", () => {
    const scope = memberScope(alice);
    expect(scope.key).toBe("alice");
    expect(scope.velocity).toBe(60);
    expect(scope.repos).toHaveLength(2);
    // sorted by repo name → api, web
    expect(scope.repos.map((r) => `${r.repo.name}:${String(r.velocity)}`)).toEqual(["api:55", "web:62"]);
    expect(scope.commits).toHaveLength(1);
    expect(scope.commits[0].sha).toBe("a1sha");
  });
});
