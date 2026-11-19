/**
 * Pure serializers that turn a drill-down section's data into clipboard content:
 * an HTML fragment (semantic markup, working links, no styles) plus a Markdown
 * plain-text twin. They read the same props the sections render from, never the
 * DOM, so they are unit-testable and ignore charts / sort arrows / sr-only text.
 */

import type { CommentRow, CommitRow, ScoredPr, TotalsData, WeekDetail } from "../../shared/schema/data";
import { formatLoc, formatNumber, formatScore, formatVelocity } from "./format";
import { type Scope, repoRefKey } from "./selectors";

/** How each comment kind is labelled, in the app (ContributionTabs) and in copies. */
export const COMMENT_LABEL: Record<CommentRow["kind"], string> = {
  review: "review comment",
  review_summary: "review",
  issue: "comment",
};

export interface CopyContent {
  html: string;
  markdown: string;
}


// ---------------------------------------------------------------------------
// Escaping primitives

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Markdown-safe inline text: single line, and `\`, `[`, `]`, `|` cannot break links or tables. */
function mdText(s: string): string {
  return s
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\|/g, "\\|");
}

/** Markdown link destination: percent-encode the characters that would end or break it. */
function mdUrl(url: string): string {
  return url.replace(/[\s()<>"|]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

/** Only http(s) URLs become links; anything else (e.g. `javascript:`) degrades to plain text. */
function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// ---------------------------------------------------------------------------
// Dual-format building blocks: each holds the same content in both formats.

interface Fragment {
  html: string;
  md: string;
}

function text(s: string): Fragment {
  return { html: escapeHtml(s), md: mdText(s) };
}

function link(label: string, url: string): Fragment {
  if (!isSafeUrl(url)) return text(label);
  return {
    html: `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`,
    md: `[${mdText(label)}](${mdUrl(url)})`,
  };
}

function join(parts: Fragment[], sep: string): Fragment {
  return { html: parts.map((p) => p.html).join(escapeHtml(sep)), md: parts.map((p) => p.md).join(mdText(sep)) };
}

function heading(level: 2 | 3, content: Fragment): CopyContent {
  return {
    html: `<h${String(level)}>${content.html}</h${String(level)}>`,
    markdown: `${"#".repeat(level)} ${content.md}`,
  };
}

function paragraph(content: Fragment): CopyContent {
  return { html: `<p>${content.html}</p>`, markdown: content.md };
}

/** A bold run-in label for a sub-list (constant text only — it is not escaped for `*`). */
function label(s: string): CopyContent {
  return { html: `<p><strong>${escapeHtml(s)}</strong></p>`, markdown: `**${mdText(s)}**` };
}

function table(headers: string[], rows: Fragment[][]): CopyContent {
  const head = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c.html}</td>`).join("")}</tr>`).join("\n");
  const mdRow = (cells: string[]): string => `| ${cells.join(" | ")} |`;
  return {
    html: `<table>\n${head}\n<tbody>\n${body}\n</tbody>\n</table>`,
    markdown: [
      mdRow(headers.map(mdText)),
      mdRow(headers.map(() => "---")),
      ...rows.map((r) => mdRow(r.map((c) => c.md))),
    ].join("\n"),
  };
}

function list(items: Fragment[]): CopyContent {
  return {
    html: `<ul>\n${items.map((i) => `<li>${i.html}</li>`).join("\n")}\n</ul>`,
    markdown: items.map((i) => `- ${i.md}`).join("\n"),
  };
}

function concat(blocks: CopyContent[]): CopyContent {
  return {
    html: blocks.map((b) => b.html).join("\n"),
    markdown: blocks.map((b) => b.markdown).join("\n\n"),
  };
}

// ---------------------------------------------------------------------------
// Shared section pieces

/** Same wording as StatRow: "3 PRs · 48 commits · 15 comments · 358 LOC +112/−246". */
function totalsLine(t: TotalsData): string {
  return [
    `${formatNumber(t.prsMerged)} PRs`,
    `${formatNumber(t.commits)} commits`,
    `${formatNumber(t.comments)} comments`,
    formatLoc(t.locAdded, t.locRemoved),
  ].join(" · ");
}

function byScoreDesc(prs: ScoredPr[]): ScoredPr[] {
  return [...prs].sort((a, b) => b.score - a.score);
}

function authorOf(pr: ScoredPr): string {
  return pr.authorName ?? pr.authorHandle;
}

/** PR table in relevance order (KTD3), the copy twin of PrTable. */
function prTable(prs: ScoredPr[], showAuthor: boolean): CopyContent {
  if (prs.length === 0) return paragraph(text("No pull requests in this selection."));
  const headers = ["Repo", "PR", "Title", ...(showAuthor ? ["Author"] : []), "State", "Score"];
  const rows = byScoreDesc(prs).map((pr) => [
    text(pr.repo.name),
    link(`#${String(pr.number)}`, pr.url),
    link(pr.title, pr.url),
    ...(showAuthor ? [text(authorOf(pr))] : []),
    text(pr.state),
    text(formatScore(pr.score)),
  ]);
  return table(headers, rows);
}

// ---------------------------------------------------------------------------
// Public serializers — one per copyable section.

