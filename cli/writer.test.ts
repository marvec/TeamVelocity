import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeTeamDataset, writeTeamsIndex } from "./writer";
import { buildTeamDataset, type DatasetInput, type DatasetTeam } from "../shared/aggregate/dataset";
import { TeamIndexSchema, TeamMetaSchema, WeekDetailSchema } from "../shared/schema/data";
import type { PullRequest, RepoRef } from "../shared/types";

const web: RepoRef = { source: "github", owner: "acme", name: "web", url: "https://github.com/acme/web" };
const team: DatasetTeam = {
  id: "acme",
  name: "Acme",
  source: "github",
  sprintStartsOn: "Mon",
  sprintStartHour: 0,
  thresholds: { red: 40, green: 70 },
  members: [{ name: "Alice", handle: "alice" }],
};

function input(): DatasetInput {
  const prs: PullRequest[] = [
    {
      source: "github",
      repo: web,
      number: 1,
      title: "PR",
      authorHandle: "alice",
      state: "merged",
      createdAt: new Date(2026, 7, 4),
      mergedAt: new Date(2026, 7, 5),
      additions: 10,
      deletions: 2,
      changedFiles: 1,
      commits: 1,
      reviewCommentsCount: 0,
      issueCommentsCount: 0,
      reviewsCount: 0,
      participants: ["alice"],
      linkedIssues: 0,
      url: "https://github.com/acme/web/pull/1",
    },
  ];
  return { team, since: new Date(2026, 7, 3), until: new Date(2026, 7, 17), pullRequests: prs, commits: [], comments: [], now: new Date(2026, 7, 18) };
}

describe("writer", () => {
  it("writes schema-valid teams.json, meta, index, and week files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tv-writer-"));
    const ds = buildTeamDataset(input());
    await writeTeamsIndex(dir, [{ id: "acme", name: "Acme" }]);
    await writeTeamDataset(dir, ds);

    const teams: unknown = JSON.parse(readFileSync(join(dir, "teams.json"), "utf8"));
    expect(teams).toEqual([{ id: "acme", name: "Acme" }]);

    const meta: unknown = JSON.parse(readFileSync(join(dir, "acme/meta.json"), "utf8"));
    expect(() => TeamMetaSchema.parse(meta)).not.toThrow();

    const index: unknown = JSON.parse(readFileSync(join(dir, "acme/index.json"), "utf8"));
    expect(() => TeamIndexSchema.parse(index)).not.toThrow();

    const week: unknown = JSON.parse(readFileSync(join(dir, "acme/weeks/2026-08-03.json"), "utf8"));
    expect(() => WeekDetailSchema.parse(week)).not.toThrow();
  });

  it("produces byte-identical output for identical input (deterministic)", async () => {
    const a = mkdtempSync(join(tmpdir(), "tv-det-a-"));
    const b = mkdtempSync(join(tmpdir(), "tv-det-b-"));
    await writeTeamDataset(a, buildTeamDataset(input()));
    await writeTeamDataset(b, buildTeamDataset(input()));
    expect(readFileSync(join(a, "acme/index.json"), "utf8")).toBe(
      readFileSync(join(b, "acme/index.json"), "utf8"),
    );
  });
});
