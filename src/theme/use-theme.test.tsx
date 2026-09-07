import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { THEME_STORAGE_KEY } from "./themes";
import { useTheme } from "./use-theme";

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("starts from the persisted theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "poster");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("poster");
  });

  it("defaults to Daylight with nothing persisted", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("daylight");
  });

  it("setTheme updates the hook, the root element, and storage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("nightlight");
    });
    expect(result.current.theme).toBe("nightlight");
    expect(document.documentElement.dataset.theme).toBe("nightlight");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("nightlight");
  });

  it("keeps every mounted subscriber in sync", () => {
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());
    act(() => {
      a.result.current.setTheme("sorbet");
    });
    expect(b.result.current.theme).toBe("sorbet");
  });
});
