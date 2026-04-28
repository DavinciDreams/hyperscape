/**
 * `@hyperforge/widget-catalog` — public API.
 *
 * Phase A1 of `PLAN_AI_AUTHORING_FOUNDATIONS.md`.
 *
 * Typed query surface over a `WidgetRegistry`. Exposes the
 * registered widget catalog as a list of summaries that AI agents,
 * build tools, and editor previews can consume without depending on
 * Zod internals or React render targets.
 */

export {
  WidgetCatalogService,
  fromRegistry,
  toCatalogEntry,
  type CatalogRegistrySource,
  type WidgetCatalogServiceOptions,
} from "./service";

export { extractPropSummary } from "./extractPropSummary";

export { extractJsdocSummary } from "./extractJsdocSummary";

export {
  buildStaticEntry,
  buildStaticCatalogDocument,
  type StaticCatalogEntry,
  type StaticCatalogDocument,
} from "./staticCatalog";

export type {
  CatalogFilter,
  CatalogStats,
  WidgetCatalogEntry,
  WidgetPropSummary,
} from "./types";
