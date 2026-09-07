import { describe, it, expect } from "vitest";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_STORAGE_KEY,
  applyTheme,
  isThemeId,
  readStoredTheme,
  writeStoredTheme,
} from "./themes";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("theme registry", () => {
  it("offers the five themes with Daylight as the default", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["daylight", "nightlight", "poster", "sorbet", "solarized"]);
    expect(DEFAULT_THEME).toBe("daylight");
  });

  it("marks Nightlight as the only dark scheme", () => {
    expect(THEMES.filter((t) => t.scheme === "dark").map((t) => t.id)).toEqual(["nightlight"]);
  });

  it("recognises theme ids and rejects anything else", () => {
    expect(isThemeId("poster")).toBe(true);
    expect(isThemeId("neon")).toBe(false);
    expect(isThemeId(42)).toBe(false);
  });
});

describe("readStoredTheme", () => {
  it("returns the stored theme when it is valid", () => {
    const storage = new MemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, "sorbet");
    expect(readStoredTheme(storage)).toBe("sorbet");
  });

  it("falls back to the default when nothing is stored", () => {
    expect(readStoredTheme(new MemoryStorage())).toBe("daylight");
  });

  it("falls back to the default for an unknown stored value", () => {
    const storage = new MemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, "hotdog-stand");
    expect(readStoredTheme(storage)).toBe("daylight");
  });

  it("falls back to the default when storage is unavailable or throws", () => {
    expect(readStoredTheme(null)).toBe("daylight");
    const broken = {
      getItem(): string | null {
        throw new Error("SecurityError");
      },
    };
    expect(readStoredTheme(broken)).toBe("daylight");
  });
});

describe("writeStoredTheme", () => {
  it("persists the theme under the storage key", () => {
    const storage = new MemoryStorage();
    writeStoredTheme(storage, "poster");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("poster");
  });

  it("ignores storage that is unavailable or throws", () => {
    expect(() => {
      writeStoredTheme(null, "poster");
    }).not.toThrow();
    const broken = {
      setItem(): void {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => {
      writeStoredTheme(broken, "poster");
    }).not.toThrow();
  });
});

describe("applyTheme", () => {
  it("stamps the theme id on the root element", () => {
    const root = document.createElement("html");
    applyTheme(root, "nightlight");
    expect(root.dataset.theme).toBe("nightlight");
    applyTheme(root, "daylight");
    expect(root.dataset.theme).toBe("daylight");
  });
});
