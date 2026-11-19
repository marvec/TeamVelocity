import { describe, it, expect } from "vitest";
import { createGitHubConnector } from "./connector";
import { createFakeGitHubClient, type GitHubFixtures } from "./fake-client";
import fixturesJson from "./__fixtures__/github-fixtures.json";
import type { CollectByHandle, CollectContext, CollectedEntities, CollectResult, Logger } from "../types";
import type {
  GhIssueCommentNode,
  GhPullRequestNode,
  GhReviewedPrNode,
  GitHubClient,
  IssueCommentsOutcome,
  SearchOptions,
  SearchOutcome,
} from "./types";
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

    // The fixtures also hold issue comments; reviews are the review_summary ones.
    const reviews = result.comments.filter((c) => c.kind === "review_summary");
    expect(reviews.map((c) => `${c.authorHandle}:${String(c.prNumber)}`).sort()).toEqual(["alice:12", "bob:10"]);
    const aliceReview = reviews.find((c) => c.authorHandle === "alice")!;
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

    // other-org/lib is surfaced only by alice's issue comments (R13).
    const repoNames = result.repos.map((r) => `${r.owner}/${r.name}`).sort();
    expect(repoNames).toEqual(["acme/api", "acme/web", "other-org/lib"]);
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

describe("gitHub connector — issue comments", () => {
  const issueComments = (r: CollectResult) => r.comments.filter((c) => c.kind === "issue");

  it("credits each comment on a PR in a repo the member never authored or reviewed in, and adds that repo", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const alicesResult = of(await connector.collect(context([alice, bob])), "alice");

    const onLib = issueComments(alicesResult).filter((c) => c.repo.owner === "other-org" && c.repo.name === "lib");
    expect(onLib).toHaveLength(2);
    for (const c of onLib) {
      expect(c).toMatchObject({ source: "github", kind: "issue", authorHandle: "alice", prNumber: 42 });
    }
    // Each at its own creation time, linking to the comment itself (R9).
    expect(onLib.map((c) => c.createdAt.toISOString()).sort()).toEqual([
      "2026-08-06T10:00:00.000Z",
      "2026-08-07T11:00:00.000Z",
    ]);
    expect(onLib.map((c) => c.url).sort()).toEqual([
      "https://github.com/other-org/lib/pull/42#issuecomment-1001",
      "https://github.com/other-org/lib/pull/42#issuecomment-1002",
    ]);
    expect(alicesResult.repos.map((r) => `${r.owner}/${r.name}`)).toContain("other-org/lib");
    expect(alicesResult.repos.find((r) => r.name === "lib")?.url).toBe("https://github.com/other-org/lib");
  });

  it("leaves prNumber undefined for a comment on an issue, linking to the comment", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const alicesResult = of(await connector.collect(context([alice])), "alice");

    const onIssue = issueComments(alicesResult).find((c) => c.url === "https://github.com/acme/web/issues/7#issuecomment-1004");
    expect(onIssue).toBeDefined();
    expect(onIssue?.prNumber).toBeUndefined();
    expect("prNumber" in (onIssue ?? {})).toBe(false);
    expect(onIssue?.repo).toMatchObject({ owner: "acme", name: "web" });
  });

  it("keeps a comment on the member's own authored PR (R11)", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const alicesResult = of(await connector.collect(context([alice])), "alice");

    expect(alicesResult.prs.some((c) => c.pr.number === 11 && c.pr.repo.name === "api")).toBe(true);
    const onOwnPr = issueComments(alicesResult).filter((c) => c.repo.name === "api" && c.prNumber === 11);
    expect(onOwnPr.map((c) => c.url)).toEqual(["https://github.com/acme/api/pull/11#issuecomment-1003"]);
  });

  it("credits comments only to the member who wrote them", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const results = await connector.collect(context([alice, bob]));

    expect(issueComments(of(results, "alice"))).toHaveLength(4);
    expect(issueComments(of(results, "bob"))).toEqual([]);
  });

  it("reports issue comments separately from reviews in the summary log", async () => {
    const infos: string[] = [];
    const logger: Logger = { info: (m) => infos.push(m), warn() {}, error() {}, debug() {} };
    await createGitHubConnector(createFakeGitHubClient(fixtures)).collect({ ...context([alice, bob]), logger });

    expect(infos.some((m) => m.includes("2 reviews") && m.includes("4 issue comments") && m.includes("3 repos"))).toBe(true);
  });
});

interface SearchCall {
  kind: "authored" | "reviewed" | "commented";
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
  commented?: (handle: string) => IssueCommentsOutcome | Error;
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
      listIssueCommentsBy(handle: string) {
        calls.push({ kind: "commented", handles: [handle], bailOnCap: false });
        const out: IssueCommentsOutcome | Error = answer.commented
          ? answer.commented(handle)
          : { status: "found", nodes: [] };
        return out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
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

    // Comments come from a per-user connection, so they alone are asked per member.
    expect(calls).toEqual([
      { kind: "authored", handles: ["alice", "bob", "dave"], bailOnCap: true },
      { kind: "reviewed", handles: ["alice", "bob", "dave"], bailOnCap: true },
      { kind: "commented", handles: ["alice"], bailOnCap: false },
      { kind: "commented", handles: ["bob"], bailOnCap: false },
      { kind: "commented", handles: ["dave"], bailOnCap: false },
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

describe("gitHub connector — issue comment failures", () => {
  const commentOn = (number: number | null, id: number): GhIssueCommentNode => ({
    url: `https://github.com/acme/web/issues/${String(number ?? 1)}#issuecomment-${String(id)}`,
    createdAt: "2026-08-10T10:00:00Z",
    updatedAt: "2026-08-10T10:00:00Z",
    repository: fixtures.reviewed.bob[0].repository,
    pullRequest: number === null ? null : { number },
  });

  it("marks only the member whose comment fetch threw incomplete, keeping their PRs", async () => {
    const warnings: string[] = [];
    const { client } = scripted({
      authored: () => ({ nodes: [prBy("alice", 1), prBy("bob", 2)], truncated: false }),
      commented: (handle) =>
        handle === "bob" ? new Error("502 Bad Gateway") : { status: "found", nodes: [commentOn(3, 1)] },
    });
    const results = await createGitHubConnector(client).collect({
      ...context([alice, bob, dave]),
      logger: { info() {}, warn: (m) => warnings.push(m), error() {}, debug() {} },
    });

    expect(of(results, "bob").complete).toBe(false);
    expect(prNumbers(of(results, "bob"))).toEqual([2]);
    expect(of(results, "alice").complete).toBe(true);
    expect(of(results, "dave").complete).toBe(true);
    expect(of(results, "alice").comments.map((c) => c.kind)).toEqual(["issue"]);
    expect(warnings.some((w) => w.includes("@bob") && w.includes("502 Bad Gateway"))).toBe(true);
  });

  it("warns and marks the member incomplete when the handle resolves to no user, without throwing", async () => {
    const warnings: string[] = [];
    const { client } = scripted({
      authored: () => ({ nodes: [prBy("alice", 1)], truncated: false }),
      commented: (handle) => (handle === "alice" ? { status: "userNotFound" } : { status: "found", nodes: [] }),
    });
    const results = await createGitHubConnector(client).collect({
      ...context([alice, bob]),
      logger: { info() {}, warn: (m) => warnings.push(m), error() {}, debug() {} },
    });

    expect(of(results, "alice").complete).toBe(false);
    expect(prNumbers(of(results, "alice"))).toEqual([1]);
    expect(of(results, "bob").complete).toBe(true);
    expect(warnings.some((w) => w.includes("@alice"))).toBe(true);
  });
});
