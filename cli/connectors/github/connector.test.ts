import { describe, it, expect } from "vitest";
import { createGitHubConnector } from "./connector";
import { createFakeGitHubClient, type GitHubFixtures } from "./fake-client";
import fixturesJson from "./__fixtures__/github-fixtures.json";
import type { CollectByHandle, CollectContext, CollectedEntities, CollectResult, Logger } from "../types";
import type { GhPullRequestNode, GhReviewedPrNode, GitHubClient, SearchOptions, SearchOutcome } from "./types";
import type { Member, TeamConfig } from "../../../shared/schema/config";

const fixtures = fixturesJson as unknown as GitHubFixtures;

const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

const alice: Member = { name: "Alice", github: "alice" };
const bob: Member = { name: "Bob", github: "bob" };
const carol: Member = { name: "Carol", bitbucket: "carol_bb" };

function context(members: Member[]): CollectContext {
  const team: TeamConfig = {
    id: "acme",
    name: "Acme",
    sprintStartsOn: "Mon",
    sprintStartHour: 0,
    members,
    repos: [],
  };
  return {
    team,
    members,
    since: new Date(2026, 7, 3),
    until: new Date(2026, 7, 31),
    explicitRepos: [],
    logger: silentLogger,
  };
}

/** Every member's entities together, for assertions about normalization alone. */
function all(results: CollectByHandle): CollectedEntities {
  const values = [...results.values()];
  const repos = new Map(values.flatMap((r) => r.repos).map((r) => [`${r.owner}/${r.name}`, r]));
  return {
    prs: values.flatMap((r) => r.prs),
    commits: values.flatMap((r) => r.commits),
    comments: values.flatMap((r) => r.comments),
    repos: [...repos.values()],
  };
}

function of(results: CollectByHandle, handle: string): CollectResult {
  const result = results.get(handle);
  if (!result) throw new Error(`no result for ${handle}`);
  return result;
}

describe("gitHub connector — supportsMember", () => {
  it("supports members with a github handle, rejects bitbucket-only", () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    expect(connector.supportsMember(alice)).toBe(true);
    expect(connector.supportsMember(carol)).toBe(false);
  });

  it("has the github id", () => {
    expect(createGitHubConnector(createFakeGitHubClient(fixtures)).id).toBe("github");
  });
});

