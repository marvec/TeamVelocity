# Design alternatives

> **Status:** all three (plus a dark twin of A, "Nightlight", and the original
> Solarized) are now built into the app as switchable themes — see the theme
> switcher in the dashboard header and the `[data-theme]` blocks in
> `src/theme/globals.css`. These mockups remain as the design reference.

Three static mockups of the dashboard, each a self-contained HTML file. Open
`index.html` (or any of the three directly) in a browser — no server needed.
Fonts load from Google Fonts; everything else is inline.

| File | Name | One line |
|---|---|---|
| `a-daylight.html` | **A · Daylight** | Clean white product UI, cool grey page, jewel-tone series. Instrument Sans. 12px cards, hairline borders, soft shadow. |
| `b-poster.html` | **B · Poster** | Swiss-poster: 2px black rules, warm white paper, flat 34px blocks, Archivo 800–900, yellow as the brand accent. |
| `c-sorbet.html` | **C · Sorbet** | Playful: peach-cream page, floating white cards, pill tabs/chips/stat rows, Sora, 20px radius, candy-bright marks. |

All three show the same state: team Aurora, "Last 3 months", week 2026/08/31
focused, Ada Lovelace selected. Data is copied from `public/data/sample/aurora`.
Each page ends with a **Design spec** strip listing its tokens (hex + OKLCH),
type, radii, and the concrete changes the app would need.

## What is common to all three

- **Same role → hue mapping**, so switching between them never re-teaches the
  legend: PRs **blue**, Commits **lime**, Comments **violet**, LOC+ **teal**,
  LOC− **orange**, Issues (PR-score chart only) **pink**. Bands are **red /
  yellow / green** fills with a darker `-ink` twin for text.
- The mapping was chosen by enumerating role assignments and keeping only those
  that pass the data-viz palette validator (colour-blind separation ≥ 8 ΔE on
  every adjacent pair in both stack orders, normal-vision floor, chroma floor,
  lightness band). Blue-next-to-violet and orange-next-to-lime — the naive
  picks — both fail deuteranopia, which is why commits is lime and comments is
  violet rather than the other way round.
- **Text never wears a band colour.** Velocity numbers are ink; the band shows
  as a filled chip (bright yellow chip, dark text) — that is what lets the
  yellow be a genuinely happy yellow without producing unreadable yellow text.
- **Focused week no longer dims the other 13 bars to 30%.** A tinted column
  marks the selection instead, so the whole chart stays saturated. This was a
  large part of why the current charts read as washed out.
- Velocity history: ink line, band-coloured dots with a surface ring, and
  translucent red/yellow/green **zones** behind the line instead of a
  gradient-coloured stroke.
- Chart hygiene from the dataviz skill: solid hairline gridlines (no dashes),
  2px surface gaps between stacked segments, rounded data-ends, bars ≤ 24px in
  A (B/C are deliberately chunkier), legends always present.

## Picking one

Say "A", "B" or "C" (or "B with A's fonts", etc.). Applying a design means:

1. Replace the `@theme` colour tokens in `src/theme/globals.css` with the
   `:root` block from the chosen file (names already match; six new tokens:
   `grid`, `selection`, `cat-issues`, `band-*-ink`).
2. Add the font `@import` and update `--font-sans` / `--font-mono` / `--radius-*`.
3. Component changes listed under "What changes in the app" in that file's spec
   strip — mostly: band chip component, ink-coloured numbers, selection column
   instead of opacity dimming, gridline/gap/radius tweaks in the Recharts
   components, card-title style.

## Regenerating

```
node docs/design-alternatives/_build.mjs
```

`_build.mjs` holds the data, the shared layout/chart code, and one
`tokens` + `css` block per design. Tweak a design there and re-run.
