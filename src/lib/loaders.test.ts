import { describe, it, expect, vi, afterEach } from "vitest";
import { loadTeams, loadWeekDetail, LoadError } from "./loaders";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}
function nonJsonResponse(): Response {
  return { ok: true, status: 200, json: () => Promise.reject(new Error("not json")) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loaders — fetch + Zod validation", () => {
  it("loads and validates teams.json", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{ id: "a", name: "A" }])));
    await expect(loadTeams("/data/x")).resolves.toEqual([{ id: "a", name: "A" }]);
  });

  it("classifies a 404 as not-found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, false, 404)));
    await expect(loadTeams("/data/x")).rejects.toMatchObject({ kind: "not-found" });
  });

  it("fails loud on schema drift → invalid", async () => {
    // wrong types + missing required `name`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{ id: 1 }])));
    const err: unknown = await loadTeams("/data/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadError);
    expect((err as LoadError).kind).toBe("invalid");
    expect((err as LoadError).message).toMatch(/Schema drift/);
  });

  it("treats a non-JSON body (dev SPA fallback) as not-found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(nonJsonResponse()));
    await expect(loadTeams("/data/x")).rejects.toMatchObject({ kind: "not-found" });
  });

  it("classifies a fetch rejection as network", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(loadWeekDetail("/data/x", "t", "2026-08-03")).rejects.toMatchObject({ kind: "network" });
  });
});
