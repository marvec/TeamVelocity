import { Popover } from "@base-ui/react/popover";

const TRIGGER_CLASS =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-control border border-border bg-surface text-sm font-semibold text-foreground-muted hover:bg-muted hover:text-foreground data-[popup-open]:border-primary data-[popup-open]:text-foreground";

/** A "?" trigger that opens a plain-language explainer for the two 0–100 scores. */
export function ScoreHelp() {
  return (
    <Popover.Root>
      <Popover.Trigger className={TRIGGER_CLASS} aria-label="How the scores work">
        ?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end">
          <Popover.Popup className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-card p-4 text-xs leading-relaxed shadow-md outline-none">
            <h3 className="mb-2 text-sm font-semibold text-heading">How the scores work</h3>

            <div className="space-y-3">
              <section>
                <div className="mb-0.5 font-semibold text-foreground">Velocity · 0–100</div>
                <p className="text-foreground-muted">
                  A team&rsquo;s or person&rsquo;s <span className="font-semibold text-foreground">weekly rhythm</span>.
                  Each week&rsquo;s activity — merged &amp; opened PRs, review activity, commits, and LOC (log-dampened
                  so one burst can&rsquo;t dominate) — is scored against that same team&rsquo;s / person&rsquo;s own
                  trailing 12-week baseline. A normal week sits near <span className="font-semibold text-foreground">50</span>;
                  busier climbs toward 100, quieter falls toward 0. Bands:{" "}
                  <span className="font-semibold text-band-red">red &lt;40</span>,{" "}
                  <span className="font-semibold text-band-yellow">yellow &lt;70</span>,{" "}
                  <span className="font-semibold text-band-green">green ≥70</span>. It reflects &ldquo;busier or quieter
                  than usual,&rdquo; not &ldquo;good vs bad.&rdquo;
                </p>
              </section>

              <section>
                <div className="mb-0.5 font-semibold text-foreground">PR score (relevance) · 0–100</div>
                <p className="text-foreground-muted">
                  Per pull request —{" "}
                  <span className="font-semibold text-foreground">which PRs are worth a status-report mention</span>.
                  Ranks each PR by LOC, files, review activity, participants, commits, and linked issues, relative to
                  the other PRs in the <span className="font-semibold text-foreground">same week</span>. In the PR
                  relevance chart the bar height is the score and the colored segments show what drove it.
                </p>
              </section>

              <p className="text-foreground-muted">
                The two are independent: a PR&rsquo;s relevance never feeds velocity, and velocity never uses per-PR
                scores.
              </p>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
