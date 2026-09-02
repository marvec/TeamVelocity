import { describe, it, expect } from "vitest";
import {
  TeamsIndexSchema,
  TeamMetaSchema,
  TeamIndexSchema,
  WeekDetailSchema,
} from "./data";
import { buildTeamDataset, type DatasetInput } from "../aggregate/dataset";
import type { PullRequest, RepoRef } from "../types";

const web: RepoRef = { source: "github", owner: "acme", name: "web", url: "https://github.com/acme/web" };

function validDataset() {
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
      reviewCommentsCount: 1,
      issueCommentsCount: 0,
      reviewsCount: 0,
      participants: ["alice"],
      linkedIssues: 0,
      url: "https://github.com/acme/web/pull/1",
    },
  ];
  const input: DatasetInput = {
    team: {
      id: "acme",
      name: "Acme",
      source: "github",
      sprintStartsOn: "Mon",
      sprintStartHour: 0,
      thresholds: { red: 40, green: 70 },
      members: [{ name: "Alice", handle: "alice" }],
    },
    since: new Date(2026, 7, 3),
    until: new Date(2026, 7, 17),
    pullRequests: prs,
    commits: [],
    comments: [],
    now: new Date(2026, 7, 18),
  };
  return buildTeamDataset(input);
}

describe("on-disk schemas — accept valid output", () => {
  const ds = validDataset();
  const week = Object.values(ds.weeks)[0];

  it("parse the writer's own output without throwing", () => {
    expect(() => TeamMetaSchema.parse(ds.meta)).not.toThrow();
    expect(() => TeamIndexSchema.parse(ds.index)).not.toThrow();
    expect(() => WeekDetailSchema.parse(week)).not.toThrow();
    expect(() => TeamsIndexSchema.parse([{ id: "acme", name: "Acme" }])).not.toThrow();
  });
});

describe("on-disk schemas — reject drifted / invalid data (fail loud, invariant #4)", () => {
  const ds = validDataset();
  const week = Object.values(ds.weeks)[0];

  it("TeamsIndex rejects a missing name and extra keys", () => {
    expect(() => TeamsIndexSchema.parse([{ id: "a" }])).toThrow();
    expect(() => TeamsIndexSchema.parse([{ id: "a", name: "A", extra: 1 }])).toThrow();
  });

  it("TeamMeta rejects out-of-range thresholds, bad dates, and extra keys", () => {
    expect(() => TeamMetaSchema.parse({ ...ds.meta, thresholds: { red: 40, green: 200 } })).toThrow();
    expect(() => TeamMetaSchema.parse({ ...ds.meta, rangeStart: "not-a-date" })).toThrow();
    expect(() => TeamMetaSchema.parse({ ...ds.meta, extra: true })).toThrow();
    expect(() => TeamMetaSchema.parse({ ...ds.meta, source: "gitlab" })).toThrow();
  });

  it("TeamIndex rejects a velocity above 100", () => {
    const bad = { weeks: [{ ...ds.index.weeks[0], velocity: 150 }] };
    expect(() => TeamIndexSchema.parse(bad)).toThrow();
  });

  it("WeekDetail rejects negative counts and wrong types", () => {
    expect(() => WeekDetailSchema.parse({ ...week, totals: { ...week.totals, commits: -1 } })).toThrow();
    expect(() => WeekDetailSchema.parse({ ...week, velocity: "high" })).toThrow();
    expect(() => WeekDetailSchema.parse({ ...week, velocityBand: "blue" })).toThrow();
  });
});
