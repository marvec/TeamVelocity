import { useSyncExternalStore } from "react";
import { applyTheme, isThemeId, readStoredTheme, writeStoredTheme, type ThemeId } from "./themes";

// The <html data-theme> attribute is the live source of truth (it is what the
// CSS reads); localStorage is the persisted copy. No module-level cache, so
// the state survives without storage and tests can reset it via the DOM.
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getTheme(): ThemeId {
  const live = document.documentElement.dataset.theme;
  return isThemeId(live) ? live : readStoredTheme(storage());
}

/** Apply the persisted theme before first paint (called once from main.tsx). */
export function bootTheme(): ThemeId {
  const id = readStoredTheme(storage());
  applyTheme(document.documentElement, id);
  return id;
}

export function setTheme(id: ThemeId): void {
  if (id === getTheme() && document.documentElement.dataset.theme === id) return;
  applyTheme(document.documentElement, id);
  writeStoredTheme(storage(), id);
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): { theme: ThemeId; setTheme: (id: ThemeId) => void } {
  const theme = useSyncExternalStore(subscribe, getTheme, getTheme);
  return { theme, setTheme };
}
