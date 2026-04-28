/**
 * Subcommand dispatch table. Pure: parsed args + an optional
 * catalog loader → CommandResult. Kept separate from the bin so
 * the dispatcher can be unit-tested without subprocess plumbing.
 */

import type { StaticCatalogDocument } from "@hyperforge/widget-catalog";
import type { ParsedArgs } from "./parseArgs.js";
import { stringFlag } from "./parseArgs.js";
import { err, type CommandResult } from "./types.js";
import { widgetsListCommand } from "./commands/widgetsList.js";
import { widgetsGetCommand } from "./commands/widgetsGet.js";
import { widgetsSearchCommand } from "./commands/widgetsSearch.js";
import { catalogStatsCommand } from "./commands/catalogStats.js";
import { scaffoldWidgetCommand } from "./commands/scaffoldWidget.js";
import {
  CatalogNotFoundError,
  CatalogParseError,
  loadCatalog,
} from "./loadCatalog.js";

export interface DispatchOptions {
  /**
   * Override the catalog loader. Defaults to reading from disk.
   * Tests pass an in-memory document.
   */
  readonly catalogLoader?: () => StaticCatalogDocument;
}

export function dispatch(
  args: ParsedArgs,
  options: DispatchOptions = {},
): CommandResult {
  const top = args.positional[0];
  const sub = args.positional[1];

  if (top === undefined || top === "help" || args.flags.help === true) {
    return helpResult();
  }

  // Catalog read-only commands.
  if (top === "widgets") {
    if (sub === "list" || sub === "get" || sub === "search") {
      const catalog = loadCatalogOrFail(args, options);
      if ("__error" in catalog) return catalog.__error;
      if (sub === "list") return widgetsListCommand(catalog, args);
      if (sub === "get") return widgetsGetCommand(catalog, args);
      return widgetsSearchCommand(catalog, args);
    }
    return err(`Usage: hyperforge widgets <list|get|search> [options]`);
  }

  if (top === "catalog") {
    if (sub === "stats") {
      const catalog = loadCatalogOrFail(args, options);
      if ("__error" in catalog) return catalog.__error;
      return catalogStatsCommand(catalog, args);
    }
    return err(`Usage: hyperforge catalog <stats>`);
  }

  if (top === "scaffold") {
    if (sub === "widget") return scaffoldWidgetCommand(args);
    return err(`Usage: hyperforge scaffold <widget> [options]`);
  }

  return err(`Unknown command: ${top}. Run 'hyperforge help'.`);
}

function loadCatalogOrFail(
  args: ParsedArgs,
  options: DispatchOptions,
): StaticCatalogDocument | { __error: CommandResult } {
  if (options.catalogLoader) {
    try {
      return options.catalogLoader();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { __error: err(msg, 2) };
    }
  }
  try {
    return loadCatalog({ path: stringFlag(args, "catalog") });
  } catch (e) {
    if (e instanceof CatalogNotFoundError) {
      return { __error: err(e.message, 2) };
    }
    if (e instanceof CatalogParseError) {
      return { __error: err(e.message, 2) };
    }
    throw e;
  }
}

function helpResult(): CommandResult {
  const text = [
    `hyperforge — HyperForge CLI`,
    ``,
    `Usage:`,
    `  hyperforge widgets list   [--category=X] [--format=text|json]`,
    `  hyperforge widgets get    <id> [--format=text|json]`,
    `  hyperforge widgets search <query> [--format=text|json]`,
    `  hyperforge catalog  stats [--format=text|json]`,
    ``,
    `  hyperforge scaffold widget --spec-file=<path>`,
    `  hyperforge scaffold widget --name=Foo --manifest-id=com.x.y.foo --category=panel`,
    `      [--width=4 --height=3 --description=...]`,
    `      [--widgets-dir=... --tests-dir=... --index-file=...]`,
    `      [--workspace-root=...] [--dry-run] [--force] [--format=text|json]`,
    ``,
    `Catalog source:`,
    `  Default: <cwd>/packages/widget-catalog/dist/catalog.json`,
    `  Override: --catalog=<path>`,
    `  Build:    bun run --filter @hyperforge/widget-catalog build:catalog`,
    ``,
    `Exit codes:`,
    `  0  success`,
    `  1  bad CLI usage`,
    `  2  file/IO error (missing catalog, unreadable spec)`,
    `  3  validation error (unknown widget id, invalid spec)`,
  ].join("\n");
  return { exitCode: 0, text, data: { ok: true } };
}
