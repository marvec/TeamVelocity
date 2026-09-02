import { describe, it, expect, beforeEach } from "vitest";
import {
  WEEK_NONE,
  clearWeek,
  selectMember,
  selectRepo,
  selectTeam,
  selectWeek,
  setRange,
} from "./url-state";

function params(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/?team=t&week=W1&member=alice&repo=acme%2Fx");
});

describe("url-state cascade (Team → Week → Person → Repo)", () => {
  it("selectWeek focuses the week and clears the person + repo below it", () => {
    selectWeek("W2");
    const p = params();
    expect(p.get("week")).toBe("W2");
    expect(p.get("member")).toBeNull();
    expect(p.get("repo")).toBeNull();
    expect(p.get("team")).toBe("t"); // team is preserved
  });

  it("selectMember clears the repo but keeps the week", () => {
    selectMember("bob");
    const p = params();
    expect(p.get("member")).toBe("bob");
    expect(p.get("repo")).toBeNull();
    expect(p.get("week")).toBe("W1");
  });

  it("selectRepo sets the repo and preserves week + member", () => {
    selectRepo("acme/y");
    const p = params();
    expect(p.get("repo")).toBe("acme/y");
    expect(p.get("member")).toBe("alice");
  });

  it("clearWeek marks the week explicitly deselected and clears person + repo", () => {
    clearWeek();
    const p = params();
    expect(p.get("week")).toBe(WEEK_NONE);
    expect(p.get("member")).toBeNull();
    expect(p.get("repo")).toBeNull();
  });

  it("selectTeam resets the whole drill-down", () => {
    selectTeam("other");
    const p = params();
    expect(p.get("team")).toBe("other");
    expect(p.get("week")).toBeNull();
    expect(p.get("member")).toBeNull();
    expect(p.get("repo")).toBeNull();
  });

  it("setRange('custom', from, to) records the window; a preset clears it", () => {
    setRange("custom", "2026-06-01", "2026-07-01");
    let p = params();
    expect(p.get("range")).toBe("custom");
    expect(p.get("from")).toBe("2026-06-01");
    expect(p.get("to")).toBe("2026-07-01");

    setRange("3m");
    p = params();
    expect(p.get("range")).toBe("3m");
    expect(p.get("from")).toBeNull();
    expect(p.get("to")).toBeNull();
  });
});
