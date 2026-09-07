import { Select } from "@base-ui/react/select";
import { THEMES, isThemeId, type ThemeId } from "../theme/themes";
import { useTheme } from "../theme/use-theme";
import { SELECT_ITEM_CLASS, SELECT_POPUP_CLASS, SELECT_TRIGGER_CLASS } from "./ui/select-classes";

/**
 * Three dots in a theme's own page / primary / yellow. Scoping `data-theme`
 * on the element makes the token overrides apply to just this subtree, so the
 * swatch is always in sync with globals.css without duplicating any colour.
 */
function ThemeSwatch({ id }: { id: ThemeId }) {
  return (
    <span
      data-theme={id}
      aria-hidden
      className="inline-flex shrink-0 overflow-hidden rounded-full border border-border bg-background"
    >
      <i className="size-2.5 bg-background" />
      <i className="size-2.5 bg-primary" />
      <i className="size-2.5 bg-band-yellow" />
    </span>
  );
}

const ITEMS = THEMES.map((t) => ({ value: t.id, label: t.label }));

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <Select.Root
      items={ITEMS}
      value={theme}
      onValueChange={(value) => {
        if (isThemeId(value)) setTheme(value);
      }}
    >
      <Select.Trigger className={SELECT_TRIGGER_CLASS} aria-label="Theme" data-testid="theme-switcher">
        <span className="inline-flex items-center gap-2">
          <ThemeSwatch id={theme} />
          <Select.Value />
        </span>
        <Select.Icon className="text-foreground-muted">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} align="end">
          <Select.Popup className={SELECT_POPUP_CLASS}>
            {THEMES.map((t) => (
              <Select.Item key={t.id} value={t.id} className={SELECT_ITEM_CLASS}>
                <ThemeSwatch id={t.id} />
                <span className="flex flex-col leading-tight">
                  <Select.ItemText>{t.label}</Select.ItemText>
                  <span className="text-xs font-normal text-foreground-muted">
                    {t.description}
                    {t.scheme === "dark" && " · dark"}
                  </span>
                </span>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
