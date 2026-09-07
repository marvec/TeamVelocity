import { Popover } from "@base-ui/react/popover";
import type { VelocityWeights } from "../../shared/types";
import { DEFAULT_PR_SCORE_WEIGHTS } from "../../shared/aggregate/pr-score";

const TRIGGER_CLASS =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-control border-(length:--border-w) border-border bg-surface text-sm font-semibold text-foreground-muted hover:bg-muted hover:text-foreground data-[popup-open]:border-primary data-[popup-open]:text-foreground";
const FORMULA_CLASS =
  "tabular mt-1.5 overflow-x-auto whitespace-pre rounded-control border-(length:--border-w) border-border bg-surface p-2 font-mono text-xs leading-snug text-foreground";

function n(x: number): string {
  return String(x);
}

/** A "?" trigger that opens a plain-language + formula explainer for the two 0–100 scores. */
export function ScoreHelp({ velocityWeights: w }: { velocityWeights: VelocityWeights }) {
  const pr = DEFAULT_PR_SCORE_WEIGHTS;
  const velocityFormula =
    `raw = ${n(w.wPR)}·ln(1+merged) + ${n(w.wOpen)}·ln(1+opened)\n` +
    `    + ${n(w.wReview)}·ln(1+reviews) + ${n(w.wCommit)}·ln(1+commits)\n` +
    `    + ${n(w.wLoc)}·ln(1+LOC)\n` +
    `velocity = clamp( 50 + 20·z, 0, 100 )\n` +
    `  z = (raw − med₁₂) / (1.4826 · MAD₁₂)`;
  const scoreFormula =
    `sᵢ    = ln(1 + valueᵢ)\n` +
    `nᵢ    = (sᵢ − minᵢ) / (maxᵢ − minᵢ)\n` +
    `score = 100 · Σ wᵢ·nᵢ / Σ wᵢ`;

  return (
    <Popover.Root>
      <Popover.Trigger className={TRIGGER_CLASS} aria-label="How the scores work">
        ?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end">
          <Popover.Popup className="z-50 max-h-[80vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-card border-(length:--border-w) border-border bg-card p-4 text-xs leading-relaxed shadow-md outline-none">
            <h3 className="mb-2 text-sm font-semibold text-heading">How the scores work</h3>

            <div className="space-y-3">
              <section>
                <div className="mb-0.5 font-semibold text-foreground">Velocity · 0–100</div>
                <p className="text-foreground-muted">
                  A team&rsquo;s or person&rsquo;s <span className="font-semibold text-foreground">weekly rhythm</span>.
                  Each week&rsquo;s activity (log-dampened so one burst can&rsquo;t dominate) is scored against that same
                  team&rsquo;s / person&rsquo;s own trailing 12-week baseline. A normal week sits near{" "}
                  <span className="font-semibold text-foreground">50</span>; busier climbs toward 100, quieter falls
                  toward 0. Bands: <span className="font-semibold text-band-red-ink">red &lt;{n(40)}</span>,{" "}
                  <span className="font-semibold text-band-yellow-ink">yellow &lt;{n(70)}</span>,{" "}
                  <span className="font-semibold text-band-green-ink">green ≥{n(70)}</span>.
                </p>
                <pre className={FORMULA_CLASS}>{velocityFormula}</pre>
                <p className="mt-1 text-foreground-muted">
                  <span className="font-mono">med</span> / <span className="font-mono">MAD</span> = median &amp; median
                  absolute deviation of the raw signal over the last 12 weeks (a robust, outlier-resistant baseline).
                </p>
              </section>

              <section>
                <div className="mb-0.5 font-semibold text-foreground">PR score (relevance) · 0–100</div>
                <p className="text-foreground-muted">
                  Per pull request —{" "}
                  <span className="font-semibold text-foreground">which PRs are worth a status-report mention</span>.
                  Each signal is log-dampened, min-max normalized against the other PRs in the{" "}
                  <span className="font-semibold text-foreground">same week</span>, then weighted. The bar height is the
                  score; the segments are the weighted parts (they sum to it).
                </p>
                <pre className={FORMULA_CLASS}>{scoreFormula}</pre>
                <p className="mt-1 text-foreground-muted">
                  <span className="font-mono">min</span> / <span className="font-mono">max</span> are per signal
                  across the week&rsquo;s PRs. Weights <span className="font-mono">wᵢ</span>: LOC {n(pr.loc)}, review{" "}
                  {n(pr.reviewActivity)}, participants {n(pr.participants)}, files {n(pr.files)}, commits{" "}
                  {n(pr.commits)}, linked issues {n(pr.linkedIssues)}.
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
