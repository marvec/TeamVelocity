// Generates the three static design-alternative mockups in this folder.
//   node docs/design-alternatives/_build.mjs
// Each output file is standalone: tokens (same names as @theme in
// src/theme/globals.css) + component CSS + inline charts drawn from the
// Aurora sample dataset. Edit a design's `tokens`/`css` below and re-run.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Sample data — Aurora, "Last 3 months", focused week 2026/08/31–09/06.
// Copied from public/data/sample/aurora (index.json + weeks/2026-08-31.json).
// ---------------------------------------------------------------------------
const DATA = {
  thresholds: { red: 40, green: 70 },
  focused: 13,
  // [label, velocity, band, prsMerged, commits, comments, locAdded, locRemoved]
  weeks: [
    ["06/01", 40, "red", 4, 14, 12, 869, 374],
    ["06/08", 51, "yellow", 6, 19, 9, 1237, 441],
    ["06/15", 25, "red", 4, 12, 6, 956, 266],
    ["06/22", 36, "red", 5, 9, 6, 777, 188],
    ["06/29", 0, "red", 1, 10, 5, 524, 199],
    ["07/06", 24, "red", 4, 15, 6, 678, 263],
    ["07/13", 58, "yellow", 5, 15, 7, 1052, 443],
    ["07/20", 100, "green", 8, 43, 22, 6375, 1844],
    ["07/27", 64, "yellow", 5, 22, 12, 859, 234],
    ["08/03", 78, "green", 5, 26, 13, 2426, 792],
    ["08/10", 0, "red", 0, 4, 1, 0, 0],
    ["08/17", 70, "yellow", 5, 19, 11, 2237, 882],
    ["08/24", 56, "yellow", 6, 20, 9, 1343, 384],
    ["08/31", 66, "yellow", 7, 22, 9, 1817, 644],
  ],
  // [number, repo, author, title, score, loc, review, participants, files, commits, issues]
  prs: [
    [29, "api", "Linus Nyman", "Wire up the velocity gauge (api)", 79, 18.3, 25, 11.7, 15, 9.2, 0],
    [30, "api", "Linus Nyman", "Fix PR scoring (api)", 63, 25, 5, 11.7, 6.8, 10, 5],
    [31, "api", "Margaret Park", "Optimize week bucketing (api)", 58, 15.8, 19.6, 11.7, 5, 2.7, 3.1],
    [28, "api", "Ada Lovelace", "Tidy up the drill-down (api)", 58, 23.4, 0, 20, 0, 9.2, 5],
    [44, "web", "Grace Hopper", "Tidy up the stacked bars (web)", 42, 0, 0, 20, 13.5, 8.3, 0],
    [34, "infra", "Ada Lovelace", "Harden week bucketing (infra)", 38, 6.8, 5, 11.7, 0, 9.2, 5],
    [43, "web", "Ada Lovelace", "Refactor the stacked bars (web)", 36, 14.8, 13.1, 0, 8.2, 0, 0],
  ],
  // [name, velocity, band, [prs, commits, comments, locAdd, locRem] velocity segments]
  members: [
    ["Ada Lovelace", 80, "green", [25.63, 16.41, 10.16, 19.13, 8.38]],
    ["Grace Hopper", 47, "yellow", [11.57, 8.27, 9.17, 13.39, 4.11]],
    ["Linus Nyman", 63, "yellow", [18.23, 11.53, 9.11, 19.54, 4.88]],
    ["Margaret Park", 71, "green", [16.16, 9.15, 16.16, 19.82, 9.22]],
  ],
  repos: [
    ["api", 70, "green", [23.09, 9.97, 13.96, 17.01, 6.07]],
    ["infra", 33, "red", [8.02, 8.05, 4.01, 10.99, 2.13]],
    ["web", 51, "yellow", [14.73, 11.48, 7.36, 12.28, 5.26]],
  ],
  adaPrs: [
    [28, "api", "Tidy up the drill-down (api)", 58],
    [34, "infra", "Harden week bucketing (infra)", 38],
    [43, "web", "Refactor the stacked bars (web)", 36],
  ],
};

// ---------------------------------------------------------------------------
// Colour helpers — hex → OKLCH (the app's tokens are OKLCH).
// ---------------------------------------------------------------------------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function hexToOklch(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(hex.slice(1 + i, 3 + i), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  if (C < 0.002) h = 0;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${h.toFixed(1)})`;
}

// Token names match @theme in src/theme/globals.css. New names are marked.
const TOKEN_ORDER = [
  ["background", "page"],
  ["surface", "surface"],
  ["card", "card"],
  ["muted", "muted"],
  ["border", "border"],
  ["grid", "grid", "new"],
  ["selection", "selection", "new"],
  ["ring", "ring"],
  ["foreground", "foreground"],
  ["foreground-muted", "foregroundMuted"],
  ["heading", "heading"],
  ["primary", "primary"],
  ["primary-foreground", "primaryForeground"],
  ["accent", "accent"],
  ["cat-prs", "prs"],
  ["cat-commits", "commits"],
  ["cat-comments", "comments"],
  ["cat-loc-add", "locAdd"],
  ["cat-loc-remove", "locRem"],
  ["cat-issues", "issues", "new"],
  ["band-red", "bandRed"],
  ["band-yellow", "bandYellow"],
  ["band-green", "bandGreen"],
  ["band-red-ink", "bandRedInk", "new"],
  ["band-yellow-ink", "bandYellowInk", "new"],
  ["band-green-ink", "bandGreenInk", "new"],
];

function tokenBlock(d) {
  const lines = TOKEN_ORDER.map(([name, key, flag]) => {
    const hex = d.colors[key];
    return `  --color-${name}: ${hexToOklch(hex)}; /* ${hex}${flag ? " · new" : ""} */`;
  });
  return `:root {
  /* === TOKENS — same names as @theme in src/theme/globals.css (OKLCH, hex in comment) === */
${lines.join("\n")}

  --font-sans: ${d.fonts.sans};
  --font-mono: ${d.fonts.mono};
  --font-display: ${d.fonts.display}; /* new: hero number + H1 */
  --radius-card: ${d.radius.card};
  --radius-control: ${d.radius.control};
  --shadow-card: ${d.shadow}; /* new */

  /* chart mark params (read by the inline chart code) */
  --bar-w: ${d.chart.barW};
  --bar-rx: ${d.chart.barRx};
  --line-w: ${d.chart.lineW};
}`;
}

