import { describe, it, expect } from "vitest";
import { emptyTotals } from "../../shared/types";
import type { MemberWeekDetail, WeekDetail } from "../../shared/schema/data";
import { aggregateRepos, memberScope, teamScope, TEAM_SCOPE_KEY } from "./selectors";

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
    { repo: web, totals: totals({ prsMerged: 1, commits: 3 }) },
    { repo: api, totals: totals({ prsMerged: 1, commits: 2 }) },
  ],
  prs: [],
  comments: [{ kind: "review", repo: web, prNumber: 1, createdAt: "2026-08-05T10:00:00.000Z", url: "u1" }],
};

const bob: MemberWeekDetail = {
  handle: "bob",
  name: "Bob",
  velocity: 40,
  velocityBand: "yellow",
  warmingUp: false,
  totals: totals({ commits: 4 }),
  repos: [{ repo: web, totals: totals({ commits: 4 }) }],
  prs: [],
  comments: [{ kind: "issue", repo: api, prNumber: null, createdAt: "2026-08-04T10:00:00.000Z", url: "u2" }],
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
};

describe("aggregateRepos", () => {
  it("sums per-repo totals across members and sorts by name", () => {
    const repos = aggregateRepos([alice, bob]);
    expect(repos.map((r) => `${r.repo.owner}/${r.repo.name}`)).toEqual(["acme/api", "acme/web"]);
    const webTotals = repos.find((r) => r.repo.name === "web")!.totals;
    expect(webTotals.commits).toBe(7); // alice 3 + bob 4
    expect(webTotals.prsMerged).toBe(1);
  });

  it("does not mutate the source member totals", () => {
    aggregateRepos([alice, bob]);
    expect(alice.repos[0].totals.commits).toBe(3);
  });
});

describe("teamScope / memberScope", () => {
  it("teamScope aggregates repos + comments across the team", () => {
    const scope = teamScope(week);
    expect(scope.key).toBe(TEAM_SCOPE_KEY);
    expect(scope.repos).toHaveLength(2);
    expect(scope.comments).toHaveLength(2);
    // comments sorted by createdAt
    expect(scope.comments[0].url).toBe("u2");
  });

  it("memberScope surfaces that member's data", () => {
    const scope = memberScope(alice);
    expect(scope.key).toBe("alice");
    expect(scope.velocity).toBe(60);
    expect(scope.repos).toHaveLength(2);
  });
});
