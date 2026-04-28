/**
 * `@hyperforge/cli` — public API.
 *
 * Phase A4 of `PLAN_AI_AUTHORING_FOUNDATIONS.md`. The first
 * runtime-agnostic shell wrapping the typed services from A1
 * (`@hyperforge/widget-catalog`) and A3
 * (`@hyperforge/plugin-scaffolder`). Humans, CI, and AI agents
 * (via subprocess) all consume the same surface.
 *
 * The `dispatch` function is exported so other shells (an MCP
 * server, an Eliza action) can reuse the same command routing
 * without re-implementing it.
 */

export { dispatch, type DispatchOptions } from "./dispatch.js";
export {
  parseArgs,
  stringFlag,
  boolFlag,
  type ParsedArgs,
} from "./parseArgs.js";
export { ok, err, type CommandResult, type ExitCode } from "./types.js";

export {
  loadCatalog,
  resolveCatalogPath,
  CatalogNotFoundError,
  CatalogParseError,
  type LoadCatalogOptions,
} from "./loadCatalog.js";

export {
  widgetsListCommand,
  type WidgetsListData,
  type WidgetsListItem,
} from "./commands/widgetsList.js";
export { widgetsGetCommand } from "./commands/widgetsGet.js";
export {
  widgetsSearchCommand,
  type WidgetsSearchData,
  type WidgetsSearchHit,
} from "./commands/widgetsSearch.js";
export {
  catalogStatsCommand,
  type CatalogStatsData,
} from "./commands/catalogStats.js";
export {
  scaffoldWidgetCommand,
  type ScaffoldWidgetData,
} from "./commands/scaffoldWidget.js";
