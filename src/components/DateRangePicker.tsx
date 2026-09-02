import { Select } from "@base-ui/react/select";
import { Popover } from "@base-ui/react/popover";
import { RANGE_PRESETS, setRange, type RangePreset, type Selection } from "../lib/url-state";

const OPTIONS: { value: RangePreset; label: string }[] = [
  ...RANGE_PRESETS,
  { value: "custom", label: "Custom…" },
];

const TRIGGER_CLASS =
  "inline-flex h-8 min-w-[10rem] items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-muted data-[popup-open]:border-primary";
const POPUP_CLASS =
  "z-50 min-w-[var(--anchor-width)] rounded-control border border-border bg-card p-1 shadow-md outline-none";
const ITEM_CLASS =
  "flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-muted data-[selected]:font-semibold";

export function DateRangePicker({
  selection,
  minDate,
  maxDate,
}: {
  selection: Selection;
  minDate: string;
  maxDate: string;
}) {
  const from = selection.from ?? minDate;
  const to = selection.to ?? maxDate;

  const onPreset = (value: RangePreset): void => {
    if (value === "custom") setRange("custom", from, to);
    else setRange(value);
  };

  return (
    <div className="flex items-center gap-2" data-testid="date-range">
      <Select.Root
        items={OPTIONS}
        value={selection.range}
        onValueChange={(value) => {
          if (typeof value === "string") onPreset(value);
        }}
      >
        <Select.Trigger className={TRIGGER_CLASS} aria-label="Date range">
          <Select.Value />
          <Select.Icon className="text-foreground-muted">▾</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4}>
            <Select.Popup className={POPUP_CLASS}>
              {OPTIONS.map((o) => (
                <Select.Item key={o.value} value={o.value} className={ITEM_CLASS}>
                  <Select.ItemText>{o.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>

      {selection.range === "custom" && (
        <Popover.Root>
          <Popover.Trigger className={TRIGGER_CLASS + " min-w-0"} aria-label="Custom range">
            <span className="tabular">
              {from} – {to}
            </span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={6} align="end">
              <Popover.Popup className="z-50 rounded-card border border-border bg-card p-3 shadow-md outline-none">
                <div className="flex flex-col gap-2 text-sm">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-foreground-muted">From</span>
                    <input
                      type="date"
                      className="tabular rounded-control border border-border bg-surface px-2 py-1"
                      min={minDate}
                      max={maxDate}
                      value={from}
                      onChange={(e) => {
                        setRange("custom", e.target.value, to);
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-foreground-muted">To</span>
                    <input
                      type="date"
                      className="tabular rounded-control border border-border bg-surface px-2 py-1"
                      min={minDate}
                      max={maxDate}
                      value={to}
                      onChange={(e) => {
                        setRange("custom", from, e.target.value);
                      }}
                    />
                  </label>
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}
