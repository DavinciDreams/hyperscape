/**
 * ManifestSchemaContributionPlugin (I3 reference, seventh in the
 * series, completing coverage of every surface in
 * `PluginContributionsSchema`).
 *
 *   - Palette          → asset-browser categories
 *   - Toolbar          → top-bar tools
 *   - Commands         → keybindable actions
 *   - Widgets          → HUD elements
 *   - Entities         → authorable entity types
 *   - Systems          → long-running tick systems
 *   - ManifestSchemas  → new authorable manifest *kinds*
 *
 * A `manifestSchemas` contribution lets a plugin declare an
 * entirely new authorable manifest kind — e.g. a `starfighter`
 * plugin contributes a `starfighter` schema, and the editor
 * gains a Content Browser entry + form editor for that kind.
 *
 * The contribution carries:
 *   - `id` — kind identifier (used in the Content Browser list)
 *   - `displayName` — sidebar label
 *   - `version` — schema-version string (semver-ish; opaque to
 *     the registry but surfaced for migration tooling)
 *   - `singleton` — whether the manifest is a single document
 *     (think: `world-config.json`) or an array (think: `npcs.json`)
 *   - `categoryId` — Content Browser grouping
 *   - `iconKey` (optional) — icon to render in the sidebar
 *   - `description` (optional) — Content Browser hover blurb
 *
 * Validation policy:
 *   - `id` must be lowerCamelCase or reverse-domain (matches the
 *     other reference plugins)
 *   - `displayName` non-empty after trim
 *   - `version` must look like `X.Y.Z` (loose SemVer regex)
 *   - `categoryId` non-empty after trim
 *   - `iconKey` / `description`, when present, non-empty after trim
 */

import type { PluginContextScope } from "../PluginContextScope.js";
import type { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import type { HyperforgePlugin } from "../PluginLoader.js";

export interface ManifestSchemaContribution {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly singleton: boolean;
  readonly categoryId: string;
  readonly iconKey?: string;
  readonly description?: string;
}

export interface ManifestSchemaContributionContext {
  readonly pluginId: string;
  readonly scope: PluginContextScope;
  readonly manifestSchemas: PluginContributionRegistry<ManifestSchemaContribution>;
}

const MANIFEST_SCHEMA_ID_REGEX =
  /^(?:[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+|[a-z][a-zA-Z0-9]*)$/;

const SCHEMA_VERSION_REGEX = /^\d+\.\d+\.\d+$/;

export class InvalidManifestSchemaIdError extends Error {
  readonly schemaId: string;

  constructor(schemaId: string) {
    super(
      `Manifest schema id "${schemaId}" must be lowerCamelCase ` +
        `(e.g. "starfighter") or reverse-domain ` +
        `(e.g. "com.studio.starfighter")`,
    );
    this.name = "InvalidManifestSchemaIdError";
    this.schemaId = schemaId;
  }
}

export class InvalidManifestSchemaVersionError extends Error {
  readonly schemaId: string;
  readonly version: string;

  constructor(schemaId: string, version: string) {
    super(
      `Manifest schema "${schemaId}" version "${version}" must look like 'X.Y.Z'`,
    );
    this.name = "InvalidManifestSchemaVersionError";
    this.schemaId = schemaId;
    this.version = version;
  }
}

export class InvalidManifestSchemaFieldError extends Error {
  readonly schemaId: string;
  readonly field: string;

  constructor(schemaId: string, field: string, reason: string) {
    super(
      `Manifest schema "${schemaId}" field "${field}" is invalid: ${reason}`,
    );
    this.name = "InvalidManifestSchemaFieldError";
    this.schemaId = schemaId;
    this.field = field;
  }
}

function validateManifestSchemaContribution(
  s: ManifestSchemaContribution,
): void {
  if (!MANIFEST_SCHEMA_ID_REGEX.test(s.id)) {
    throw new InvalidManifestSchemaIdError(s.id);
  }
  if (s.displayName.trim().length === 0) {
    throw new InvalidManifestSchemaFieldError(
      s.id,
      "displayName",
      "must be non-empty",
    );
  }
  if (!SCHEMA_VERSION_REGEX.test(s.version)) {
    throw new InvalidManifestSchemaVersionError(s.id, s.version);
  }
  if (s.categoryId.trim().length === 0) {
    throw new InvalidManifestSchemaFieldError(
      s.id,
      "categoryId",
      "must be non-empty",
    );
  }
  if (s.iconKey !== undefined && s.iconKey.trim().length === 0) {
    throw new InvalidManifestSchemaFieldError(
      s.id,
      "iconKey",
      "must be non-empty when set",
    );
  }
  if (s.description !== undefined && s.description.trim().length === 0) {
    throw new InvalidManifestSchemaFieldError(
      s.id,
      "description",
      "must be non-empty when set",
    );
  }
}

export function manifestSchemaContributionPlugin(
  schemas: readonly ManifestSchemaContribution[],
): HyperforgePlugin<ManifestSchemaContributionContext> {
  return {
    onEnable(ctx) {
      for (const s of schemas) validateManifestSchemaContribution(s);
      ctx.manifestSchemas.registerAll(ctx.pluginId, schemas);
      ctx.scope.register(() =>
        ctx.manifestSchemas.unregisterAllForPlugin(ctx.pluginId),
      );
    },
  };
}