describe("gitHub connector — collect over fixtures (no network)", () => {
  it("normalizes authored PRs from every member", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const result = all(await connector.collect(context([alice, bob])));

    const prs = result.prs.map((c) => c.pr);
    expect(prs.map((p) => p.number).sort((a, b) => a - b)).toEqual([10, 11, 12]);

    const pr10 = prs.find((p) => p.number === 10)!;
    expect(pr10.state).toBe("merged");
    expect(pr10.authorHandle).toBe("alice");
    expect(pr10.additions).toBe(120);
    expect(pr10.deletions).toBe(30);
    expect(pr10.changedFiles).toBe(6);
    // reviewThreads.totalCount -> reviewCommentsCount proxy
    expect(pr10.reviewCommentsCount).toBe(3);
    expect(pr10.issueCommentsCount).toBe(2);
    expect(pr10.reviewsCount).toBe(1);
    expect(pr10.participants).toEqual(["alice", "bob"]);
    expect(pr10.linkedIssues).toBe(1);
    expect(pr10.repo.owner).toBe("acme");
    expect(pr10.repo.name).toBe("web");
    expect(pr10.mergedAt).toBeInstanceOf(Date);

    const pr11 = prs.find((p) => p.number === 11)!;
    expect(pr11.state).toBe("open");
    expect(pr11.mergedAt).toBeUndefined();
  });

  it("emits a review_summary comment per reviewed PR", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const result = all(await connector.collect(context([alice, bob])));

    expect(result.comments).toHaveLength(2);
    for (const c of result.comments) {
      expect(c.kind).toBe("review_summary");
    }
    const aliceReview = result.comments.find((c) => c.authorHandle === "alice")!;
    expect(aliceReview.prNumber).toBe(12);
    expect(aliceReview.repo.name).toBe("api");
    expect(aliceReview.createdAt).toBeInstanceOf(Date);
  });

  it("collects each PR's own commits, attributed to the PR author, and unions repos", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const result = all(await connector.collect(context([alice, bob])));

    // Commits ride their owning PR so the cache can replace a PR's whole commit
    // set on re-fetch; they are no longer a flat top-level list.
    const owned = result.prs.flatMap((c) => c.commits);
    expect(owned.map((c) => c.sha).sort()).toEqual(["aaa111", "aaa222", "bbb111", "ccc111"]);
    // ccc111 rides alice's PR #11 → attributed to alice; bbb111 rides bob's #12 → bob.
    expect(owned.find((c) => c.sha === "ccc111")?.authorHandle).toBe("alice");
    expect(owned.find((c) => c.sha === "bbb111")?.authorHandle).toBe("bob");

    // GitHub sources every commit from a PR, so the PR-less bucket stays empty.
    expect(result.commits).toEqual([]);

    const repoNames = result.repos.map((r) => `${r.owner}/${r.name}`).sort();
    expect(repoNames).toEqual(["acme/api", "acme/web"]);
  });

  it("warns instead of silently dropping when a PR has more commits than were fetched", async () => {
    const warnings: string[] = [];
    const capturingLogger: Logger = {
      info() {},
      warn: (m) => warnings.push(m),
      error() {},
      debug() {},
    };
    const capped: GitHubFixtures = {
      authored: {
        alice: [
          {
            ...fixtures.authored.alice[0],
            number: 99,
            commits: {
              totalCount: 3,
              nodes: [
                {
                  commit: {
                    oid: "cap1",
                    committedDate: "2026-08-10T00:00:00Z",
                    url: "https://github.com/acme/web/commit/cap1",
                  },
                },
              ],
            },
          },
        ],
      },
      reviewed: {},
    };
    const connector = createGitHubConnector(createFakeGitHubClient(capped));
    const result = of(await connector.collect({ ...context([alice]), logger: capturingLogger }), "alice");

    expect(result.prs.flatMap((c) => c.commits).map((c) => c.sha)).toEqual(["cap1"]);
    expect(warnings.some((w) => w.includes("has 3 commits") && w.includes("only the first 1"))).toBe(true);
  });

  it("keeps a shared commit SHA in BOTH owning PRs, leaving dedupe to the flatten step", async () => {
    const base = fixtures.authored.alice[0];
    const shared = {
      commit: { oid: "dup1", committedDate: "2026-08-05T10:00:00Z", url: "https://github.com/acme/web/commit/dup1" },
    };
    const dupFixtures: GitHubFixtures = {
      authored: {
        alice: [
          {
            ...base,
            number: 10,
            commits: {
              totalCount: 2,
              nodes: [
                shared,
                { commit: { oid: "a10", committedDate: "2026-08-05T11:00:00Z", url: "https://github.com/acme/web/commit/a10" } },
              ],
            },
          },
          {
            ...base,
            number: 20,
            commits: {
              totalCount: 2,
              nodes: [
                shared,
                { commit: { oid: "a20", committedDate: "2026-08-06T11:00:00Z", url: "https://github.com/acme/web/commit/a20" } },
              ],
            },
          },
        ],
      },
      reviewed: {},
    };
    const connector = createGitHubConnector(createFakeGitHubClient(dupFixtures));
    const result = of(await connector.collect(context([alice])), "alice");

    // Each PR carries its OWN complete commit set. Dropping dup1 from #20 here
    // would make the cached set for #20 depend on fetch order, and re-fetching
    // #10 alone would then lose the SHA entirely. Velocity's commit signal is
    // protected by the SHA dedupe in the flatten step, not here.
    const byNumber = new Map(result.prs.map((c) => [c.pr.number, c.commits.map((x) => x.sha).sort()]));
    expect(byNumber.get(10)).toEqual(["a10", "dup1"]);
    expect(byNumber.get(20)).toEqual(["a20", "dup1"]);
  });

  it("includes explicit repos even when no activity surfaces them", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const ctx = context([alice]);
    ctx.explicitRepos = [
      { source: "github", owner: "acme", name: "secret", url: "https://github.com/acme/secret" },
    ];
    const result = of(await connector.collect(ctx), "alice");
    expect(result.repos.some((r) => r.name === "secret")).toBe(true);
  });

  it("reports a complete collection when every search succeeded", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const results = await connector.collect(context([alice, bob]));
    expect([...results.values()].map((r) => r.complete)).toEqual([true, true]);
  });

  it("reports an incomplete collection when a search failed", async () => {
    // The caller must not advance this handle's cached coverage over a window
    // it only partly saw, or the gap is never retried.
    const failing = {
      ...createFakeGitHubClient(fixtures),
      searchPrsByAuthors: () => Promise.reject(new Error("502 Bad Gateway")),
    };
    const results = await createGitHubConnector(failing).collect({
      ...context([alice]),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });

    expect(of(results, "alice").complete).toBe(false);
  });

  it("skips members without a github handle", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const results = await connector.collect(context([alice, carol]));
    // carol has no github handle, so she gets no entry at all
    expect([...results.keys()]).toEqual(["alice"]);
  });
});

