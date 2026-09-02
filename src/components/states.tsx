import type { LoadError } from "../lib/loaders";
import { Card, CardBody } from "./ui/Card";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-foreground-muted" data-testid="loading">
      <span className="size-3 animate-spin rounded-full border-2 border-border border-t-primary" />
      {label}
    </div>
  );
}

export function ErrorState({ error }: { error: LoadError }) {
  return (
    <Card className="mx-auto my-12 max-w-xl border-band-red/40">
      <CardBody>
        <h2 className="mb-2 text-base font-semibold text-band-red" data-testid="error">
          {error.kind === "invalid" ? "Data validation failed" : "Could not load data"}
        </h2>
        <pre className="tabular overflow-x-auto whitespace-pre-wrap text-xs text-foreground-muted">{error.message}</pre>
      </CardBody>
    </Card>
  );
}

export function NoDataState() {
  return (
    <div className="mx-auto my-16 max-w-lg text-center" data-testid="no-data">
      <div className="mb-3 text-4xl">📭</div>
      <h2 className="mb-2 text-lg font-semibold text-heading">No data yet</h2>
      <p className="mb-4 text-sm text-foreground-muted">
        TeamVelocity reads pre-generated JSON. Configure your teams and pull once to get started.
      </p>
      <ol className="mx-auto inline-block space-y-1 text-left text-sm text-foreground-muted">
        <li>
          1. Copy <code className="tabular rounded bg-muted px-1">teamvelocity.config.example.json</code> →{" "}
          <code className="tabular rounded bg-muted px-1">teamvelocity.config.json</code>
        </li>
        <li>
          2. Put a token in <code className="tabular rounded bg-muted px-1">.env</code>
        </li>
        <li>
          3. Run <code className="tabular rounded bg-muted px-1">bun run pull</code>, then refresh.
        </li>
      </ol>
    </div>
  );
}
