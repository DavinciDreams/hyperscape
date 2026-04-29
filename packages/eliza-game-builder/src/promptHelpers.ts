/**
 * Token-budget-friendly response formatters.
 *
 * Actions return one-shot summaries that an LLM can both read and
 * paste into its own context. Catalog entries can be verbose
 * (12+ props with descriptions); these helpers trim them down for
 * prompt-budget while leaving raw `data` intact for programmatic
 * consumers.
 *
 * Design rule: every helper returns `{ text, summary, data }`:
 *   - `text` — what the agent says back ("found 12 widgets, here's a summary")
 *   - `summary` — multi-line condensed listing (one item per line)
 *   - `data` — full structured object the agent can introspect
 */

import type {
  StaticCatalogDocument,
  StaticCatalogEntry,
} from "@hyperforge/widget-catalog";

export interface FormattedListResult {
  readonly text: string;
  readonly summary: string;
  readonly data: {
    readonly count: number;
    readonly items: ReadonlyArray<StaticCatalogEntry>;
  };
}

export interface FormattedEntryResult {
  readonly text: string;
  readonly summary: string;
  readonly data: StaticCatalogEntry;
}

export interface FormattedStatsResult {
  readonly text: string;
  readonly summary: string;
  readonly data: {
    readonly version: number;
    readonly builtAt: string;
    readonly total: number;
    readonly byCategory: Readonly<Record<string, number>>;
  };
}

/** Maximum widgets dumped inline in `summary` before truncation kicks in. */
const MAX_INLINE_LIST = 30;

/**
 * Format a list of widgets as a multi-line summary. Truncates over
 * `MAX_INLINE_LIST` so a chat response doesn't blow the budget.
 */
export function formatWidgetList(
  widgets: ReadonlyArray<StaticCatalogEntry>,
  options: { readonly category?: string } = {},
): FormattedListResult {
  const count = widgets.length;
  const lead = options.category
    ? `${count} widget${count === 1 ? "" : "s"} in category "${options.category}"`
    : `${count} widget${count === 1 ? "" : "s"}`;

  if (count === 0) {
    return {
      text: `No widgets found${options.category ? ` in category "${options.category}"` : ""}.`,
      summary: "",
      data: { count, items: [] },
    };
  }

  const head = widgets.slice(0, MAX_INLINE_LIST);
  const lines = head.map(
    (w) =>
      `${w.id}  [${w.category}]  ${w.name}${w.description ? ` — ${w.description}` : ""}`,
  );
  if (count > MAX_INLINE_LIST) {
    lines.push(`… and ${count - MAX_INLINE_LIST} more`);
  }
  const summary = lines.join("\n");
  return {
    text: `${lead}:\n${summary}`,
    summary,
    data: { count, items: widgets },
  };
}

/**
 * Format a single widget entry — full prop schema, JSDoc, source
 * path. Always emits the entire payload because the agent asked
 * specifically for this widget.
 */
export function formatWidgetEntry(
  entry: StaticCatalogEntry,
): FormattedEntryResult {
  const lines: string[] = [];
  lines.push(`${entry.name}  (${entry.id})`);
  lines.push(`  category:    ${entry.category}`);
  lines.push(
    `  defaultSize: ${entry.defaultSize.width} x ${entry.defaultSize.height}`,
  );
  if (entry.description) lines.push(`  description: ${entry.description}`);
  if (entry.jsdocSummary) lines.push(`  summary:     ${entry.jsdocSummary}`);
  if (entry.sourcePath) lines.push(`  source:      ${entry.sourcePath}`);
  if (entry.props.length > 0) {
    lines.push(`  props:`);
    for (const p of entry.props) {
      const optional = p.optional ? " (optional)" : "";
      const enums =
        p.enumValues && p.enumValues.length > 0
          ? ` { ${p.enumValues.join(" | ")} }`
          : "";
      const desc = p.description ? `  — ${p.description}` : "";
      lines.push(`    ${p.name}: ${p.type}${enums}${optional}${desc}`);
    }
  }
  const summary = lines.join("\n");
  return { text: summary, summary, data: entry };
}

/**
 * Format catalog-level stats. Single-line summary fits a small
 * prompt-budget header.
 */
export function formatCatalogStats(
  catalog: StaticCatalogDocument,
): FormattedStatsResult {
  const data = {
    version: catalog.version,
    builtAt: catalog.builtAt,
    total: catalog.stats.total,
    byCategory: catalog.stats.byCategory,
  };
  const cats = Object.entries(data.byCategory)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const summary = `${data.total} widgets across categories: ${cats}`;
  return { text: summary, summary, data };
}

/**
 * Case-insensitive substring search across id/name/description/jsdocSummary.
 * Matches the same fields the CLI's `widgets search` command does.
 */
export function searchCatalog(
  catalog: StaticCatalogDocument,
  query: string,
): ReadonlyArray<StaticCatalogEntry> {
  const needle = query.toLowerCase();
  return catalog.widgets.filter((w) => {
    const haystacks = [w.id, w.name, w.description, w.jsdocSummary];
    return haystacks.some((h) => h.toLowerCase().includes(needle));
  });
}

/**
 * Best-effort extraction of a quoted phrase or trailing word from a
 * free-form user message. Used when an action's parameters aren't
 * pre-extracted by the runtime.
 *
 *   "search widgets for hp bar" → "hp bar"
 *   "find me 'fishing'"          → "fishing"
 */
export function extractQueryFromText(
  text: string,
  leadingVerbs: ReadonlyArray<string>,
): string {
  let body = text.trim();
  for (const verb of leadingVerbs) {
    const re = new RegExp(`^\\s*${verb}\\s*`, "i");
    body = body.replace(re, "");
  }
  const quoted = body.match(/['"]([^'"]+)['"]/);
  if (quoted) return quoted[1]!.trim();
  return body.trim();
}
