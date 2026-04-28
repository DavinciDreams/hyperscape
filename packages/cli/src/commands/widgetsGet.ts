/**
 * `hyperforge widgets get <id> [--format=text|json]`
 *
 * Returns the full catalog entry for a single widget id. Exit
 * code 3 (validation) when the id isn't found — distinguishes
 * "you asked for the wrong thing" from "the catalog is missing"
 * (exit 2).
 */

import type {
  StaticCatalogDocument,
  StaticCatalogEntry,
} from "@hyperforge/widget-catalog";
import type { ParsedArgs } from "../parseArgs.js";
import { stringFlag } from "../parseArgs.js";
import { err, ok, type CommandResult } from "../types.js";

export function widgetsGetCommand(
  catalog: StaticCatalogDocument,
  args: ParsedArgs,
): CommandResult<StaticCatalogEntry | { error: string }> {
  const id = args.positional[2];
  if (!id) {
    return err(`Usage: hyperforge widgets get <id>`);
  }

  const entry = catalog.widgets.find((w) => w.id === id);
  if (!entry) {
    return err(`Widget not found: ${id}`, 3, { id });
  }

  const format = stringFlag(args, "format") ?? "text";

  if (format === "json") {
    return ok(JSON.stringify(entry, null, 2), entry);
  }

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
  return ok(lines.join("\n"), entry);
}