/** Week detail: heading with the week label, totals line, PR table by score. */
export function copyWeekDetail(week: WeekDetail): CopyContent {
  return concat([
    heading(2, text(`Week detail · ${week.label}`)),
    paragraph(text(totalsLine(week.totals))),
    prTable(week.prs, true),
  ]);
}

/** Velocity of individuals: one row per member, velocity rounded as in the UI. */
export function copyMembers(week: WeekDetail): CopyContent {
  const head = heading(2, text(`Velocity of individuals · ${week.label}`));
  if (week.members.length === 0) return concat([head, paragraph(text("No members in this selection."))]);
  const rows = week.members.map((m) => [
    text(m.name),
    text(String(formatVelocity(m.velocity))),
    text(m.velocityBand),
    text(formatNumber(m.totals.prsMerged)),
    text(formatNumber(m.totals.commits)),
    text(formatNumber(m.totals.comments)),
    text(formatNumber(m.totals.locAdded)),
    text(formatNumber(m.totals.locRemoved)),
  ]);
  return concat([
    head,
    table(["Member", "Velocity", "Band", "PRs", "Commits", "Comments", "LOC +", "LOC −"], rows),
  ]);
}

export interface PersonDetailCopyInput {
  /** The member or team scope the section renders (from `memberScope` / `teamScope`). */
  scope: Scope;
  /** True when a member is focused; false for the whole team. */
  isMember: boolean;
  /** `owner/name` key of the selected repo (`repoRefKey`), if any. */
  selectedRepo?: string;
}

function repoPrList(prs: ScoredPr[], showAuthor: boolean): CopyContent {
  if (prs.length === 0) return paragraph(text("No pull requests in this repo."));
  return list(
    byScoreDesc(prs).map((pr) =>
      join(
        [
          link(`#${String(pr.number)}`, pr.url),
          link(pr.title, pr.url),
          ...(showAuthor ? [text(authorOf(pr))] : []),
          text(pr.state),
          text(formatScore(pr.score)),
        ],
        " · ",
      ),
    ),
  );
}

function commitList(commits: CommitRow[], showAuthor: boolean): CopyContent {
  if (commits.length === 0) return paragraph(text("No commits in this repo."));
  return list(
    commits.map((c) =>
      join(
        [text(c.committedAt.slice(0, 10)), link(c.sha.slice(0, 7), c.url), ...(showAuthor ? [text(c.authorHandle)] : [])],
        " · ",
      ),
    ),
  );
}

function commentList(comments: CommentRow[]): CopyContent {
  if (comments.length === 0) return paragraph(text("No comments in this repo."));
  return list(
    comments.map((c) => {
      const kindLabel = COMMENT_LABEL[c.kind] + (c.prNumber !== null ? ` on #${String(c.prNumber)}` : "");
      return join([text(c.createdAt.slice(0, 10)), link(kindLabel, c.url)], " · ");
    }),
  );
}

/**
 * Person detail: member name (or "Team detail"), velocity + totals, the member's
 * PRs, a per-repo table with repo links, and — when a repo is selected — that
 * repo's PRs, commits, and comments with their links.
 */
export function copyPersonDetail({ scope, isMember, selectedRepo }: PersonDetailCopyInput): CopyContent {
  const blocks: CopyContent[] = [heading(2, text(isMember ? scope.name : "Team detail"))];

  if (isMember && scope.band) {
    blocks.push(paragraph(text(`Velocity: ${String(formatVelocity(scope.velocity ?? 0))} (${scope.band})`)));
  }
  blocks.push(paragraph(text(totalsLine(scope.totals))));

  if (isMember) {
    blocks.push(heading(3, text("Pull requests")), prTable(scope.prs, false));
  }

  blocks.push(heading(3, text("Velocity by repo")));
  if (scope.repos.length === 0) {
    blocks.push(paragraph(text("No repo activity in this selection.")));
  } else {
    blocks.push(
      table(
        ["Repo", "Velocity", "Band", "PRs", "Commits", "Comments", "LOC +", "LOC −"],
        scope.repos.map((rt) => [
          link(repoRefKey(rt.repo), rt.repo.url),
          text(String(formatVelocity(rt.velocity))),
          text(rt.velocityBand),
          text(formatNumber(rt.totals.prsMerged)),
          text(formatNumber(rt.totals.commits)),
          text(formatNumber(rt.totals.comments)),
          text(formatNumber(rt.totals.locAdded)),
          text(formatNumber(rt.totals.locRemoved)),
        ]),
      ),
    );
  }

  const repoData = selectedRepo ? scope.repos.find((rt) => repoRefKey(rt.repo) === selectedRepo) : undefined;
  if (repoData) {
    const inRepo = <T extends { repo: Scope["repos"][number]["repo"] }>(rows: T[]): T[] =>
      rows.filter((r) => repoRefKey(r.repo) === selectedRepo);
    const showAuthor = !isMember;
    blocks.push(
      heading(3, link(repoRefKey(repoData.repo), repoData.repo.url)),
      paragraph(text(totalsLine(repoData.totals))),
      label("Pull requests"),
      repoPrList(inRepo(scope.prs), showAuthor),
      label("Commits"),
      commitList(inRepo(scope.commits), showAuthor),
      label("Comments"),
      commentList(inRepo(scope.comments)),
    );
  }

  return concat(blocks);
}
