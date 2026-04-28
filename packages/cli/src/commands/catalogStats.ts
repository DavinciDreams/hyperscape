/**
 * `hyperforge catalog stats [--format=text|json]`
 *
 * Surfaces the aggregate stats block emitted by the catalog
 * builder. Useful for AI prompts that need the
 * "there are N widgets across M categories" summary.
 */

import type { StaticCatalogDocument } from "@hyperforge/widget-catalog";
import type { ParsedArgs } from "../parseArgs.js";
import { stringFlag } from "../parseArgs.js";
import { ok, type CommandResult } from "../types.js";

export interface CatalogStatsData {
  readonly version: 1;
  readonly builtAt: string;
  readonly total: number;
  readonly byCategory: Readonly<Record<string, number>>;
}

export function catalogStatsCommand(
  catalog: StaticCatalogDocument,
  args: ParsedArgs,
): CommandResult<CatalogStatsData> {
  const data: CatalogStatsData = {
    version: catalog.version,
    builtAt: catalog.builtAt,
    total: catalog.stats.total,
    byCategory: catalog.stats.byCategory,
  };

  const format = stringFlag(args, "format") ?? "text";
  if (format === "json") {
    return ok(JSON.stringify(data, null, 2), data);
  }

  const lines: string[] = [];
  lines.push(`HyperForge widget catalog`);
  lines.push(`  version:  ${data.version}`);
  lines.push(`  builtAt:  ${data.builtAt}`);
  lines.push(`  total:    ${data.total}`);
  const categories = Object.keys(data.byCategory).sort();
  if (categories.length > 0) {
    lines.push(`  byCategory:`);
    for (const cat of categories) {
      lines.push(`    ${cat}: ${data.byCategory[cat]}`);
    }
  }
  return ok(lines.join("\n"), data);
}
