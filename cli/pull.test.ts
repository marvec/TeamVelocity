/**
 * End-to-end pull behaviour over fixtures: an in-memory cache store and a
 * recording fake client, so we can assert exactly which windows were requested
 * (no network, PRD §11).
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPull, type RunPullOptions } from "./pull";
import { createGitHubConnector } from "./connectors/github/connector";
import { createFakeGitHubClient, type GitHubFixtures } from "./connectors/github/fake-client";
import fixturesJson from "./connectors/github/__fixtures__/github-fixtures.json";
import { createMemoryCacheStore, type CacheStore } from "./cache/store";
import type { GitHubClient } from "./connectors/github/types";
import type { Logger } from "./connectors/types";
import type { TeamConfig } from "../shared/schema/config";

const fixtures = fixturesJson as unknown as GitHubFixtures;

const silent: Logger = { info() {}, warn() {}, error() {}, debug() {} };

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

interface Call {
  handle: string;
  since: string;
  until: string;
}

/** Wraps the fixture client and records every window it is asked for. */
function recordingClient(): { client: GitHubClient; calls: Call[] } {
  const inner = createFakeGitHubClient(fixtures);
  const calls: Call[] = [];
  const record = (handle: string, since: Date, until: Date): void => {
    calls.push({ handle, since: since.toISOString(), until: until.toISOString() });
  };
  return {
    calls,
    client: {
      searchPrsByAuthor(handle, since, until) {
        record(handle, since, until);
        return inner.searchPrsByAuthor(handle, since, until);
      },
      searchPrsReviewedBy(handle, since, until) {
        record(handle, since, until);
        return inner.searchPrsReviewedBy(handle, since, until);
      },
      usage: () => inner.usage(),
    },
  };
}

const d = (iso: string): Date => new Date(iso);

function options(over: Partial<RunPullOptions> & Pick<RunPullOptions, "connector" | "store" | "dataDir">): RunPullOptions {
  return {
    teams: [team],
    indexTeams: [{ id: team.id, name: team.name }],
    logger: silent,
    requested: { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-10T00:00:00.000Z") },
    now: d("2026-09-10T08:00:00.000Z"),
    overlapDays: 2,
    full: false,
    ...over,
  };
}

function dataDir(): string {
  return mkdtempSync(join(tmpdir(), "tv-pull-"));
}

/** Every written file, so two runs can be compared exactly. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  out["teams.json"] = readFileSync(join(dir, "teams.json"), "utf8");
  for (const name of ["meta.json", "index.json"]) {
    out[name] = readFileSync(join(dir, "acme", name), "utf8");
  }
  for (const week of readdirSync(join(dir, "acme", "weeks")).sort()) {
    out[`weeks/${week}`] = readFileSync(join(dir, "acme", "weeks", week), "utf8");
  }
  return out;
}

/** One run against a shared store, returning the windows it asked GitHub for. */
async function pull(store: CacheStore, dir: string, over: Partial<RunPullOptions> = {}): Promise<Call[]> {
  const { client, calls } = recordingClient();
  await runPull(options({ connector: createGitHubConnector(client), store, dataDir: dir, ...over }));
  return calls;
}

describe("runPull — incremental fetching", () => {
  it("fetches the whole requested window on a cold cache", async () => {
    const calls = await pull(createMemoryCacheStore(), dataDir());

    expect(calls.map((c) => c.handle).sort()).toEqual(["alice", "alice", "bob", "bob"]);
    for (const call of calls) {
      expect(call.since).toBe("2026-03-01T00:00:00.000Z");
      expect(call.until).toBe("2026-09-10T00:00:00.000Z");
    }
  });

  it("asks only for the delta plus the overlap on the second pull", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    await pull(store, dir);

    const second = await pull(store, dir, {
      requested: { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-11T00:00:00.000Z") },
      now: d("2026-09-11T08:00:00.000Z"),
    });

    // 2 days of overlap before the previously covered edge, not 26 weeks.
    for (const call of second) {
      expect(call.since).toBe("2026-09-08T00:00:00.000Z");
      expect(call.until).toBe("2026-09-11T00:00:00.000Z");
    }
    expect(second).toHaveLength(4);
  });

  it("makes no requests at all when the cache already covers the range", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    await pull(store, dir);

    expect(await pull(store, dir)).toEqual([]);
  });

  it("asks only for the back gap when history is extended further back", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    await pull(store, dir);

    const second = await pull(store, dir, {
      requested: { since: d("2026-01-01T00:00:00.000Z"), until: d("2026-09-10T00:00:00.000Z") },
    });

    for (const call of second) {
      expect(call.since).toBe("2026-01-01T00:00:00.000Z");
      expect(call.until).toBe("2026-03-01T00:00:00.000Z");
    }
  });
});

