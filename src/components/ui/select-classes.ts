/** Shared Base UI Select styling (date range, theme switcher). */
export const SELECT_TRIGGER_CLASS =
  "inline-flex h-8 items-center justify-between gap-2 rounded-control border-(length:--border-w) border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-muted data-[popup-open]:border-primary";
export const SELECT_POPUP_CLASS =
  "z-50 min-w-[var(--anchor-width)] rounded-control border-(length:--border-w) border-border bg-card p-1 shadow-md outline-none";
export const SELECT_ITEM_CLASS =
  "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-muted data-[selected]:font-semibold";
