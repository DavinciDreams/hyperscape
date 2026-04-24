/**
 * customSectionRegistry — Maps string widget IDs to React components for
 * `EntityTypeSchema.customSections`. This is the C3 escape hatch for
 * panel migrations that need bespoke layouts (computed readouts, rich
 * manifest displays, etc.) while still living under SchemaPropertyEditor.
 *
 * Schemas declare `customSections: [{ widgetId: "Foo", title: "Bar" }]`
 * and the registry resolves the string ID to a component at render time.
 * This preserves JSON round-tripping of schemas (no function references).
 */

import type React from "react";

export interface CustomSectionProps {
  /** Entity ID (for dispatching updates, opening sub-editors, etc.) */
  entityId: string;
  /** The entity's data, passed verbatim from the property panel */
  entityData: Record<string, unknown>;
}

export type CustomSectionComponent = React.ComponentType<CustomSectionProps>;

const registry = new Map<string, CustomSectionComponent>();

/** Register a custom-section widget under the given ID. */
export function registerCustomSection(
  id: string,
  component: CustomSectionComponent,
): void {
  registry.set(id, component);
}

/** Look up a custom-section widget by ID. Returns undefined if missing. */
export function getCustomSection(
  id: string,
): CustomSectionComponent | undefined {
  return registry.get(id);
}

/** List registered widget IDs (for debugging / dev panels). */
export function listCustomSections(): readonly string[] {
  return Array.from(registry.keys());
}
