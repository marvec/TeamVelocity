/**
 * Theme registry + persistence. Themes are pure token sets in globals.css,
 * switched by stamping `data-theme` on <html>; this module only knows their
 * ids, labels, and how to remember the user's pick in localStorage.
 */

export interface ThemeMeta {
  id: string;
  label: string;
  /** Drives the switcher hint; the CSS sets `color-scheme` itself. */
  scheme: "light" | "dark";
  description: string;
}

export const THEMES = [
  { id: "daylight", label: "Daylight", scheme: "light", description: "Clean white, cool grey, jewel tones" },
  { id: "nightlight", label: "Nightlight", scheme: "dark", description: "Daylight after dark" },
  { id: "poster", label: "Poster", scheme: "light", description: "Black rules, warm paper, flat blocks" },
  { id: "sorbet", label: "Sorbet", scheme: "light", description: "Peach cream, soft shadows, candy marks" },
  { id: "solarized", label: "Solarized", scheme: "light", description: "The original muted palette" },
] as const satisfies readonly ThemeMeta[];

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "daylight";
export const THEME_STORAGE_KEY = "teamvelocity.theme";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

/** The persisted theme, or the default when storage is missing, empty, invalid, or throwing. */
export function readStoredTheme(storage: Pick<Storage, "getItem"> | null | undefined): ThemeId {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeId(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Best-effort persistence — a blocked or full storage must never break the UI. */
export function writeStoredTheme(storage: Pick<Storage, "setItem"> | null | undefined, id: ThemeId): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // ignore: private mode / quota / disabled storage
  }
}

/** Stamps the theme on the root element; globals.css does the rest. */
export function applyTheme(root: HTMLElement, id: ThemeId): void {
  root.dataset.theme = id;
}
