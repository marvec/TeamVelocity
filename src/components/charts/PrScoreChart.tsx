import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScoredPr } from "../../../shared/schema/data";
import { formatScore } from "../../lib/format";
import { makeSegmentShape } from "./BarSegment";

interface Signal {
  key: keyof ScoredPr["breakdown"];
  label: string;
  colorVar: string;
}

const SIGNALS: Signal[] = [
  { key: "loc", label: "LOC", colorVar: "var(--color-cat-loc-add)" },
  { key: "reviewActivity", label: "Review", colorVar: "var(--color-cat-comments)" },
  { key: "participants", label: "Participants", colorVar: "var(--color-cat-commits)" },
  { key: "files", label: "Files", colorVar: "var(--color-cat-prs)" },
  { key: "commits", label: "Commits", colorVar: "var(--color-cat-loc-remove)" },
  { key: "linkedIssues", label: "Issues", colorVar: "var(--color-cat-issues)" },
];

const KEYS = SIGNALS.map((s) => s.key);
const SHAPES = Object.fromEntries(SIGNALS.map((s) => [s.key, makeSegmentShape(s.key, KEYS, "column")]));

interface PrDatum {
  x: string;
  title: string;
  repo: string;
  score: number;
  loc: number;
  reviewActivity: number;
  participants: number;
  files: number;
  commits: number;
  linkedIssues: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload?: PrDatum }[];
}

function PrTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="max-w-xs rounded-control border-(length:--border-w) border-border bg-card p-2.5 text-xs shadow-md">
      <div className="font-semibold text-heading">
        {d.repo} <span className="tabular">{d.x}</span>
      </div>
      <div className="mb-1 text-foreground-muted">{d.title}</div>
      <div className="tabular">score {formatScore(d.score)}</div>
      <table className="mt-1">
        <tbody>
          {SIGNALS.map((s) => (
            <tr key={s.key}>
              <td className="pr-2">
                <span className="mr-1.5 inline-block size-2 rounded-sm align-middle" style={{ backgroundColor: s.colorVar }} />
                {s.label}
              </td>
              <td className="tabular text-right">{d[s.key].toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrScoreLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
      {SIGNALS.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: s.colorVar }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function PrScoreChart({ prs, limit = 20 }: { prs: ScoredPr[]; limit?: number }) {
  const data: PrDatum[] = prs.slice(0, limit).map((p) => ({
    x: `#${String(p.number)}`,
    title: p.title,
    repo: p.repo.name,
    score: p.score,
    loc: p.breakdown.loc,
    reviewActivity: p.breakdown.reviewActivity,
    participants: p.breakdown.participants,
    files: p.breakdown.files,
    commits: p.breakdown.commits,
    linkedIssues: p.breakdown.linkedIssues,
  }));

  return (
    <div className="h-[260px] w-full" data-testid="pr-score-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} maxBarSize={24}>
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 10.5, fill: "var(--color-foreground-muted)" }}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={44}
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10.5, fill: "var(--color-foreground-muted)" }} width={38} />
          <Tooltip content={<PrTooltip />} cursor={{ fill: "var(--color-muted)", fillOpacity: 0.6 }} />
          {SIGNALS.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.colorVar} shape={SHAPES[s.key]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