interface SearchCall {
  kind: "authored" | "reviewed";
  handles: string[];
  bailOnCap: boolean;
}

/**
 * A client whose answers are scripted per call, recording what it was asked —
 * enough to drive the batching paths (splitting, re-asking) that fixtures
 * cannot reach.
 */
function scripted(answer: {
  authored?: (handles: string[]) => SearchOutcome<GhPullRequestNode> | Error;
  reviewed?: (handles: string[]) => SearchOutcome<GhReviewedPrNode> | Error;
}): { client: GitHubClient; calls: SearchCall[] } {
  const calls: SearchCall[] = [];
  const respond = <T>(out: SearchOutcome<T> | Error): Promise<SearchOutcome<T>> =>
    out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
  const none = { nodes: [], truncated: false };
  return {
    calls,
    client: {
      searchPrsByAuthors(handles: string[], _s: Date, _u: Date, options?: SearchOptions) {
        calls.push({ kind: "authored", handles, bailOnCap: options?.bailOnCap ?? false });
        return respond(answer.authored ? answer.authored(handles) : none);
      },
      searchPrsReviewedBy(handles: string[], _s: Date, _u: Date, options?: SearchOptions) {
        calls.push({ kind: "reviewed", handles, bailOnCap: options?.bailOnCap ?? false });
        return respond(answer.reviewed ? answer.reviewed(handles) : none);
      },
      usage: () => ({ cost: 0, remaining: null }),
    },
  };
}

const prBy = (login: string | null, number: number): GhPullRequestNode => ({
  ...fixtures.authored.alice[0],
  number,
  url: `https://github.com/acme/web/pull/${String(number)}`,
  author: login === null ? null : { login, url: `https://github.com/${login}` },
});

const reviewedBy = (logins: string[], number: number, totalCount = logins.length): GhReviewedPrNode => ({
  ...fixtures.reviewed.alice[0],
  number,
  url: `https://github.com/acme/api/pull/${String(number)}`,
  reviews: { totalCount, nodes: logins.map((login) => ({ author: { login } })) },
});

const dave: Member = { name: "Dave", github: "dave" };
const prNumbers = (r: CollectResult): number[] => r.prs.map((c) => c.pr.number).sort((a, b) => a - b);
const reviewNumbers = (r: CollectResult): number[] => r.comments.flatMap((c) => (c.prNumber === undefined ? [] : [c.prNumber])).sort((a, b) => a - b);

