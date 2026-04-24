/**
 * EntitySchemaContributionPlugin (I3 reference).
 *
 * Fifth reference plugin over `PluginContributionRegistry<TItem>`,
 * covering the *authorable entity type* surface. Together with
 * Palette, Toolbar, Commands, and Widgets, this rounds out the
 * editor's plugin-extensibility quadrants:
 *
 *   - Palette   → "what categories show in the asset browser"
 *   - Toolbar   → "what tools show in the top bar"
 *   - Commands  → "what keybindable actions exist"
 *   - Widgets   → "what HUD elements render at runtime"
 *   - Entities  → "what entity types can be authored into a scene"
 *
 * An entity schema entry pairs an authorable id with palette
 * metadata (label + categoryId) and a property-panel descriptor
 * (`propertySchemaRef`) the property inspector resolves at runtime.
 * The schema reference is intentionally a string — the actual
 * property layout lives in the plugin's data, not in the registry,
 * so the registry stays serializable and editor-side property
 * panels can render lazily.
 *
 * Validation policy (kept light):
 *   - `id` must be lowerCamelCase or reverse-domain (mirrors the
 *     PluginCommand id regex)
 *   - `label` must be non-empty after trim
 *   - `categoryId` must be non-empty after trim
 *   - `propertySchemaRef` must be non-empty after trim
 *   - `iconKey`, when present, must be non-empty after trim
 */

import type { PluginContextScope } from "../PluginContextScope.js";
import type { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import type { HyperforgePlugin } from "../PluginLoader.js";

export interface EntitySchema {
  readonly id: string;
  readonly label: string;
  readonly categoryId: string;
  readonly propertySchemaRef: string;
  readonly iconKey?: string;
}

export interface EntitySchemaContributionContext {
  readonly pluginId: string;
  readonly scope: PluginContextScope;
  readonly entitySchemas: PluginContributionRegistry<EntitySchema>;
}

const ENTITY_ID_REGEX =
  /^(?:[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+|[a-z][a-zA-Z0-9]*)$/;

export class InvalidEntitySchemaIdError extends Error {
  readonly entityId: string;

  constructor(entityId: string) {
    super(
      `Entity schema id "${entityId}" must be lowerCamelCase ` +
        `(e.g. "questObjective") or reverse-domain ` +
        `(e.g. "com.studio.quest.objective")`,
    );
    this.name = "InvalidEntitySchemaIdError";
    this.entityId = entityId;
  }
}

export class InvalidEntitySchemaFieldError extends Error {
  readonly entityId: string;
  readonly field: string;

  constructor(entityId: string, field: string, reason: string) {
    super(`Entity schema "${entityId}" field "${field}" is invalid: ${reason}`);
    this.name = "InvalidEntitySchemaFieldError";
    this.entityId = entityId;
    this.field = field;
  }
}

function validateEntitySchema(s: EntitySchema): void {
  if (!ENTITY_ID_REGEX.test(s.id)) {
    throw new InvalidEntitySchemaIdError(s.id);
  }
  if (s.label.trim().length === 0) {
    throw new InvalidEntitySchemaFieldError(s.id, "label", "must be non-empty");
  }
  if (s.categoryId.trim().length === 0) {
    throw new InvalidEntitySchemaFieldError(
      s.id,
      "categoryId",
      "must be non-empty",
    );
  }
  if (s.propertySchemaRef.trim().length === 0) {
    throw new InvalidEntitySchemaFieldError(
      s.id,
      "propertySchemaRef",
      "must be non-empty",
    );
  }
  if (s.iconKey !== undefined && s.iconKey.trim().length === 0) {
    throw new InvalidEntitySchemaFieldError(
      s.id,
      "iconKey",
      "must be non-empty when set",
    );
  }
}

export function entitySchemaContributionPlugin(
  schemas: readonly EntitySchema[],
): HyperforgePlugin<EntitySchemaContributionContext> {
  return {
    onEnable(ctx) {
      for (const s of schemas) validateEntitySchema(s);
      ctx.entitySchemas.registerAll(ctx.pluginId, schemas);
      ctx.scope.register(() =>
        ctx.entitySchemas.unregisterAllForPlugin(ctx.pluginId),
      );
    },
  };
}
