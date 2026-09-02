import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import type { VelocityBand } from "../../../shared/types";
import { bandTextClass, bandVar, formatVelocity } from "../../lib/format";
import { cn } from "../../lib/cn";

export function VelocityGauge({
  value,
  band,
  warmingUp = false,
  caption = "velocity",
}: {
  value: number;
  band: VelocityBand;
  warmingUp?: boolean;
  caption?: string;
}) {
  const data = [{ name: "velocity", value }];
  return (
    <div className="relative h-[150px] w-[150px]" data-testid="velocity-gauge" data-velocity={formatVelocity(value)} data-band={band}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          startAngle={220}
          endAngle={-40}
          innerRadius="74%"
          outerRadius="100%"
          barSize={12}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background dataKey="value" cornerRadius={8} fill={bandVar(band)} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("tabular text-4xl font-bold leading-none", bandTextClass(band))}>
          {formatVelocity(value)}
        </span>
        <span className="mt-1 text-xs uppercase tracking-wide text-foreground-muted">{caption}</span>
        {warmingUp && <span className="mt-0.5 text-xs text-band-yellow">warming up</span>}
      </div>
    </div>
  );
}