describe("gitHub connector — batched searches", () => {
  it("asks once per search for the whole team, not once per member", async () => {
    const { client, calls } = scripted({});
    await createGitHubConnector(client).collect(context([alice, bob, dave]));

    expect(calls).toEqual([
      { kind: "authored", handles: ["alice", "bob", "dave"], bailOnCap: true },
      { kind: "reviewed", handles: ["alice", "bob", "dave"], bailOnCap: true },
    ]);
  });

  it("files each authored PR under its author, ignoring login case", async () => {
    const { client } = scripted({
      authored: () => ({ nodes: [prBy("Alice", 1), prBy("bob", 2), prBy("alice", 3)], truncated: false }),
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob, dave]));

    expect(prNumbers(of(results, "alice"))).toEqual([1, 3]);
    expect(prNumbers(of(results, "bob"))).toEqual([2]);
    // A member with no activity still gets a complete, empty result, so their
    // window is cached as covered rather than re-fetched forever.
    expect(of(results, "dave")).toMatchObject({ prs: [], comments: [], complete: true });
  });

  it("credits a PR reviewed by two members to both of them", async () => {
    const { client } = scripted({
      reviewed: () => ({ nodes: [reviewedBy(["alice", "BOB", "stranger"], 7), reviewedBy(["bob"], 8)], truncated: false }),
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob]));

    expect(reviewNumbers(of(results, "alice"))).toEqual([7]);
    expect(reviewNumbers(of(results, "bob"))).toEqual([7, 8]);
    expect(of(results, "bob").comments.every((c) => c.authorHandle === "bob")).toBe(true);
  });

  it("re-asks one member at a time when a review list is too long to tell who reviewed", async () => {
    // 150 reviews, 100 returned: alice is among them, bob's review is not. Only
    // asking per member reveals that bob reviewed it too.
    const pr9 = reviewedBy(["alice"], 9, 150);
    const { client, calls } = scripted({
      reviewed: () => ({ nodes: [pr9], truncated: false }),
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob]));

    expect(calls.filter((c) => c.kind === "reviewed").map((c) => c.handles)).toEqual([["alice", "bob"], ["alice"], ["bob"]]);
    expect(reviewNumbers(of(results, "alice"))).toEqual([9]);
    expect(reviewNumbers(of(results, "bob"))).toEqual([9]);
  });

  it("asks the member taking part in a PR none of the batch authored, and only them", async () => {
    // Seen live: a PR the Copilot agent opened for a member matches that
    // member's `author:` but names the bot as its author.
    const botPr = { ...prBy("copilot-swe-agent", 4), participants: { totalCount: 2, nodes: [{ login: "copilot-swe-agent" }, { login: "Bob" }] } };
    const { client, calls } = scripted({
      authored: (handles) =>
        handles.length > 1 || handles[0] === "bob" ? { nodes: [botPr], truncated: false } : { nodes: [], truncated: false },
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob, dave]));

    expect(calls.filter((c) => c.kind === "authored").map((c) => c.handles)).toEqual([["alice", "bob", "dave"], ["bob"]]);
    expect(prNumbers(of(results, "bob"))).toEqual([4]);
    expect(prNumbers(of(results, "alice"))).toEqual([]);
  });

  it("falls back to asking members one by one, stopping once the PR turns up", async () => {
    // No author (deleted account) and no member among the participants: the
    // search still matched one of them, so ask until it shows up.
    const orphan = { ...prBy(null, 5), participants: { totalCount: 0, nodes: [] } };
    const { client, calls } = scripted({
      authored: (handles) =>
        handles.length > 1 || handles[0] === "bob" ? { nodes: [orphan], truncated: false } : { nodes: [], truncated: false },
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob, dave]));

    expect(calls.filter((c) => c.kind === "authored").map((c) => c.handles)).toEqual([["alice", "bob", "dave"], ["alice"], ["bob"]]);
    expect(prNumbers(of(results, "bob"))).toEqual([5]);
  });

  it("keeps a batch's attributable PRs while it resolves the rest", async () => {
    const orphan = { ...prBy(null, 5), participants: { totalCount: 0, nodes: [] } };
    const { client } = scripted({
      authored: (handles) =>
        handles.length > 1
          ? { nodes: [prBy("alice", 1), orphan], truncated: false }
          : { nodes: handles[0] === "bob" ? [orphan] : [], truncated: false },
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob]));

    expect(prNumbers(of(results, "alice"))).toEqual([1]);
    expect(prNumbers(of(results, "bob"))).toEqual([5]);
  });

  it("drops a PR no member's own search returns, rather than guessing whose it is", async () => {
    // It left the window between the two searches (updated just after
    // `until`); the next pull's overlap re-collects it under the right member.
    const orphan = { ...prBy(null, 5), participants: { totalCount: 0, nodes: [] } };
    const { client } = scripted({
      authored: (handles) => ({ nodes: handles.length > 1 ? [orphan] : [], truncated: false }),
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob]));

    expect(prNumbers(of(results, "alice"))).toEqual([]);
    expect(prNumbers(of(results, "bob"))).toEqual([]);
    expect([...results.values()].every((r) => r.complete)).toBe(true);
  });

  it("marks the batch incomplete when resolving an unattributed PR fails", async () => {
    const orphan = { ...prBy(null, 5), participants: { totalCount: 0, nodes: [] } };
    const { client } = scripted({
      authored: (handles) => (handles.length > 1 ? { nodes: [orphan], truncated: false } : new Error("502")),
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob]));

    expect([...results.values()].map((r) => r.complete)).toEqual([false, false]);
  });

  it("halves a batch over the result ceiling until each part fits", async () => {
    const { client, calls } = scripted({
      authored: (handles) =>
        handles.length > 1
          ? { nodes: [], truncated: true }
          : { nodes: [prBy(handles[0], handles[0].length)], truncated: false },
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob, dave]));

    expect(calls.filter((c) => c.kind === "authored").map((c) => [c.handles, c.bailOnCap])).toEqual([
      [["alice", "bob", "dave"], true],
      [["alice", "bob"], true],
      [["alice"], false],
      [["bob"], false],
      [["dave"], false],
    ]);
    for (const handle of ["alice", "bob", "dave"]) {
      expect(of(results, handle).complete).toBe(true);
      expect(of(results, handle).prs).toHaveLength(1);
    }
  });

  it("marks only the member whose own search was truncated as incomplete", async () => {
    const { client } = scripted({
      authored: (handles) =>
        handles.length > 1
          ? { nodes: [], truncated: true }
          : { nodes: [prBy(handles[0], 1)], truncated: handles[0] === "bob" },
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob]));

    expect(of(results, "alice").complete).toBe(true);
    expect(of(results, "bob").complete).toBe(false);
    // What did arrive is still kept.
    expect(prNumbers(of(results, "bob"))).toEqual([1]);
  });

  it("marks only the members of a failed search as incomplete", async () => {
    const { client } = scripted({
      authored: (handles) =>
        handles.length > 1 ? { nodes: [], truncated: true } : handles[0] === "dave" ? new Error("502") : { nodes: [], truncated: false },
    });
    const results = await createGitHubConnector(client).collect(context([alice, bob, dave]));

    expect(of(results, "alice").complete).toBe(true);
    expect(of(results, "bob").complete).toBe(true);
    expect(of(results, "dave").complete).toBe(false);
  });

  it("gives every member the team's explicit repos", async () => {
    const { client } = scripted({});
    const ctx = context([alice, bob]);
    ctx.explicitRepos = [{ source: "github", owner: "acme", name: "secret", url: "https://github.com/acme/secret" }];
    const results = await createGitHubConnector(client).collect(ctx);

    for (const handle of ["alice", "bob"]) {
      expect(of(results, handle).repos.map((r) => r.name)).toEqual(["secret"]);
    }
  });
});