// ---------------------------------------------------------------------------
// Base CSS shared by all three — layout mirrors the app's DOM. Everything
// references tokens; the per-design sheet below overrides the personality.
// ---------------------------------------------------------------------------
const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { color-scheme: light; }
body {
  margin: 0; background: var(--color-background); color: var(--color-foreground);
  font-family: var(--font-sans); font-size: 14px; line-height: 1.45;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
a { color: inherit; text-decoration: none; }
a:hover { text-decoration: underline; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
.tabular { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.shell { max-width: 72rem; margin: 0 auto; padding: 20px 16px 0; }
.muted { color: var(--color-foreground-muted); }
.ink { color: var(--color-heading); }

/* top bar */
.topbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.brand { display: flex; align-items: center; gap: 12px; }
h1 { margin: 0; font-size: 20px; font-weight: 700; color: var(--color-heading); }
h1 .muted { font-weight: 400; }
.controls { display: flex; align-items: center; gap: 8px; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px;
  border-radius: var(--radius-control); border: 1px solid var(--color-border); background: var(--color-surface);
  font-size: 14px; font-weight: 500; color: var(--color-foreground);
}
.btn.ghost { border-color: transparent; background: transparent; color: var(--color-foreground-muted); padding: 0 8px; }
.btn.icon { width: 32px; padding: 0; font-weight: 600; color: var(--color-foreground-muted); }
.btn.select { min-width: 160px; justify-content: space-between; }
.btn.select .caret { color: var(--color-foreground-muted); font-size: 11px; }

/* cards */
.card { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius-card); box-shadow: var(--shadow-card); margin-bottom: 16px; }
.card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 16px 16px 0; }
.card-head h2 { margin: 0; font-size: 14px; font-weight: 600; color: var(--color-heading); }
.card-body { padding: 16px; }
.card-head .right { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px 12px; }
.hint { font-size: 12px; color: var(--color-foreground-muted); }
.grid2 { display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 1100px) { .grid2 { grid-template-columns: 1fr 1fr; } }
.grid2 .card { margin-bottom: 0; }
h3.sub { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--color-foreground-muted); }

/* hero */
.hero { display: grid; gap: 16px; padding: 16px; grid-template-columns: 1fr; }
@media (min-width: 900px) { .hero { grid-template-columns: auto 1fr; } }
.gauge { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-width: 190px; }
.gauge-box { position: relative; width: 156px; height: 156px; }
.gauge-box svg { width: 100%; height: 100%; display: block; }
.gauge-text { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
.gauge-value { font-family: var(--font-display); font-size: 42px; font-weight: 700; line-height: 1; color: var(--color-heading); letter-spacing: -0.02em; }
.gauge-caption { margin-top: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-foreground-muted); }
.history { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.history .card-head { padding: 0; }
.chart { width: 100%; display: block; }
.chart text { font-family: var(--font-sans); fill: var(--color-foreground-muted); font-size: 11px; }
.chart .tick { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 10.5px; }
.chart .ylabel { fill: var(--color-foreground); font-size: 12px; }
.chart .grid { stroke: var(--color-grid); stroke-width: 1; }
.chart .axis { stroke: var(--color-border); stroke-width: 1; }
.chart .zone { fill-opacity: 0.11; }
.chart .zone.red { fill: var(--color-band-red); }
.chart .zone.yellow { fill: var(--color-band-yellow); fill-opacity: 0.18; }
.chart .zone.green { fill: var(--color-band-green); }
.chart .line { fill: none; stroke: var(--color-heading); stroke-width: var(--line-w); stroke-linejoin: round; stroke-linecap: round; }
.chart .dot { stroke: var(--color-card); stroke-width: 2; }
.chart .dot.red { fill: var(--color-band-red); } .chart .dot.yellow { fill: var(--color-band-yellow); } .chart .dot.green { fill: var(--color-band-green); }
.chart .endlabel { fill: var(--color-heading); font-weight: 700; font-size: 12px; }
.chart .seg { rx: var(--bar-rx); }
.chart .seg.prs { fill: var(--color-cat-prs); } .chart .seg.commits { fill: var(--color-cat-commits); }
.chart .seg.comments { fill: var(--color-cat-comments); } .chart .seg.locAdd { fill: var(--color-cat-loc-add); }
.chart .seg.locRem { fill: var(--color-cat-loc-remove); } .chart .seg.issues { fill: var(--color-cat-issues); }
.chart .sel { fill: var(--color-selection); }
.chart .xsel { fill: var(--color-heading); font-weight: 700; }
.chart .pill-bg.red { fill: var(--color-band-red); } .chart .pill-bg.yellow { fill: var(--color-band-yellow); } .chart .pill-bg.green { fill: var(--color-band-green); }
.chart .pill-txt { fill: var(--color-heading); font-family: var(--font-mono); font-weight: 700; font-size: 11px; }
.chart .marker { fill: var(--color-primary); }

/* legend + chips */
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 12px; color: var(--color-foreground-muted); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.sw.prs { background: var(--color-cat-prs); } .sw.commits { background: var(--color-cat-commits); } .sw.comments { background: var(--color-cat-comments); }
.sw.locAdd { background: var(--color-cat-loc-add); } .sw.locRem { background: var(--color-cat-loc-remove); } .sw.issues { background: var(--color-cat-issues); }
.sw.red { background: var(--color-band-red); } .sw.yellow { background: var(--color-band-yellow); } .sw.green { background: var(--color-band-green); }
.chip {
  display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px; border-radius: 999px;
  font-size: 11px; font-weight: 700; color: var(--color-heading); background: var(--color-muted); white-space: nowrap;
}
.chip .x { color: var(--color-foreground-muted); font-weight: 400; }
.chip.red { background: var(--color-band-red); } .chip.yellow { background: var(--color-band-yellow); } .chip.green { background: var(--color-band-green); }
.chip.band { text-transform: uppercase; letter-spacing: 0.06em; font-size: 10.5px; }
.chip.band .tabular { letter-spacing: 0; text-transform: none; }

/* stat row */
.stat { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-family: var(--font-mono); font-size: 13px; color: var(--color-foreground); }
.stat .dotsep { color: var(--color-border); }

/* PR table */
table.pr { width: 100%; border-collapse: collapse; font-size: 13px; }
table.pr th { text-align: left; padding: 6px 12px 8px 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-foreground-muted); border-bottom: 1px solid var(--color-border); }
table.pr th.r, table.pr td.r { text-align: right; padding-right: 0; }
table.pr td { padding: 7px 12px 7px 0; border-bottom: 1px solid var(--color-grid); vertical-align: middle; }
table.pr tr:last-child td { border-bottom: 0; }
table.pr td.repo { color: var(--color-foreground-muted); }
table.pr td.author { white-space: nowrap; }
table.pr td.num a { font-family: var(--font-mono); font-weight: 600; color: var(--color-primary); }
table.pr td.title a { color: var(--color-heading); }
.score { display: inline-flex; align-items: center; justify-content: flex-end; gap: 8px; }
.track { width: 64px; height: 6px; border-radius: 999px; background: var(--color-muted); overflow: hidden; }
.track i { display: block; height: 100%; border-radius: 999px; }
.track i.red { background: var(--color-band-red); } .track i.yellow { background: var(--color-band-yellow); } .track i.green { background: var(--color-band-green); }
.score b { font-family: var(--font-mono); font-weight: 600; width: 38px; text-align: right; color: var(--color-heading); }

