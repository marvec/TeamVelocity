import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createFileCacheStore,
  createMemoryCacheStore,
  loadHandleCache,
  saveHandleCache,
} from "./store";
import { emptyHandleCache, serializeHandleCache } from "../../shared/schema/cache";
import type { Logger } from "../connectors/types";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "tv-cache-"));
}

function collectingLogger(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = [];
  return { warnings, logger: { info() {}, warn: (m) => warnings.push(m), error() {}, debug() {} } };
}

describe("file cache store", () => {
  it("round-trips a value through disk", async () => {
    const store = createFileCacheStore(tempDir());
    await store.save("github", "alice", { hello: "world" });
    expect(await store.load("github", "alice")).toEqual({ hello: "world" });
  });

  it("returns undefined for a handle never written", async () => {
    expect(await createFileCacheStore(tempDir()).load("github", "nobody")).toBeUndefined();
  });

  it("keeps handles and sources in separate files", async () => {
    const dir = tempDir();
    const store = createFileCacheStore(dir);
    await store.save("github", "alice", { who: "alice" });
    await store.save("github", "bob", { who: "bob" });
    await store.save("bitbucket", "alice", { who: "bb-alice" });

    expect(await store.load("github", "alice")).toEqual({ who: "alice" });
    expect(await store.load("github", "bob")).toEqual({ who: "bob" });
    expect(await store.load("bitbucket", "alice")).toEqual({ who: "bb-alice" });
    expect(readFileSync(join(dir, "github", "alice.json"), "utf8")).toContain("alice");
  });

  it("refuses a handle that would escape the cache directory", async () => {
    const store = createFileCacheStore(tempDir());
    await expect(store.save("github", "../../etc/passwd", {})).rejects.toThrow(/handle/i);
    await expect(store.load("github", "..")).rejects.toThrow(/handle/i);
  });

  it("throws on a corrupt file so the caller can warn and re-fetch", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "github"), { recursive: true });
    writeFileSync(join(dir, "github", "alice.json"), "{ not json", "utf8");

    await expect(createFileCacheStore(dir).load("github", "alice")).rejects.toThrow();
  });
});

describe("memory cache store", () => {
  it("round-trips without touching disk", async () => {
    const store = createMemoryCacheStore();
    await store.save("github", "alice", { hello: "world" });
    expect(await store.load("github", "alice")).toEqual({ hello: "world" });
  });

  it("starts empty and isolates instances", async () => {
    const a = createMemoryCacheStore();
    await a.save("github", "alice", { n: 1 });
    expect(await createMemoryCacheStore().load("github", "alice")).toBeUndefined();
  });
});

describe("loadHandleCache", () => {
  it("returns an empty, uncovered cache when nothing is stored", async () => {
    const { logger, warnings } = collectingLogger();
    const cache = await loadHandleCache(createMemoryCacheStore(), "github", "alice", logger);

    expect(cache.coverage).toBeUndefined();
    expect(cache.prs.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it("returns what was saved", async () => {
    const { logger } = collectingLogger();
    const store = createMemoryCacheStore();
    const original = emptyHandleCache("github", "alice");
    original.coverage = { since: new Date("2026-03-01T00:00:00.000Z"), until: new Date("2026-09-01T00:00:00.000Z") };

    await saveHandleCache(store, original);

    expect(await loadHandleCache(store, "github", "alice", logger)).toEqual(original);
  });

  it("warns and re-fetches from scratch when the file drifted", async () => {
    const { logger, warnings } = collectingLogger();
    const store = createMemoryCacheStore();
    const stale = { ...serializeHandleCache(emptyHandleCache("github", "alice")), version: 99 };
    await store.save("github", "alice", stale);

    const cache = await loadHandleCache(store, "github", "alice", logger);

    // Disposable by design: drift costs API calls, never a failed pull.
    expect(cache.coverage).toBeUndefined();
    expect(cache.prs.size).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("alice");
  });

  it("warns and re-fetches when the stored blob is unreadable", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "github"), { recursive: true });
    writeFileSync(join(dir, "github", "alice.json"), "{ not json", "utf8");
    const { logger, warnings } = collectingLogger();

    const cache = await loadHandleCache(createFileCacheStore(dir), "github", "alice", logger);

    expect(cache.prs.size).toBe(0);
    expect(warnings).toHaveLength(1);
  });
});
