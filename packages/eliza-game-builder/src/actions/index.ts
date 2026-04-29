/**
 * Barrel — every action exported as a flat list. The plugin's
 * `actions` array consumes this so adding a new action is one
 * import + one export entry, no plumbing edits.
 */

export { listWidgetsAction } from "./listWidgets.js";
export { getWidgetAction } from "./getWidget.js";
export { searchWidgetsAction } from "./searchWidgets.js";
export { catalogStatsAction } from "./catalogStats.js";
export { scaffoldWidgetAction } from "./scaffoldWidget.js";
export { proposeUIPackAction } from "./proposeUIPack.js";