/* member detail */
.detail { margin-top: 16px; padding: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-surface); }
.detail-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.detail-head .name { font-weight: 600; color: var(--color-heading); }
.detail-head .v { font-family: var(--font-mono); font-weight: 700; font-size: 15px; }
.detail-head .v.green { color: var(--color-band-green-ink); } .detail-head .v.yellow { color: var(--color-band-yellow-ink); } .detail-head .v.red { color: var(--color-band-red-ink); }
.tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--color-border); }
.tab { display: inline-flex; align-items: center; gap: 6px; margin-bottom: -1px; padding: 6px 10px; border-bottom: 2px solid transparent; font-size: 12px; font-weight: 500; color: var(--color-foreground-muted); }
.tab.on { color: var(--color-heading); border-bottom-color: var(--color-primary); }
.tab .n { font-family: var(--font-mono); font-size: 11px; padding: 0 6px; border-radius: 999px; background: var(--color-muted); color: var(--color-foreground); }
.rows { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 7px; font-size: 12px; }
.rows li { display: flex; align-items: center; gap: 8px; }
.tag { font-family: var(--font-mono); font-size: 11px; padding: 0 5px; border-radius: 4px; background: var(--color-muted); color: var(--color-foreground-muted); }
.rows .num { font-family: var(--font-mono); font-weight: 600; color: var(--color-primary); }
.rows .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-heading); }
.rows .score .track { width: 48px; }
.rows .score b { width: 32px; font-weight: 500; color: var(--color-foreground-muted); }
.note { margin: 10px 0 0; font-size: 12px; color: var(--color-foreground-muted); }

/* tooltip (static example) */
.tip { position: absolute; z-index: 2; padding: 8px 10px; border-radius: var(--radius-control); border: 1px solid var(--color-border); background: var(--color-card); box-shadow: 0 6px 20px rgb(0 0 0 / 0.10); font-size: 12px; pointer-events: none; }
.tip .t { font-weight: 600; color: var(--color-heading); margin-bottom: 4px; }
.tip table { border-collapse: collapse; margin-top: 4px; }
.tip td { padding: 1px 0; color: var(--color-foreground); }
.tip td.v { text-align: right; padding-left: 14px; font-family: var(--font-mono); }
.tip .sw { width: 8px; height: 8px; margin-right: 6px; vertical-align: 0; }
.chart-wrap { position: relative; }

footer { max-width: 72rem; margin: 0 auto; padding: 16px 16px 32px; text-align: center; font-size: 12px; color: var(--color-foreground-muted); }

