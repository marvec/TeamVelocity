import { describe, it, expect } from "vitest";
import { parseAppConfig, ConfigError, normalizeGithubHandle } from "./config";

function validRaw(): unknown {
  return {
    teams: [
      {
        id: "jdt",
        name: "JDT",
        sprintStartsOn: "Wed",
        members: [
          { name: "Jeff", github: "jeffhandle" },
          { name: "Jack", github: "https://github.com/jackhandle", bitbucket: "jack_bb" },
        ],
        repos: ["acme/backend"],
      },
    ],
  };
}

describe("normalizeGithubHandle", () => {
  it("passes through a plain handle", () => {
    expect(normalizeGithubHandle("jeffhandle")).toBe("jeffhandle");
  });
  it("extracts a handle from a profile URL", () => {
    expect(normalizeGithubHandle("https://github.com/jackhandle")).toBe("jackhandle");
    expect(normalizeGithubHandle("http://github.com/jackhandle/")).toBe("jackhandle");
  });
  it("strips a leading @", () => {
    expect(normalizeGithubHandle("@octocat")).toBe("octocat");
  });
});

describe("parseAppConfig — valid input", () => {
  it("parses a valid config and normalizes handles", () => {
    const cfg = parseAppConfig(validRaw());
    expect(cfg.teams).toHaveLength(1);
    expect(cfg.teams[0].members[1].github).toBe("jackhandle");
  });

  it("applies defaults for sprintStartHour and repos", () => {
    const cfg = parseAppConfig(validRaw());
    expect(cfg.teams[0].sprintStartHour).toBe(0);
    expect(cfg.teams[0].sprintStartsOn).toBe("Wed");
  });

  it("defaults sprintStartsOn to Mon when omitted", () => {
    const raw = {
      teams: [{ id: "t", name: "T", members: [{ name: "A", github: "a" }] }],
    };
    expect(parseAppConfig(raw).teams[0].sprintStartsOn).toBe("Mon");
  });
});

describe("parseAppConfig — invalid input is rejected with a clear message", () => {
  it("throws ConfigError for a non-object", () => {
    expect(() => parseAppConfig(null)).toThrow(ConfigError);
  });

  it("rejects an empty teams array", () => {
    expect(() => parseAppConfig({ teams: [] })).toThrow(ConfigError);
  });

  it("rejects a team with no members and mentions members in the message", () => {
    let message = "";
    try {
      parseAppConfig({ teams: [{ id: "t", name: "T", members: [] }] });
    } catch (e) {
      message = (e as ConfigError).message;
    }
    expect(message).toMatch(/members/i);
  });

  it("rejects a member with no source handle", () => {
    expect(() =>
      parseAppConfig({ teams: [{ id: "t", name: "T", members: [{ name: "A" }] }] }),
    ).toThrow(/handle/i);
  });

  it("rejects an invalid team id slug", () => {
    expect(() =>
      parseAppConfig({
        teams: [{ id: "Bad Id!", name: "T", members: [{ name: "A", github: "a" }] }],
      }),
    ).toThrow(/slug/i);
  });

  it("rejects an unknown key (fails loud on drift)", () => {
    expect(() =>
      parseAppConfig({
        teams: [{ id: "t", name: "T", members: [{ name: "A", github: "a" }], nope: 1 }],
      }),
    ).toThrow(ConfigError);
  });

  it("rejects a bad repo slug", () => {
    expect(() =>
      parseAppConfig({
        teams: [{ id: "t", name: "T", members: [{ name: "A", github: "a" }], repos: ["nope"] }],
      }),
    ).toThrow(ConfigError);
  });

  it("rejects duplicate team ids", () => {
    expect(() =>
      parseAppConfig({
        teams: [
          { id: "t", name: "T1", members: [{ name: "A", github: "a" }] },
          { id: "t", name: "T2", members: [{ name: "B", github: "b" }] },
        ],
      }),
    ).toThrow(/unique/i);
  });
});
