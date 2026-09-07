import { cn } from "../../lib/cn";

export function DeselectChip({
  label,
  onClear,
  testid,
  className,
}: {
  label: string;
  onClear: () => void;
  testid?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      data-testid={testid}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip border-(length:--border-w) border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-heading transition-colors hover:bg-background",
        className,
      )}
    >
      <span>{label}</span>
      <span aria-hidden className="font-normal text-foreground-muted">
        ✕
      </span>
      <span className="sr-only">clear</span>
    </button>
  );
}
