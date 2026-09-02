/**
 * Resolve the data base directory the SPA fetches from. Defaults to the
 * committed sample dataset; a `?data=` search param overrides it (used by e2e
 * to point at alternative fixture sets). The SPA's ONLY data source is fetch of
 * files under this dir — it never touches GitHub or the token (invariant #1).
 */

const DEFAULT_DIR = "/data/sample";

export function getDataDir(): string {
  if (typeof window === "undefined") return DEFAULT_DIR;
  const override = new URLSearchParams(window.location.search).get("data");
  const dir = override ?? import.meta.env.VITE_DATA_DIR ?? DEFAULT_DIR;
  return dir.replace(/\/+$/, "");
}