describe("runPull — the cached dataset matches a single full pull", () => {
  it("produces byte-identical output whether built incrementally or in one go", async () => {
    const later = {
      requested: { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-11T00:00:00.000Z") },
      now: d("2026-09-11T08:00:00.000Z"),
    };

    const incrementalDir = dataDir();
    const store = createMemoryCacheStore();
    await pull(store, incrementalDir);
    await pull(store, incrementalDir, later);

    const oneShotDir = dataDir();
    await pull(createMemoryCacheStore(), oneShotDir, later);

    expect(snapshot(incrementalDir)).toEqual(snapshot(oneShotDir));
  });
});

describe("runPull — accumulating history", () => {
  it("keeps weeks the new request no longer asks for", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    await pull(store, dir);
    const wide = readdirSync(join(dir, "acme", "weeks")).length;

    // A much shorter --weeks must not truncate what was already pulled.
    await pull(store, dir, {
      requested: { since: d("2026-09-01T00:00:00.000Z"), until: d("2026-09-10T00:00:00.000Z") },
    });

    expect(readdirSync(join(dir, "acme", "weeks")).length).toBe(wide);
    const meta = JSON.parse(readFileSync(join(dir, "acme", "meta.json"), "utf8")) as { rangeStart: string };
    expect(meta.rangeStart < "2026-03-08").toBe(true);
  });
});

describe("runPull — --full", () => {
  it("re-fetches everything, widened to the coverage already held", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    await pull(store, dir);

    // Narrow request + --full must still cover the whole cached history.
    const calls = await pull(store, dir, {
      full: true,
      requested: { since: d("2026-08-01T00:00:00.000Z"), until: d("2026-09-10T00:00:00.000Z") },
    });

    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.since).toBe("2026-03-01T00:00:00.000Z");
      expect(call.until).toBe("2026-09-10T00:00:00.000Z");
    }
  });
});

describe("runPull — resilience", () => {
  it("does not mark a window covered when a search failed, and retries it next pull", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    const inner = createFakeGitHubClient(fixtures);
    const failing: GitHubClient = {
      searchPrsByAuthor: () => Promise.reject(new Error("502 Bad Gateway")),
      searchPrsReviewedBy: (h, s, u) => inner.searchPrsReviewedBy(h, s, u),
      usage: () => inner.usage(),
    };

    await runPull(options({ connector: createGitHubConnector(failing), store, dataDir: dir }));

    // Nothing was recorded as covered, so the next pull asks for the full window again.
    const retry = await pull(store, dir);
    expect(retry).toHaveLength(4);
    for (const call of retry) {
      expect(call.since).toBe("2026-03-01T00:00:00.000Z");
    }
  });

  it("still writes a dataset when a search failed", async () => {
    const dir = dataDir();
    const inner = createFakeGitHubClient(fixtures);
    const failing: GitHubClient = {
      searchPrsByAuthor: () => Promise.reject(new Error("502")),
      searchPrsReviewedBy: (h, s, u) => inner.searchPrsReviewedBy(h, s, u),
      usage: () => inner.usage(),
    };

    await runPull(options({ connector: createGitHubConnector(failing), store: createMemoryCacheStore(), dataDir: dir }));

    expect(readFileSync(join(dir, "acme", "index.json"), "utf8")).toContain("weeks");
  });
});

describe("runPull — teams index", () => {
  it("lists every configured team even when only one was pulled", async () => {
    const dir = dataDir();
    await runPull(
      options({
        connector: createGitHubConnector(createFakeGitHubClient(fixtures)),
        store: createMemoryCacheStore(),
        dataDir: dir,
        indexTeams: [
          { id: "acme", name: "Acme" },
          { id: "other", name: "Other" },
        ],
      }),
    );

    const teams = JSON.parse(readFileSync(join(dir, "teams.json"), "utf8")) as { id: string }[];
    expect(teams.map((t) => t.id)).toEqual(["acme", "other"]);
  });
});
