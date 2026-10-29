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
  handles: string[];
  since: string;
  until: string;
}

/** Real GitHub honours the `updated:` window; the bare fixture client does not. */
function inWindow(updatedAt: string, since: Date, until: Date): boolean {
  const at = new Date(updatedAt).getTime();
  return at >= since.getTime() && at < until.getTime();
}

/**
 * Wraps the fixture client, records every window it is asked for, and — unlike
 * the bare fixture client — actually filters by that window. Without the filter
 * every window returns the same static set, so a test comparing an incrementally
 * merged dataset against a single-shot pull passes no matter how badly the
 * window planning or the merge regresses.
 */
function recordingClient(): { client: GitHubClient; calls: Call[] } {
  const inner = createFakeGitHubClient(fixtures);
  const calls: Call[] = [];
  const record = (handles: string[], since: Date, until: Date): void => {
    calls.push({ handles, since: since.toISOString(), until: until.toISOString() });
  };
  return {
    calls,
    client: {
      async searchPrsByAuthors(handles, since, until) {
        record(handles, since, until);
        const all = await inner.searchPrsByAuthors(handles, since, until);
        return { nodes: all.nodes.filter((n) => inWindow(n.updatedAt, since, until)), truncated: false };
      },
      async searchPrsReviewedBy(handles, since, until) {
        record(handles, since, until);
        const all = await inner.searchPrsReviewedBy(handles, since, until);
        return { nodes: all.nodes.filter((n) => inWindow(n.updatedAt, since, until)), truncated: false };
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

    // One authored + one reviewed search, each covering the whole team.
    expect(calls.map((c) => c.handles)).toEqual([["alice", "bob"], ["alice", "bob"]]);
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
    expect(second).toHaveLength(2);
  });

  it("makes no requests at all when the cache already covers the range", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    await pull(store, dir);

    expect(await pull(store, dir)).toEqual([]);
  });

  it("does not rewrite a cache it did not change", async () => {
    // Re-serializing means re-validating every entity the handle has ever
    // accumulated, and history grows forever — so a no-op pull must not write.
    const inner = createMemoryCacheStore();
    let writes = 0;
    const counting: CacheStore = {
      load: (source, handle) => inner.load(source, handle),
      save: (source, handle, value) => {
        writes += 1;
        return inner.save(source, handle, value);
      },
    };
    const dir = dataDir();
    await pull(counting, dir);
    expect(writes).toBe(2); // one per handle on the cold backfill

    await pull(counting, dir);
    expect(writes).toBe(2);
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
  // The fixture PRs update on Aug 5, Aug 12 and Aug 14, so these two windows
  // genuinely split them: the first pull cannot see PR #12 or alice's review of
  // it, and only the merge of both windows reproduces the one-shot result.
  const first = {
    requested: { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-08-13T00:00:00.000Z") },
    now: d("2026-08-13T08:00:00.000Z"),
  };
  const later = {
    requested: { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-08-20T00:00:00.000Z") },
    now: d("2026-08-20T08:00:00.000Z"),
  };

  it("sees only part of the data on the first window", async () => {
    const dir = dataDir();
    await pull(createMemoryCacheStore(), dir, first);
    const weeks = snapshot(dir);
    // Guards the guard: if this ever contains #12, the windows stopped splitting
    // the fixtures and the equality test below goes back to proving nothing.
    expect(JSON.stringify(weeks)).not.toContain('"number": 12');
  });

  it("produces byte-identical output whether built incrementally or in one go", async () => {
    const incrementalDir = dataDir();
    const store = createMemoryCacheStore();
    await pull(store, incrementalDir, first);
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

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.since).toBe("2026-03-01T00:00:00.000Z");
      expect(call.until).toBe("2026-09-10T00:00:00.000Z");
    }
  });
});

describe("runPull — a reset handle is backfilled to the team's range", () => {
  it("backfills a handle whose cache was lost to the range its teammates cover", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    await pull(store, dir);

    // alice's cache is discarded (corrupt file, or she was just added to the team).
    await store.save("github", "alice", undefined);

    const calls = await pull(store, dir, {
      requested: { since: d("2026-09-05T00:00:00.000Z"), until: d("2026-09-10T00:00:00.000Z") },
    });

    // Without backfilling to the team range, alice renders as real zeros for
    // every earlier week bob covers — the dataset spans the union of coverage.
    const aliceWindows = calls.filter((c) => c.handles.includes("alice"));
    expect(aliceWindows).toHaveLength(2);
    for (const call of aliceWindows) {
      expect(call.since).toBe("2026-03-01T00:00:00.000Z");
    }
  });
});

