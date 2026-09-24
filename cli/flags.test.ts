/**
 * `parseFlags` is the only place the CLI's argv contract is enforced, and the
 * incremental-pull flags carry real consequences — `--full` refetches
 * everything, `--no-cache` disables accumulation — so their parsing is pinned
 * here rather than only exercised through a live run.
 */

import { describe, it, expect } from "vitest";
import { parseFlags } from "./pull";

describe("parseFlags — defaults", () => {
  it("defaults to a cached, 26-week, 2-day-overlap pull", () => {
    const flags = parseFlags([]);
    expect(flags.full).toBe(false);
    expect(flags.noCache).toBe(false);
    expect(flags.overlapDays).toBe(2);
    expect(flags.cacheDir).toBe(".cache/pull");
    expect(flags.weeks).toBe(26);
    expect(flags.dataDir).toBe("public/data");
    expect(flags.config).toBe("teamvelocity.config.json");
  });
});

describe("parseFlags — incremental-pull flags", () => {
  it("accepts --full and --no-cache", () => {
    expect(parseFlags(["--full"]).full).toBe(true);
    expect(parseFlags(["--no-cache"]).noCache).toBe(true);
  });

  it("accepts --cache-dir and --overlap-days", () => {
    const flags = parseFlags(["--cache-dir", "/tmp/tv", "--overlap-days", "5"]);
    expect(flags.cacheDir).toBe("/tmp/tv");
    expect(flags.overlapDays).toBe(5);
  });

  it("accepts an overlap of zero", () => {
    expect(parseFlags(["--overlap-days", "0"]).overlapDays).toBe(0);
  });

  it("rejects a negative overlap rather than silently skipping forward", () => {
    expect(() => parseFlags(["--overlap-days", "-3"])).toThrow(/overlap-days/);
  });

  it("rejects a non-numeric overlap", () => {
    expect(() => parseFlags(["--overlap-days", "soon"])).toThrow(/overlap-days/);
  });

  it("rejects a flag given no value", () => {
    expect(() => parseFlags(["--cache-dir"])).toThrow(/Missing value/);
    expect(() => parseFlags(["--overlap-days"])).toThrow(/Missing value/);
  });
});

describe("parseFlags — existing flags still hold", () => {
  it("parses the pre-existing range and target flags", () => {
    const flags = parseFlags([
      "--team", "jdt",
      "--weeks", "52",
      "--since", "2026-01-01",
      "--until", "2026-06-01",
      "--data-dir", "out",
      "--config", "other.json",
      "--dry-run",
      "--verbose",
    ]);
    expect(flags).toMatchObject({
      team: "jdt",
      weeks: 52,
      since: "2026-01-01",
      until: "2026-06-01",
      dataDir: "out",
      config: "other.json",
      dryRun: true,
      verbose: true,
    });
  });

  it("rejects a non-positive --weeks", () => {
    expect(() => parseFlags(["--weeks", "0"])).toThrow(/weeks/);
    expect(() => parseFlags(["--weeks", "-1"])).toThrow(/weeks/);
  });

  it("rejects an unknown flag instead of ignoring it", () => {
    expect(() => parseFlags(["--refresh"])).toThrow(/Unknown flag: --refresh/);
  });
});
