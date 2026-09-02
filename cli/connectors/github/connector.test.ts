import { describe, it, expect } from "vitest";
import { createGitHubConnector } from "./connector";
import { createFakeGitHubClient, type GitHubFixtures } from "./fake-client";
import fixturesJson from "./__fixtures__/github-fixtures.json";
import type { CollectContext, Logger } from "../types";
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
    const result = await connector.collect(context([alice, bob]));

    expect(result.pullRequests.map((p) => p.number).sort((a, b) => a - b)).toEqual([10, 11, 12]);

    const pr10 = result.pullRequests.find((p) => p.number === 10)!;
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

    const pr11 = result.pullRequests.find((p) => p.number === 11)!;
    expect(pr11.state).toBe("open");
    expect(pr11.mergedAt).toBeUndefined();
  });

  it("emits a review_summary comment per reviewed PR", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const result = await connector.collect(context([alice, bob]));

    expect(result.comments).toHaveLength(2);
    for (const c of result.comments) {
      expect(c.kind).toBe("review_summary");
    }
    const aliceReview = result.comments.find((c) => c.authorHandle === "alice")!;
    expect(aliceReview.prNumber).toBe(12);
    expect(aliceReview.repo.name).toBe("api");
    expect(aliceReview.createdAt).toBeInstanceOf(Date);
  });

  it("normalizes commits and unions discovered repos", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const result = await connector.collect(context([alice, bob]));

    expect(result.commits.map((c) => c.sha).sort()).toEqual(["aaa111", "aaa222", "bbb111"]);
    const repoNames = result.repos.map((r) => `${r.owner}/${r.name}`).sort();
    expect(repoNames).toEqual(["acme/api", "acme/web"]);
  });

  it("includes explicit repos even when no activity surfaces them", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const ctx = context([alice]);
    ctx.explicitRepos = [
      { source: "github", owner: "acme", name: "secret", url: "https://github.com/acme/secret" },
    ];
    const result = await connector.collect(ctx);
    expect(result.repos.some((r) => r.name === "secret")).toBe(true);
  });

  it("skips members without a github handle", async () => {
    const connector = createGitHubConnector(createFakeGitHubClient(fixtures));
    const result = await connector.collect(context([alice, carol]));
    // carol contributes nothing; only alice's PRs surface
    expect(result.pullRequests.every((p) => p.authorHandle === "alice")).toBe(true);
  });
});
