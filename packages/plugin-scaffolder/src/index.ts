/**
 * `@hyperforge/plugin-scaffolder` — public API.
 *
 * Phase A3 of `PLAN_AI_AUTHORING_FOUNDATIONS.md`.
 *
 * Pure scaffolder service. Given a typed `WidgetSpec`, returns the
 * file contents needed to ship it. No filesystem I/O — the caller
 * (CLI, agent, test) decides where the bytes land.
 */

export { scaffoldWidget } from "./scaffoldWidget.js";

export {
  applyToWorkspace,
  type ApplyToWorkspaceOptions,
  type ApplyToWorkspaceReport,
} from "./applyToWorkspace.js";

export {
  assertWidgetSpec,
  validateWidgetSpec,
  type ScaffoldValidationIssue,
  type ScaffoldValidationResult,
} from "./validate.js";

export {
  camelize,
  emitDefaultPropsBody,
  emitDestructureList,
  emitLiteral,
  emitPropsSchemaBody,
  emitZodField,
} from "./emit.js";

export { renderWidgetSource } from "./templates/widgetSource.js";
export {
  renderWidgetTest,
  type WidgetTestRenderOptions,
} from "./templates/widgetTest.js";

export type {
  PropSpec,
  RegistrationSite,
  ScaffoldedFile,
  ScaffoldPropType,
  ScaffoldResult,
  ScaffoldWidgetOptions,
  WidgetSpec,
} from "./types.js";