/* ---- design spec strip (not part of the app) ---- */
.spec { border-top: 1px solid var(--color-border); background: var(--color-card); padding: 28px 16px 40px; }
.spec-in { max-width: 72rem; margin: 0 auto; }
.spec h2 { margin: 0 0 4px; font-size: 16px; color: var(--color-heading); }
.spec p.lead { margin: 0 0 18px; font-size: 13px; color: var(--color-foreground-muted); max-width: 70ch; }
.spec-grid { display: grid; gap: 20px 28px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.spec h4 { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-foreground-muted); }
.swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.swatch { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.swatch i { width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgb(0 0 0 / 0.08); flex: none; }
.swatch b { display: block; font-weight: 600; color: var(--color-heading); }
.swatch code { font-family: var(--font-mono); font-size: 11px; color: var(--color-foreground-muted); }
.spec ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--color-foreground); }
.spec li { margin-bottom: 4px; }
.spec li code { font-family: var(--font-mono); font-size: 12px; }
`;

// ---------------------------------------------------------------------------
// The three designs.
// ---------------------------------------------------------------------------
const DESIGNS = [
  {
    id: "a-daylight",
    letter: "A",
    name: "Daylight",
    tagline: "Clean white product UI, cool grey page, jewel-tone series. The quiet one that still pops.",
    favicon: "☀️",
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@400;600;700&display=swap",
    fonts: {
      sans: `"Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
      mono: `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`,
      display: `"Instrument Sans", ui-sans-serif, system-ui, sans-serif`,
    },
    radius: { card: "12px", control: "8px" },
    shadow: "0 1px 2px rgb(16 24 40 / 0.06), 0 1px 3px rgb(16 24 40 / 0.05)",
    chart: { barW: "24", barRx: "4", lineW: "2" },
    colors: {
      page: "#f2f4f7", surface: "#ffffff", card: "#ffffff", muted: "#eef1f5", border: "#dfe4ea", grid: "#edf0f4",
      selection: "#e3ecfd", ring: "#2563eb", foreground: "#1f2937", foregroundMuted: "#4b5563", heading: "#0b1220",
      primary: "#2563eb", primaryForeground: "#ffffff", accent: "#0d9488",
      prs: "#2563eb", commits: "#6fae0b", comments: "#7c3aed", locAdd: "#0d9488", locRem: "#ea580c", issues: "#db2777",
      bandRed: "#ef4444", bandYellow: "#facc15", bandGreen: "#22c55e",
      bandRedInk: "#b91c1c", bandYellowInk: "#a16207", bandGreenInk: "#15803d",
    },
    css: `
.card-head h2 { letter-spacing: -0.005em; }
.btn:hover { background: var(--color-muted); }
.btn.select { box-shadow: 0 1px 1px rgb(16 24 40 / 0.04); }
.gauge-value { letter-spacing: -0.03em; }
.tab.on { font-weight: 600; }
table.pr th { font-weight: 600; }
.chart .sel { fill-opacity: 0.9; }
`,
    notes: [
      "Series colours no longer dim to 30% when a week is focused — the focused week gets a tinted column instead, so the whole chart stays bright.",
      "Velocity numbers wear ink; the band shows as a filled chip (yellow chip, dark text) instead of yellow text.",
      "Card titles in sentence case, 14px/600 — the uppercase tracked titles go.",
      "Gridlines become solid hairlines; stacked segments get a 2px white gap; bars cap at 24px with rounded data-ends.",
    ],
  },
  {
    id: "b-poster",
    letter: "B",
    name: "Poster",
    tagline: "Swiss-poster energy: black rules, warm white paper, flat primary blocks, a heavyweight grotesk.",
    favicon: "🟨",
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,100,400..900;1,100,400..900&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap",
    fonts: {
      sans: `"Archivo", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
      mono: `"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`,
      display: `"Archivo", ui-sans-serif, system-ui, sans-serif`,
    },
    radius: { card: "4px", control: "3px" },
    shadow: "none",
    chart: { barW: "34", barRx: "0", lineW: "2.5" },
    colors: {
      page: "#f4f1e8", surface: "#ffffff", card: "#fffefa", muted: "#efece2", border: "#14110c", grid: "#e6e2d6",
      selection: "#ffe28a", ring: "#14110c", foreground: "#2b2620", foregroundMuted: "#5c554a", heading: "#14110c",
      primary: "#2450e0", primaryForeground: "#ffffff", accent: "#ffc800",
      prs: "#2450e0", commits: "#74b41c", comments: "#6d3fd6", locAdd: "#149c6a", locRem: "#f2541b", issues: "#d6248f",
      bandRed: "#e8322d", bandYellow: "#ffc800", bandGreen: "#22b14c",
      bandRedInk: "#b3211d", bandYellowInk: "#8a6100", bandGreenInk: "#167a33",
    },
    css: `
body { font-weight: 500; }
h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }
h1 .muted { font-weight: 500; }
h1 .hl { background: var(--color-accent); padding: 0 6px; margin-left: 2px; }
.card { border-width: 2px; }
.card-head h2 { font-size: 13px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
.btn { border: 2px solid var(--color-border); font-weight: 600; background: var(--color-card); }
.btn.ghost { border-color: transparent; font-weight: 600; }
.btn:hover { box-shadow: 3px 3px 0 var(--color-border); }
.gauge-value { font-weight: 900; font-size: 46px; letter-spacing: -0.03em; }
.gauge-caption { font-weight: 700; letter-spacing: 0.14em; }
.chip { border-radius: 3px; border: 1.5px solid var(--color-border); font-weight: 800; }
.chip:not(.red):not(.yellow):not(.green) { background: var(--color-card); }
.sw { border-radius: 1px; }
.legend { font-weight: 600; }
.tabs { gap: 0; border-bottom: 2px solid var(--color-border); }
.tab { border: 2px solid transparent; border-bottom: 0; margin-bottom: 0; padding: 5px 10px; font-weight: 700; }
.tab.on { border-color: var(--color-border); background: var(--color-heading); color: var(--color-card); }
.tab.on .n { background: rgb(255 255 255 / 0.18); color: var(--color-card); }
.tab .n { border-radius: 2px; }
.tag { border-radius: 2px; }
.track { border-radius: 0; background: var(--color-muted); border: 1px solid var(--color-border); height: 8px; }
.track i { border-radius: 0; }
.detail { border-width: 2px; }
table.pr th { color: var(--color-heading); font-weight: 800; border-bottom-width: 2px; border-bottom-color: var(--color-border); }
.chart .axis { stroke: var(--color-heading); stroke-width: 1.5; }
.chart .dot { stroke-width: 2; }
.chart .pill-bg { rx: 2; }
.chart .zone.yellow { fill-opacity: 0.22; }
.chart .sel { fill-opacity: 0.55; }
.tip { border-width: 2px; box-shadow: 4px 4px 0 var(--color-border); border-radius: 3px; }
.detail-head .v { font-weight: 800; }
footer { font-weight: 500; }
`,
    notes: [
      "2px ink borders replace shadows; corners go nearly square (4px cards, 3px controls).",
      "Archivo 800–900 for the H1 and hero number; card titles uppercase and tracked, in black.",
      "Yellow is the brand accent (H1 highlight, focused-week column) as well as the middle band — the band chip always carries its label so the two never collide.",
      "Bars are chunky 34px flat blocks with square ends and 2px paper gaps; the history line is 2.5px ink with band-coloured dots.",
    ],
  },
  {
    id: "c-sorbet",
    letter: "C",
    name: "Sorbet",
    tagline: "Playful and warm: peach-cream page, floating white cards, pill controls, candy-bright marks.",
    favicon: "🍧",
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap",
    fonts: {
      sans: `"Sora", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
      mono: `"DM Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`,
      display: `"Sora", ui-sans-serif, system-ui, sans-serif`,
    },
    radius: { card: "20px", control: "12px" },
    shadow: "0 8px 24px rgb(28 22 51 / 0.07), 0 1px 2px rgb(28 22 51 / 0.04)",
    chart: { barW: "28", barRx: "5", lineW: "2.25" },
    colors: {
      page: "#fff4e0", surface: "#fffaf2", card: "#ffffff", muted: "#f3eefb", border: "#ede6f7", grid: "#f1edf6",
      selection: "#ffe9c2", ring: "#1d6ff0", foreground: "#2d2748", foregroundMuted: "#5a536f", heading: "#1c1633",
      primary: "#1d6ff0", primaryForeground: "#ffffff", accent: "#e8339a",
      prs: "#1d6ff0", commits: "#7cb518", comments: "#7c3aed", locAdd: "#0a9c86", locRem: "#f2620c", issues: "#e8339a",
      bandRed: "#ff3b5c", bandYellow: "#ffd400", bandGreen: "#16c46b",
      bandRedInk: "#c1123a", bandYellowInk: "#946a00", bandGreenInk: "#0a7a45",
    },
    css: `
body { font-size: 13.5px; }
h1 { font-size: 21px; font-weight: 700; letter-spacing: -0.01em; }
.card { border: 0; }
.card-head h2 { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.btn { border: 0; background: var(--color-card); box-shadow: 0 2px 8px rgb(28 22 51 / 0.08); border-radius: 999px; font-weight: 600; }
.btn.ghost { box-shadow: none; background: transparent; }
.btn.icon { border-radius: 999px; }
.gauge-value { font-size: 44px; font-weight: 800; letter-spacing: -0.03em; }
.chip { font-weight: 700; height: 24px; padding: 0 11px; }
.chip.band { font-size: 11px; letter-spacing: 0.04em; }
.sw { border-radius: 999px; }
.legend { font-weight: 500; }
.tabs { border-bottom: 0; gap: 6px; background: var(--color-muted); border-radius: 999px; padding: 4px; width: max-content; max-width: 100%; }
.tab { border: 0; margin: 0; border-radius: 999px; padding: 5px 12px; font-weight: 600; }
.tab.on { background: var(--color-card); color: var(--color-heading); box-shadow: 0 1px 3px rgb(28 22 51 / 0.10); }
.tab.on .n { background: var(--color-primary); color: var(--color-primary-foreground); }
.tab .n { background: rgb(28 22 51 / 0.06); }
.tag { border-radius: 999px; padding: 0 7px; }
.track { height: 7px; }
.detail { border: 0; background: var(--color-surface); border-radius: 14px; padding: 14px; }
table.pr th { border-bottom: 0; padding-bottom: 4px; }
table.pr td { border-bottom-color: var(--color-grid); }
.chart .axis { stroke: var(--color-border); }
.chart .dot { r: 5; stroke-width: 2.5; }
.chart .zone.yellow { fill-opacity: 0.2; }
.chart .sel { fill-opacity: 0.9; }
.tip { border: 0; box-shadow: 0 10px 30px rgb(28 22 51 / 0.14); border-radius: 12px; }
.card-body { padding: 18px; }
.card-head { padding: 18px 18px 0; }
.hero { padding: 18px; }
.gauge-box::before { content: ""; position: absolute; inset: 24px; border-radius: 50%; background: var(--color-band-yellow); opacity: 0.16; }
.stat { gap: 6px; }
.stat > span:not(.dotsep) { background: var(--color-muted); padding: 2px 10px; border-radius: 999px; font-size: 12.5px; }
.stat .dotsep { display: none; }
.spec { border-top: 0; }
`,
    notes: [
      "No card borders — floating white cards on a peach-cream page with a soft lavender-grey shadow.",
      "Sora 700–800 for headings and the hero number; everything rounded (20px cards, pill buttons, pill tabs).",
      "Focused week highlighted with a warm cream column; band chips and score tracks are pills in the vivid band fills.",
      "Stat rows become pills; the gauge gets a soft disc in the band colour behind the arc.",
      "Series are the same six roles as A and B, tuned a touch warmer and brighter; lime sits at 2.5:1 on white, covered by the tooltip + PR table.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Inline chart code — plain SVG, reads its colours from the tokens via CSS classes.
// ---------------------------------------------------------------------------
const CHART_JS = `
const D = ${JSON.stringify(DATA)};
const CAT = ["prs", "commits", "comments", "locAdd", "locRem"];
const css = getComputedStyle(document.documentElement);
const P = { barW: +css.getPropertyValue("--bar-w") || 24, barRx: +css.getPropertyValue("--bar-rx") || 4 };
const GAP = 2; // surface gap between stacked segments
const fmt = (n) => new Intl.NumberFormat("en-US").format(Math.round(n));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Rect with only the "data end" corners rounded (top for columns, right for bars).
function endRect(x, y, w, h, rx, side, cls) {
  if (h <= 0 || w <= 0) return "";
  const r = Math.min(rx, side === "top" ? Math.min(w / 2, h) : Math.min(h / 2, w));
  if (r <= 0) return \`<rect class="seg \${cls}" x="\${x}" y="\${y}" width="\${w}" height="\${h}" style="rx:0"/>\`;
  let d;
  if (side === "top") d = \`M\${x},\${y + h} V\${y + r} Q\${x},\${y} \${x + r},\${y} H\${x + w - r} Q\${x + w},\${y} \${x + w},\${y + r} V\${y + h} Z\`;
  else d = \`M\${x},\${y} H\${x + w - r} Q\${x + w},\${y} \${x + w},\${y + r} V\${y + h - r} Q\${x + w},\${y + h} \${x + w - r},\${y + h} H\${x} Z\`;
  return \`<path class="seg \${cls}" d="\${d}"/>\`;
}
function plainRect(x, y, w, h, cls) {
  if (h <= 0 || w <= 0) return "";
  return \`<rect class="seg \${cls}" x="\${x}" y="\${y}" width="\${w}" height="\${h}" style="rx:0"/>\`;
}
function monotone(pts) {
  const n = pts.length; if (n < 2) return "";
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); t[i] = tau * a * m[i]; t[i + 1] = tau * b * m[i]; }
  }
  let d = \`M\${pts[0][0]},\${pts[0][1]}\`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = dx[i] / 3;
    d += \` C\${x0 + h},\${y0 + t[i] * h} \${x1 - h},\${y1 - t[i + 1] * h} \${x1},\${y1}\`;
  }
  return d;
}
function valuePill(x, y, band, text) {
  const w = 14 + text.length * 7.2;
  return \`<rect class="pill-bg \${band}" x="\${x}" y="\${y - 9}" width="\${w}" height="18" rx="9"/>\` +
    \`<text class="pill-txt" x="\${x + w / 2}" y="\${y + 4}" text-anchor="middle">\${text}</text>\`;
}

// --- gauge --------------------------------------------------------------
function gauge(el, value, thr) {
  const R = 63, SW = 13, START = 220, END = -40;
  const polar = (t) => { const a = ((START + ((END - START) * t) / 100) * Math.PI) / 180; return [78 + R * Math.cos(a), 78 - R * Math.sin(a)]; };
  const arc = (t0, t1) => { if (t1 <= t0) return ""; const [x0, y0] = polar(t0), [x1, y1] = polar(t1); const large = Math.abs(((END - START) * (t1 - t0)) / 100) > 180 ? 1 : 0; return \`M\${x0},\${y0} A\${R},\${R} 0 \${large} 1 \${x1},\${y1}\`; };
  const v = Math.max(0, Math.min(100, value));
  const segs = [["track", arc(0, 100)], ["red", arc(0, Math.min(v, thr.red))], ["yellow", arc(thr.red, Math.min(v, thr.green))], ["green", arc(thr.green, v)]].filter((s) => s[1]);
  el.innerHTML = \`<svg viewBox="0 0 156 156" aria-hidden="true">\` + segs.map(([c, d]) => \`<path d="\${d}" fill="none" stroke="\${c === "track" ? "var(--color-muted)" : "var(--color-band-" + c + ")"}" stroke-width="\${SW}" stroke-linecap="round"/>\`).join("") + \`</svg>\`;
}

// --- velocity history (line, band zones, band dots) -------------------------
function history(el, weeks, thr) {
  const W = el.clientWidth || 800, H = 150, ml = 34, mr = 28, mt = 10, mb = 22;
  const iw = W - ml - mr, ih = H - mt - mb;
  const x = (i) => ml + (i * iw) / (weeks.length - 1), y = (v) => mt + ih - (v / 100) * ih;
  let s = \`<svg class="chart" viewBox="0 0 \${W} \${H}" width="\${W}" height="\${H}">\`;
  s += \`<rect class="zone red" x="\${ml}" y="\${y(thr.red)}" width="\${iw}" height="\${y(0) - y(thr.red)}"/>\`;
  s += \`<rect class="zone yellow" x="\${ml}" y="\${y(thr.green)}" width="\${iw}" height="\${y(thr.red) - y(thr.green)}"/>\`;
  s += \`<rect class="zone green" x="\${ml}" y="\${y(100)}" width="\${iw}" height="\${y(thr.green) - y(100)}"/>\`;
  for (const v of [0, 25, 50, 75, 100]) s += \`<line class="grid" x1="\${ml}" x2="\${ml + iw}" y1="\${y(v)}" y2="\${y(v)}"/><text class="tick" x="\${ml - 6}" y="\${y(v) + 3.5}" text-anchor="end">\${v}</text>\`;
  const pts = weeks.map((w, i) => [x(i), y(w[1])]);
  s += \`<path class="line" d="\${monotone(pts)}"/>\`;
  weeks.forEach((w, i) => { s += \`<circle class="dot \${w[2]}" cx="\${x(i)}" cy="\${y(w[1])}" r="4"/>\`; });
  weeks.forEach((w, i) => { if (i % 2 === 0 || i === weeks.length - 1) s += \`<text class="tick" x="\${x(i)}" y="\${H - 6}" text-anchor="middle">\${w[0]}</text>\`; });
  const last = weeks[weeks.length - 1];
  s += \`<text class="endlabel" x="\${x(weeks.length - 1) + 9}" y="\${y(last[1]) + 4}">\${last[1]}</text>\`;
  el.innerHTML = s + "</svg>";
}

// --- weekly stacked columns ---------------------------------------------------
function weekly(el, weeks, focused) {
  const W = el.clientWidth || 1000, H = 280, ml = 38, mr = 8, mt = 12, mb = 24;
  const iw = W - ml - mr, ih = H - mt - mb;
  const stacks = weeks.map((w) => [w[3], w[4], w[5], w[6] / 100, w[7] / 100]);
  const max = Math.max(...stacks.map((s) => s.reduce((a, b) => a + b, 0)));
  const step = 40, top = Math.ceil(max / step) * step;
  const slot = iw / weeks.length, bw = Math.min(P.barW, slot * 0.8);
  const y = (v) => mt + ih - (v / top) * ih;
  let s = \`<svg class="chart" viewBox="0 0 \${W} \${H}" width="\${W}" height="\${H}">\`;
  if (focused >= 0) s += \`<rect class="sel" x="\${ml + focused * slot}" y="\${mt - 4}" width="\${slot}" height="\${ih + 4}" rx="6"/>\`;
  for (let v = 0; v <= top; v += step) s += \`<line class="grid" x1="\${ml}" x2="\${ml + iw}" y1="\${y(v)}" y2="\${y(v)}"/><text class="tick" x="\${ml - 6}" y="\${y(v) + 3.5}" text-anchor="end">\${v}</text>\`;
  s += \`<line class="axis" x1="\${ml}" x2="\${ml + iw}" y1="\${y(0)}" y2="\${y(0)}"/>\`;
  weeks.forEach((w, i) => {
    const cx = ml + i * slot + slot / 2, x0 = cx - bw / 2;
    let acc = 0; const parts = stacks[i].map((v, k) => [CAT[k], v]).filter((p) => p[1] > 0);
    parts.forEach(([cls, v], k) => {
      const yTop = y(acc + v), yBot = y(acc), isLast = k === parts.length - 1;
      const h = yBot - yTop - (isLast ? 0 : GAP);
      s += isLast ? endRect(x0, yTop, bw, h, P.barRx, "top", cls) : plainRect(x0, yTop, bw, h, cls);
      acc += v;
    });
    s += \`<text class="tick\${i === focused ? " xsel" : ""}" x="\${cx}" y="\${H - 7}" text-anchor="middle">\${w[0]}</text>\`;
  });
  el.innerHTML = s + "</svg>";
}

// --- PR relevance stacked columns ----------------------------------------------
function prScores(el, prs) {
  const W = el.clientWidth || 520, H = 260, ml = 38, mr = 8, mt = 12, mb = 26;
  const iw = W - ml - mr, ih = H - mt - mb;
  const SIG = ["locAdd", "comments", "commits", "prs", "locRem", "issues"]; // LOC, Review, Participants, Files, Commits, Issues
  const slot = iw / prs.length, bw = Math.min(P.barW, slot * 0.8);
  const y = (v) => mt + ih - (v / 100) * ih;
  let s = \`<svg class="chart" viewBox="0 0 \${W} \${H}" width="\${W}" height="\${H}">\`;
  for (const v of [0, 25, 50, 75, 100]) s += \`<line class="grid" x1="\${ml}" x2="\${ml + iw}" y1="\${y(v)}" y2="\${y(v)}"/><text class="tick" x="\${ml - 6}" y="\${y(v) + 3.5}" text-anchor="end">\${v}</text>\`;
  s += \`<line class="axis" x1="\${ml}" x2="\${ml + iw}" y1="\${y(0)}" y2="\${y(0)}"/>\`;
  prs.forEach((p, i) => {
    const cx = ml + i * slot + slot / 2, x0 = cx - bw / 2;
    let acc = 0; const parts = p.slice(5, 11).map((v, k) => [SIG[k], v]).filter((q) => q[1] > 0);
    parts.forEach(([cls, v], k) => {
      const yTop = y(acc + v), yBot = y(acc), isLast = k === parts.length - 1;
      const h = yBot - yTop - (isLast ? 0 : GAP);
      s += isLast ? endRect(x0, yTop, bw, h, P.barRx, "top", cls) : plainRect(x0, yTop, bw, h, cls);
      acc += v;
    });
    s += \`<text class="tick" x="\${cx}" y="\${H - 8}" text-anchor="middle">#\${p[0]}</text>\`;
  });
  el.innerHTML = s + "</svg>";
}

// --- horizontal velocity stacks (members, repos) -------------------------------
function hstack(el, rows, yWidth, selected) {
  const W = el.clientWidth || 520, rowH = 38, bh = 18, ml = yWidth, mr = 48, mt = 6, mb = 22;
  const H = mt + rows.length * rowH + mb, iw = W - ml - mr;
  const x = (v) => ml + (v / 100) * iw;
  let s = \`<svg class="chart" viewBox="0 0 \${W} \${H}" width="\${W}" height="\${H}">\`;
  if (selected >= 0) s += \`<rect class="sel" x="0" y="\${mt + selected * rowH}" width="\${W}" height="\${rowH}" rx="6"/>\`;
  for (const v of [0, 25, 50, 75, 100]) s += \`<line class="grid" x1="\${x(v)}" x2="\${x(v)}" y1="\${mt}" y2="\${mt + rows.length * rowH}"/><text class="tick" x="\${x(v)}" y="\${H - 5}" text-anchor="middle">\${v}</text>\`;
  rows.forEach((r, i) => {
    const cy = mt + i * rowH + rowH / 2, y0 = cy - bh / 2;
    s += \`<text class="ylabel\${i === selected ? " xsel" : ""}" x="\${ml - 10}" y="\${cy + 4}" text-anchor="end">\${esc(r[0])}</text>\`;
    let acc = 0; const parts = r[3].map((v, k) => [CAT[k], v]).filter((p) => p[1] > 0);
    parts.forEach(([cls, v], k) => {
      const xa = x(acc), xb = x(acc + v), isLast = k === parts.length - 1;
      const w = xb - xa - (isLast ? 0 : GAP);
      s += isLast ? endRect(xa, y0, w, bh, P.barRx, "right", cls) : plainRect(xa, y0, w, bh, cls);
      acc += v;
    });
    s += valuePill(x(acc) + 8, cy, r[2], String(r[1]));
  });
  el.innerHTML = s + "</svg>";
}

function render() {
  gauge(document.getElementById("gauge"), D.weeks[D.focused][1], D.thresholds);
  history(document.getElementById("history"), D.weeks, D.thresholds);
  weekly(document.getElementById("weekly"), D.weeks, D.focused);
  prScores(document.getElementById("prscores"), D.prs);
  hstack(document.getElementById("members"), D.members, 132, 0);
  hstack(document.getElementById("repos"), D.repos, 64, -1);
}
render();
let raf; addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); });
`;

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
const band = (b) => `<span class="chip band ${b}">${b} <span class="tabular">${b === "red" ? "&lt; 40" : b === "yellow" ? "40–70" : "≥ 70"}</span></span>`;
const catLegend = () =>
  `<div class="legend"><span><i class="sw prs"></i>PRs merged</span><span><i class="sw commits"></i>Commits</span><span><i class="sw comments"></i>Comments</span><span><i class="sw locAdd"></i>LOC+ (×100)</span><span><i class="sw locRem"></i>LOC− (×100)</span></div>`;
const sigLegend = () =>
  `<div class="legend"><span><i class="sw locAdd"></i>LOC</span><span><i class="sw comments"></i>Review</span><span><i class="sw commits"></i>Participants</span><span><i class="sw prs"></i>Files</span><span><i class="sw locRem"></i>Commits</span><span><i class="sw issues"></i>Issues</span></div>`;
const bandOf = (s) => (s < 40 ? "red" : s < 70 ? "yellow" : "green");
const scoreCell = (s) => `<span class="score"><span class="track"><i class="${bandOf(s)}" style="width:${s}%"></i></span><b>${s}%</b></span>`;
const stat = (prs, commits, comments, add, rem) =>
  `<div class="stat"><span>${prs} PRs</span><span class="dotsep">·</span><span>${commits} commits</span><span class="dotsep">·</span><span>${comments} comments</span><span class="dotsep">·</span><span>${new Intl.NumberFormat("en-US").format(add + rem)} LOC +${new Intl.NumberFormat("en-US").format(add)}/−${rem}</span></div>`;

function swatch(hex, label) {
  return `<div class="swatch"><i style="background:${hex}"></i><span><b>${label}</b><code>${hex} · ${hexToOklch(hex)}</code></span></div>`;
}

function page(d) {
  const c = d.colors;
  const prRows = DATA.prs
    .map(
      ([n, repo, author, title, score]) =>
        `<tr><td class="repo">${repo}</td><td class="num"><a href="#">#${n}</a></td><td class="author">${author}</td><td class="title"><a href="#">${title}</a></td><td class="r">${scoreCell(score)}</td></tr>`,
    )
    .join("");
  const adaRows = DATA.adaPrs
    .map(([n, repo, title, score]) => `<li><span class="tag">${repo}</span><a class="num" href="#">#${n}</a><a class="t" href="#">${title}</a>${scoreCell(score)}</li>`)
    .join("");
  const teamName = d.id === "b-poster" ? `<span class="hl">Aurora</span>` : `Aurora`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TeamVelocity · ${d.letter} · ${d.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${d.fontsHref}">
<style>
${tokenBlock(d)}
${BASE_CSS}
/* === ${d.letter} · ${d.name} — personality overrides === */
${d.css}
</style>
</head>
<body>
<div class="shell">
  <header class="topbar">
    <div class="brand">
      <button class="btn ghost">← Teams</button>
      <h1><span class="muted">Team:</span> ${teamName}</h1>
    </div>
    <div class="controls">
      <button class="btn select">Last 3 months <span class="caret">▾</span></button>
      <button class="btn icon" aria-label="How the scores work">?</button>
    </div>
  </header>

  <section class="card hero">
    <div class="gauge">
      <div class="gauge-box"><div id="gauge"></div><div class="gauge-text"><div class="gauge-value">66</div><div class="gauge-caption">velocity</div></div></div>
      ${band("yellow")}
    </div>
    <div class="history">
      <div class="card-head"><h2>Velocity history</h2><div class="legend tabular"><span><i class="sw red"></i>&lt; 40</span><span><i class="sw yellow"></i>40–70</span><span><i class="sw green"></i>≥ 70</span></div></div>
      <div id="history" class="chart-wrap"></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Weekly activity</h2><div class="right"><span class="hint">Click a week to focus it · again to deselect</span>${catLegend()}</div></div>
    <div class="card-body chart-wrap">
      <div id="weekly"></div>
      <div class="tip" style="left: 73%; top: 6px;"><div class="t">2026/08/03–08/09</div>${band("green")}<table><tr><td><i class="sw prs"></i>PRs</td><td class="v">5</td></tr><tr><td><i class="sw commits"></i>Commits</td><td class="v">26</td></tr><tr><td><i class="sw comments"></i>Comments</td><td class="v">13</td></tr><tr><td><i class="sw locAdd"></i>LOC+</td><td class="v">+2,426</td></tr><tr><td><i class="sw locRem"></i>LOC−</td><td class="v">−792</td></tr></table></div>
    </div>
  </section>

  <div class="grid2">
    <section class="card">
      <div class="card-head"><h2>Week detail · 2026/08/31–09/06</h2><span class="chip">This week <span class="x">✕</span></span></div>
      <div class="card-body">
        ${stat(7, 22, 9, 1817, 644)}
        <p class="note" style="margin:8px 0 10px">The week’s pull requests, ranked by relevance — the raw material for a status report.</p>
        <table class="pr"><thead><tr><th>Repo</th><th>PR</th><th>Author</th><th>Title</th><th class="r">Score ▾</th></tr></thead><tbody>${prRows}</tbody></table>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>PR relevance</h2>${sigLegend()}</div>
      <div class="card-body"><div id="prscores"></div></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Velocity of individuals</h2><div class="right"><span class="chip">Ada Lovelace <span class="x">✕</span></span>${catLegend()}</div></div>
      <div class="card-body">
        <div id="members"></div>
        <div class="detail">
          <div class="detail-head"><span class="name">Ada Lovelace</span><span class="v green">80</span><span class="hint">velocity</span>${band("green")}</div>
          <div class="tabs"><span class="tab on">PRs <span class="n">3</span></span><span class="tab">Commits <span class="n">11</span></span><span class="tab">Comments <span class="n">2</span></span><span class="tab">LOC <span class="n">1,034</span></span></div>
          <ul class="rows">${adaRows}</ul>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Team detail</h2></div>
      <div class="card-body">
        ${stat(7, 22, 9, 1817, 644)}
        <h3 class="sub" style="margin-top:18px">Velocity by repo</h3>
        <div id="repos"></div>
      </div>
    </section>
  </div>
</div>
<footer>TeamVelocity · local-first GitHub analytics · describes contribution shape, not individual worth</footer>

<aside class="spec">
  <div class="spec-in">
    <h2>Design spec — ${d.letter} · ${d.name}</h2>
    <p class="lead">${d.tagline} Every colour on this page comes from the <code>:root</code> token block at the top of the file; the names match <code>@theme</code> in <code>src/theme/globals.css</code>, so applying this design is a token swap plus the notes below.</p>
    <div class="spec-grid">
      <div><h4>Series (stack order)</h4><div class="swatches">${swatch(c.prs, "PRs merged")}${swatch(c.commits, "Commits")}${swatch(c.comments, "Comments")}${swatch(c.locAdd, "LOC+")}${swatch(c.locRem, "LOC−")}${swatch(c.issues, "Issues (PR score only)")}</div></div>
      <div><h4>Velocity bands · fill + text ink</h4><div class="swatches">${swatch(c.bandRed, "Red fill")}${swatch(c.bandRedInk, "Red ink")}${swatch(c.bandYellow, "Yellow fill")}${swatch(c.bandYellowInk, "Yellow ink")}${swatch(c.bandGreen, "Green fill")}${swatch(c.bandGreenInk, "Green ink")}</div></div>
      <div><h4>Surfaces &amp; ink</h4><div class="swatches">${swatch(c.page, "Page")}${swatch(c.card, "Card")}${swatch(c.muted, "Muted")}${swatch(c.border, "Border")}${swatch(c.heading, "Heading")}${swatch(c.foreground, "Body")}${swatch(c.foregroundMuted, "Muted text")}${swatch(c.primary, "Primary")}</div></div>
      <div><h4>Type &amp; shape</h4><ul><li>Sans: <code>${d.fonts.sans.split(",")[0].replace(/"/g, "")}</code> · Mono: <code>${d.fonts.mono.split(",")[0].replace(/"/g, "")}</code></li><li>Radius: cards ${d.radius.card}, controls ${d.radius.control}</li><li>Card shadow: <code>${d.shadow}</code></li><li>Bars ${d.chart.barW}px, data-end radius ${d.chart.barRx}px, line ${d.chart.lineW}px</li></ul></div>
      <div><h4>What changes in the app</h4><ul>${d.notes.map((n) => `<li>${n}</li>`).join("")}</ul></div>
    </div>
  </div>
</aside>

<script>
${CHART_JS}
</script>
</body>
</html>
`;
}

for (const d of DESIGNS) {
  const file = join(OUT, `${d.id}.html`);
  writeFileSync(file, page(d));
  console.log("wrote", file);
}

// Index page: one card per design with its palette strip.
const strip = (c) =>
  ["prs", "commits", "comments", "locAdd", "locRem", "issues", "bandRed", "bandYellow", "bandGreen"]
    .map((k) => `<i style="background:${c[k]}"></i>`)
    .join("");
const indexHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>TeamVelocity · design alternatives</title>
<style>
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f5f5f4; color: #1c1917; }
  main { max-width: 64rem; margin: 0 auto; padding: 48px 20px 64px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  p.lead { margin: 0 0 28px; color: #57534e; max-width: 64ch; line-height: 1.5; }
  .cards { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  a.card { display: block; background: #fff; border: 1px solid #e7e5e4; border-radius: 14px; padding: 18px; color: inherit; text-decoration: none; box-shadow: 0 1px 2px rgb(0 0 0 / 0.04); }
  a.card:hover { border-color: #a8a29e; }
  .k { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; color: #78716c; }
  h2 { margin: 2px 0 6px; font-size: 18px; }
  .card p { margin: 0 0 14px; font-size: 13.5px; line-height: 1.5; color: #44403c; }
  .strip { display: flex; gap: 4px; } .strip i { flex: 1; height: 22px; border-radius: 5px; }
  .meta { margin-top: 12px; font-size: 12px; color: #78716c; }
</style></head>
<body><main>
  <h1>TeamVelocity — three design alternatives</h1>
  <p class="lead">Static mockups of the dashboard (Aurora sample, week 2026/08/31 focused). Each page ends with a design-spec strip: tokens, type, radii, and what would change in the app. Series and band colours were checked with the data-viz palette validator (colour-blind separation, chroma, contrast).</p>
  <div class="cards">
    ${DESIGNS.map(
      (d) => `<a class="card" href="./${d.id}.html"><div class="k">${d.letter}</div><h2>${d.name}</h2><p>${d.tagline}</p><div class="strip">${strip(d.colors)}</div><div class="meta">${d.fonts.sans.split(",")[0].replace(/"/g, "")} · cards ${d.radius.card}</div></a>`,
    ).join("\n    ")}
  </div>
</main></body></html>
`;
writeFileSync(join(OUT, "index.html"), indexHtml);
console.log("wrote", join(OUT, "index.html"));
