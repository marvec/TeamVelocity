/**
 * Persistence for the pull cache. The store itself is a dumb JSON blob store
 * keyed by (source, handle); all schema knowledge lives in
 * `shared/schema/cache.ts`, and all filesystem access lives here (design §9).
 */

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SourceId } from "../../shared/types";
import {
  emptyHandleCache,
  parseHandleCache,
  serializeHandleCache,
  type HandleCache,
} from "../../shared/schema/cache";
import type { Logger } from "../connectors/types";

export interface CacheStore {
  /** The stored blob, or `undefined` when this handle has nothing stored. */
  load(source: SourceId, handle: string): Promise<unknown>;
  save(source: SourceId, handle: string, value: unknown): Promise<void>;
}

/**
 * Handles reach us from a config file and become path segments, so they are
 * checked rather than trusted. GitHub handles already satisfy this via
 * `GithubHandleSchema`; the guard is here for whatever a future connector maps
 * onto the same store.
 */
const SAFE_HANDLE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function handlePath(dir: string, source: SourceId, handle: string): string {
  if (!SAFE_HANDLE.test(handle) || handle.includes("..")) {
    throw new Error(`Unsafe cache handle: ${JSON.stringify(handle)}`);
  }
  return join(dir, source, `${handle}.json`);
}

function isMissingFile(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

/** Reads and writes `<dir>/<source>/<handle>.json`. */
export function createFileCacheStore(dir: string): CacheStore {
  return {
    async load(source, handle) {
      const path = handlePath(dir, source, handle);
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (err) {
        if (isMissingFile(err)) return undefined;
        throw err;
      }
      return JSON.parse(text) as unknown;
    },

    async save(source, handle, value) {
      const path = handlePath(dir, source, handle);
      await mkdir(dirname(path), { recursive: true });
      // Write beside the target and rename over it. A direct overwrite that is
      // interrupted leaves unparseable JSON, which the load path discards —
      // silently costing the handle's whole accumulated history. `rename` within
      // one directory is atomic, so a reader sees either the old file or the new
      // one. The pid keeps two concurrent pulls off each other's temp file.
      const temp = `${path}.${String(process.pid)}.tmp`;
      try {
        await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
        await rename(temp, path);
      } catch (err) {
        await rm(temp, { force: true });
        throw err;
      }
    },
  };
}

/** An in-process store for tests and for runs that must not persist anything. */
export function createMemoryCacheStore(): CacheStore {
  const blobs = new Map<string, unknown>();
  const key = (source: SourceId, handle: string): string => `${source}/${handle}`;
  return {
    load(source, handle) {
      return Promise.resolve(blobs.get(key(source, handle)));
    },
    save(source, handle, value) {
      blobs.set(key(source, handle), value);
      return Promise.resolve();
    },
  };
}

/**
 * The handle's cache, or an empty one.
 *
 * Any failure — missing, corrupt, drifted, written by another version — is
 * reported and swallowed: the cache is disposable, so the cost of drift is the
 * API calls to refill it, never a failed pull (design §10). This is deliberately
 * weaker than invariant #4, which governs `public/data/`.
 */
export async function loadHandleCache(
  store: CacheStore,
  source: SourceId,
  handle: string,
  logger: Logger,
): Promise<HandleCache> {
  try {
    const raw = await store.load(source, handle);
    if (raw === undefined) return emptyHandleCache(source, handle);
    return parseHandleCache(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message.split("\n")[0] : String(err);
    logger.warn(
      `cache: discarding unusable cache for ${source}/${handle} (${reason}) — re-fetching this handle from scratch`,
    );
    return emptyHandleCache(source, handle);
  }
}

export async function saveHandleCache(store: CacheStore, cache: HandleCache): Promise<void> {
  await store.save(cache.source, cache.handle, serializeHandleCache(cache));
}
