/**
 * `hyperforge widgets search <query> [--format=text|json]`
 *
 * Case-insensitive substring search across id, name, description,
 * and jsdocSummary. The catalog has at most a few hundred widgets
 * so naive scanning is fine.
 */

import type {
  StaticCatalogDocument,
  StaticCatalogEntry,
} from "@hyperforge/widget-catalog";
import type { ParsedArgs } from "../parseArgs.js";
import { stringFlag } from "../parseArgs.js";
import { err, ok, type CommandResult } from "../types.js";

export interface WidgetsSearchHit {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
}

export interface WidgetsSearchData {
  readonly query: string;
  readonly count: number;
  readonly hits: ReadonlyArray<WidgetsSearchHit>;
}

export function widgetsSearchCommand(
  catalog: StaticCatalogDocument,
  args: ParsedArgs,
): CommandResult<WidgetsSearchData | { error: string }> {
  const query = args.positional[2];
  if (!query) {
    return err(`Usage: hyperforge widgets search <query>`);
  }

  const needle = query.toLowerCase();
  const hits = catalog.widgets.filter((w) => matches(w, needle));
  const data: WidgetsSearchData = {
    query,
    count: hits.length,
    hits: hits.map((w) => ({
      id: w.id,
      name: w.name,
      category: w.category,
      description: w.description,
    })),
  };

  const format = stringFlag(args, "format") ?? "text";
  if (format === "json") {
    return ok(JSON.stringify(data, null, 2), data);
  }

  if (hits.length === 0) {
    return ok(`No widgets match "${query}".`, data);
  }

  const lines: string[] = [];
  lines.push(
    `${hits.length} match${hits.length === 1 ? "" : "es"} for "${query}":`,
  );
  for (const w of hits) {
    lines.push(`  ${w.id}  [${w.category}]  ${w.name}`);
  }
  return ok(lines.join("\n"), data);
}

function matches(entry: StaticCatalogEntry, needle: string): boolean {
  const haystacks = [
    entry.id,
    entry.name,
    entry.description,
    entry.jsdocSummary,
  ];
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}
