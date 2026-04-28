/**
 * `hyperforge widgets list [--category=X] [--format=text|json]`
 *
 * Lists every widget in the loaded catalog. Optional category
 * filter. Pure: takes the catalog + parsed args, returns a
 * structured CommandResult.
 */

import type { StaticCatalogDocument } from "@hyperforge/widget-catalog";
import type { ParsedArgs } from "../parseArgs.js";
import { stringFlag } from "../parseArgs.js";
import { ok, type CommandResult } from "../types.js";

export interface WidgetsListItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
}

export interface WidgetsListData {
  readonly count: number;
  readonly widgets: ReadonlyArray<WidgetsListItem>;
}

export function widgetsListCommand(
  catalog: StaticCatalogDocument,
  args: ParsedArgs,
): CommandResult<WidgetsListData> {
  const category = stringFlag(args, "category");
  const format = stringFlag(args, "format") ?? "text";

  const filtered = category
    ? catalog.widgets.filter((w) => w.category === category)
    : catalog.widgets;

  const items: WidgetsListItem[] = filtered.map((w) => ({
    id: w.id,
    name: w.name,
    category: w.category,
    description: w.description,
  }));

  const data: WidgetsListData = { count: items.length, widgets: items };

  if (format === "json") {
    return ok(JSON.stringify(data, null, 2), data);
  }

  if (items.length === 0) {
    const note = category
      ? `No widgets found in category "${category}".`
      : `No widgets in catalog.`;
    return ok(note, data);
  }

  const lines: string[] = [];
  lines.push(`${items.length} widget${items.length === 1 ? "" : "s"}:`);
  for (const w of items) {
    lines.push(`  ${w.id}  [${w.category}]  ${w.name}`);
  }
  return ok(lines.join("\n"), data);
}