describe("runPull — batching handles that share a window", () => {
  it("gives a handle that fell out of step its own request, and keeps the rest batched", async () => {
    const team3: TeamConfig = { ...team, members: [...team.members, { name: "Carol", github: "carol" }] };
    const store = createMemoryCacheStore();
    const dir = dataDir();
    await pull(store, dir, { teams: [team3] });

    // carol's cache is lost; alice and bob are still in step with each other.
    await store.save("github", "carol", undefined);
    const calls = await pull(store, dir, {
      teams: [team3],
      requested: { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-11T00:00:00.000Z") },
      now: d("2026-09-11T08:00:00.000Z"),
    });

    // Oldest window first: carol's backfill, then the shared delta.
    expect(calls.map((c) => [c.handles, c.since])).toEqual([
      [["carol"], "2026-03-01T00:00:00.000Z"],
      [["carol"], "2026-03-01T00:00:00.000Z"],
      [["alice", "bob"], "2026-09-08T00:00:00.000Z"],
      [["alice", "bob"], "2026-09-08T00:00:00.000Z"],
    ]);
  });

  it("keeps each member's entities in their own cache", async () => {
    const store = createMemoryCacheStore();
    await pull(store, dataDir());

    // One batched request served both, but each cache holds only its owner's work.
    const alice = await store.load("github", "alice");
    const bob = await store.load("github", "bob");
    expect(JSON.stringify(alice)).toContain('"authorHandle":"alice"');
    expect(JSON.stringify(alice)).not.toContain('"authorHandle":"bob"');
    expect(JSON.stringify(bob)).toContain('"authorHandle":"bob"');
    expect(JSON.stringify(bob)).not.toContain('"authorHandle":"alice"');
  });
});

describe("runPull — --full must not destroy history when it fails", () => {
  it("keeps the existing cache when a --full rebuild is incomplete", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    await pull(store, dir);

    // --full starts from an empty cache. If the refetch fails, saving that
    // empty cache would throw away accumulated history that GitHub may no
    // longer return within --weeks.
    const inner = createFakeGitHubClient(fixtures);
    const failing: GitHubClient = {
      searchPrsByAuthors: () => Promise.reject(new Error("502 Bad Gateway")),
      searchPrsReviewedBy: (h, s, u) => inner.searchPrsReviewedBy(h, s, u),
      usage: () => inner.usage(),
    };
    await runPull(options({ connector: createGitHubConnector(failing), store, dataDir: dir, full: true }));

    // Coverage survived, so an ordinary pull still asks only for the delta.
    const after = await pull(store, dir, {
      requested: { since: d("2026-03-01T00:00:00.000Z"), until: d("2026-09-11T00:00:00.000Z") },
      now: d("2026-09-11T08:00:00.000Z"),
    });
    for (const call of after) {
      expect(call.since).toBe("2026-09-08T00:00:00.000Z");
    }
  });

  it("still replaces the cache when a --full rebuild succeeds", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    await pull(store, dir);

    await pull(store, dir, { full: true });

    // A successful --full covers the same range, so nothing is left to fetch.
    expect(await pull(store, dir)).toEqual([]);
  });
});

describe("runPull — resilience", () => {
  it("does not mark a window covered when a search failed, and retries it next pull", async () => {
    const store = createMemoryCacheStore();
    const dir = dataDir();
    const inner = createFakeGitHubClient(fixtures);
    const failing: GitHubClient = {
      searchPrsByAuthors: () => Promise.reject(new Error("502 Bad Gateway")),
      searchPrsReviewedBy: (h, s, u) => inner.searchPrsReviewedBy(h, s, u),
      usage: () => inner.usage(),
    };

    await runPull(options({ connector: createGitHubConnector(failing), store, dataDir: dir }));

    // Nothing was recorded as covered, so the next pull asks for the full window again.
    const retry = await pull(store, dir);
    expect(retry).toHaveLength(2);
    for (const call of retry) {
      expect(call.since).toBe("2026-03-01T00:00:00.000Z");
    }
  });

  it("does not record a truncated search as covered", async () => {
    // GitHub's 1000-result ceiling drops the oldest matches. Caching that window
    // as covered would mean no ordinary pull ever asks for them again.
    const store = createMemoryCacheStore();
    const dir = dataDir();
    const inner = createFakeGitHubClient(fixtures);
    const capped: GitHubClient = {
      async searchPrsByAuthors(h, s, u) {
        return { nodes: (await inner.searchPrsByAuthors(h, s, u)).nodes, truncated: true };
      },
      searchPrsReviewedBy: (h, s, u) => inner.searchPrsReviewedBy(h, s, u),
      usage: () => inner.usage(),
    };

    await runPull(options({ connector: createGitHubConnector(capped), store, dataDir: dir }));

    // Uncovered, so the next pull asks for the whole window again rather than a delta.
    const retry = await pull(store, dir);
    expect(retry).toHaveLength(2);
    for (const call of retry) {
      expect(call.since).toBe("2026-03-01T00:00:00.000Z");
    }
  });

  it("still writes the dataset when the cache cannot be saved", async () => {
    const dir = dataDir();
    const inner = createMemoryCacheStore();
    const unwritable: CacheStore = {
      load: (source, handle) => inner.load(source, handle),
      save: () => Promise.reject(new Error("EACCES: permission denied")),
    };

    await runPull(
      options({
        connector: createGitHubConnector(createFakeGitHubClient(fixtures)),
        store: unwritable,
        dataDir: dir,
      }),
    );

    expect(readFileSync(join(dir, "acme", "index.json"), "utf8")).toContain("weeks");
  });

  it("still writes a dataset when a search failed", async () => {
    const dir = dataDir();
    const inner = createFakeGitHubClient(fixtures);
    const failing: GitHubClient = {
      searchPrsByAuthors: () => Promise.reject(new Error("502")),
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
