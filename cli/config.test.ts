import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, getGithubToken } from "./config";
import { ConfigError } from "../shared/schema/config";

describe("loadConfig", () => {
  it("parses the committed example config", () => {
    const cfg = loadConfig("teamvelocity.config.example.json");
    expect(cfg.teams[0].id).toBe("jdt");
    expect(cfg.teams[0].members[1].github).toBe("jackhandle"); // URL normalized
  });

  it("throws a clear error when the file is missing", () => {
    expect(() => loadConfig("does-not-exist.config.json")).toThrow(ConfigError);
    expect(() => loadConfig("does-not-exist.config.json")).toThrow(/not found/i);
  });

  it("throws a clear error on invalid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "tv-cfg-"));
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{ not json ", "utf8");
    expect(() => loadConfig(bad)).toThrow(/valid JSON/i);
  });

  it("rejects a structurally invalid config", () => {
    const dir = mkdtempSync(join(tmpdir(), "tv-cfg-"));
    const file = join(dir, "cfg.json");
    writeFileSync(file, JSON.stringify({ teams: [] }), "utf8");
    expect(() => loadConfig(file)).toThrow(ConfigError);
  });
});

describe("getGithubToken", () => {
  it("returns undefined for the placeholder token", () => {
    const prev = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_replace_me";
    try {
      expect(getGithubToken()).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = prev;
    }
  });

  it("returns a real token when present", () => {
    const prev = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_real_example_value";
    try {
      expect(getGithubToken()).toBe("ghp_real_example_value");
    } finally {
      if (prev === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = prev;
    }
  });
});
