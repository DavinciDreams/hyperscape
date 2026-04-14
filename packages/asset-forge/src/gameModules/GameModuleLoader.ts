/**
 * GameModuleLoader — Loads and validates GameModule definitions from JSON.
 *
 * Enables AI-generated game modules: an AI writes a JSON file describing
 * entity types, palette categories, and terrain config. The loader validates
 * the structure and returns a typed GameModule ready for the registry.
 *
 * Usage:
 *   const json = await fetch("/modules/my-game.json").then(r => r.json());
 *   const module = loadGameModule(json);
 *   const registry = new EntityTypeRegistry(module);
 */

import type {
  GameModule,
  EntityTypeSchema,
  FieldSchema,
  FieldType,
  PaletteCategorySchema,
  OutlinerLayerSchema,
} from "./GameModule";

// ============== VALIDATION ==============

const VALID_FIELD_TYPES = new Set<FieldType>([
  "string",
  "number",
  "slider",
  "boolean",
  "select",
  "position",
  "rotation",
  "color",
  "tags",
  "json",
  "entityId",
  "polygon",
  "waypoints",
]);

const VALID_MARKER_SHAPES = new Set([
  "capsule",
  "cylinder",
  "sphere",
  "cube",
  "billboard",
  "model",
]);

const VALID_STATE_ROOTS = new Set(["extendedLayers", "audioLayers"]);
const VALID_STORAGE_TYPES = new Set(["array", "scalar"]);

class ModuleValidationError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`GameModule validation error at ${path}: ${message}`);
    this.name = "ModuleValidationError";
  }
}

function assertString(val: unknown, path: string): asserts val is string {
  if (typeof val !== "string" || val.length === 0) {
    throw new ModuleValidationError(
      path,
      `expected non-empty string, got ${typeof val}`,
    );
  }
}

function assertArray(val: unknown, path: string): asserts val is unknown[] {
  if (!Array.isArray(val)) {
    throw new ModuleValidationError(path, `expected array, got ${typeof val}`);
  }
}

function assertObject(
  val: unknown,
  path: string,
): asserts val is Record<string, unknown> {
  if (typeof val !== "object" || val === null || Array.isArray(val)) {
    throw new ModuleValidationError(path, `expected object, got ${typeof val}`);
  }
}

function validateField(raw: unknown, path: string): FieldSchema {
  assertObject(raw, path);
  const f = raw as Record<string, unknown>;
  assertString(f.key, `${path}.key`);
  assertString(f.label, `${path}.label`);
  assertString(f.type, `${path}.type`);
  if (!VALID_FIELD_TYPES.has(f.type as FieldType)) {
    throw new ModuleValidationError(
      `${path}.type`,
      `invalid field type "${f.type}"`,
    );
  }
  assertString(f.section, `${path}.section`);
  return f as unknown as FieldSchema;
}

function validateEntityType(raw: unknown, path: string): EntityTypeSchema {
  assertObject(raw, path);
  const et = raw as Record<string, unknown>;

  assertString(et.id, `${path}.id`);
  assertString(et.name, `${path}.name`);
  assertString(et.icon, `${path}.icon`);
  assertString(et.color, `${path}.color`);
  assertString(et.paletteCategory, `${path}.paletteCategory`);
  assertString(et.outlinerLayer, `${path}.outlinerLayer`);
  assertString(et.selectionType, `${path}.selectionType`);

  // Storage
  assertObject(et.storage, `${path}.storage`);
  const storage = et.storage as Record<string, unknown>;
  assertString(storage.stateKey, `${path}.storage.stateKey`);
  assertString(storage.type, `${path}.storage.type`);
  if (!VALID_STORAGE_TYPES.has(storage.type as string)) {
    throw new ModuleValidationError(
      `${path}.storage.type`,
      `must be "array" or "scalar"`,
    );
  }
  if (storage.stateRoot !== undefined) {
    assertString(storage.stateRoot, `${path}.storage.stateRoot`);
    if (!VALID_STATE_ROOTS.has(storage.stateRoot as string)) {
      throw new ModuleValidationError(
        `${path}.storage.stateRoot`,
        `must be "extendedLayers" or "audioLayers"`,
      );
    }
  }

  // Fields
  assertArray(et.fields, `${path}.fields`);
  const fields = (et.fields as unknown[]).map((f, i) =>
    validateField(f, `${path}.fields[${i}]`),
  );

  // Defaults
  assertObject(et.defaults, `${path}.defaults`);

  // Marker
  assertObject(et.marker, `${path}.marker`);
  const marker = et.marker as Record<string, unknown>;
  assertString(marker.shape, `${path}.marker.shape`);
  if (!VALID_MARKER_SHAPES.has(marker.shape as string)) {
    throw new ModuleValidationError(
      `${path}.marker.shape`,
      `invalid shape "${marker.shape}"`,
    );
  }

  if (typeof et.spatial !== "boolean") {
    throw new ModuleValidationError(`${path}.spatial`, "expected boolean");
  }

  return { ...et, fields } as unknown as EntityTypeSchema;
}

function validatePaletteCategory(
  raw: unknown,
  path: string,
): PaletteCategorySchema {
  assertObject(raw, path);
  const c = raw as Record<string, unknown>;
  assertString(c.id, `${path}.id`);
  assertString(c.label, `${path}.label`);
  assertString(c.icon, `${path}.icon`);
  assertString(c.description, `${path}.description`);
  return c as unknown as PaletteCategorySchema;
}

function validateOutlinerLayer(
  raw: unknown,
  path: string,
): OutlinerLayerSchema {
  assertObject(raw, path);
  const l = raw as Record<string, unknown>;
  assertString(l.id, `${path}.id`);
  assertString(l.label, `${path}.label`);
  assertString(l.icon, `${path}.icon`);
  assertArray(l.entityTypes, `${path}.entityTypes`);
  for (let i = 0; i < (l.entityTypes as unknown[]).length; i++) {
    assertString((l.entityTypes as unknown[])[i], `${path}.entityTypes[${i}]`);
  }
  return l as unknown as OutlinerLayerSchema;
}

// ============== LOADER ==============

/**
 * Load and validate a GameModule from a parsed JSON object.
 * Throws ModuleValidationError if the structure is invalid.
 */
export function loadGameModule(raw: unknown): GameModule {
  assertObject(raw, "root");
  const obj = raw as Record<string, unknown>;

  assertString(obj.id, "root.id");
  assertString(obj.name, "root.name");
  assertString(obj.version, "root.version");

  // Entity types
  assertArray(obj.entityTypes, "root.entityTypes");
  const entityTypes = (obj.entityTypes as unknown[]).map((et, i) =>
    validateEntityType(et, `root.entityTypes[${i}]`),
  );

  // Palette categories
  assertArray(obj.paletteCategories, "root.paletteCategories");
  const paletteCategories = (obj.paletteCategories as unknown[]).map((c, i) =>
    validatePaletteCategory(c, `root.paletteCategories[${i}]`),
  );

  // Outliner layers
  assertArray(obj.outlinerLayers, "root.outlinerLayers");
  const outlinerLayers = (obj.outlinerLayers as unknown[]).map((l, i) =>
    validateOutlinerLayer(l, `root.outlinerLayers[${i}]`),
  );

  // Cross-reference validation: all entity type palette categories must exist
  const catIds = new Set(paletteCategories.map((c) => c.id));
  const layerIds = new Set(outlinerLayers.map((l) => l.id));
  for (const et of entityTypes) {
    if (!catIds.has(et.paletteCategory)) {
      throw new ModuleValidationError(
        `entityType "${et.id}"`,
        `references unknown paletteCategory "${et.paletteCategory}"`,
      );
    }
    if (!layerIds.has(et.outlinerLayer)) {
      throw new ModuleValidationError(
        `entityType "${et.id}"`,
        `references unknown outlinerLayer "${et.outlinerLayer}"`,
      );
    }
  }

  // ID uniqueness
  const typeIds = new Set<string>();
  const selectionTypes = new Set<string>();
  for (const et of entityTypes) {
    if (typeIds.has(et.id)) {
      throw new ModuleValidationError(
        "root.entityTypes",
        `duplicate entity type id "${et.id}"`,
      );
    }
    typeIds.add(et.id);
    if (selectionTypes.has(et.selectionType)) {
      throw new ModuleValidationError(
        "root.entityTypes",
        `duplicate selectionType "${et.selectionType}"`,
      );
    }
    selectionTypes.add(et.selectionType);
  }

  const module: GameModule = {
    id: obj.id as string,
    name: obj.name as string,
    version: obj.version as string,
    entityTypes,
    paletteCategories,
    outlinerLayers,
  };

  // Optional terrain config
  if (obj.terrain !== undefined) {
    assertObject(obj.terrain, "root.terrain");
    module.terrain = obj.terrain as unknown as GameModule["terrain"];
  }

  return module;
}

/**
 * Load a GameModule from a JSON file URL.
 * Fetches the file, parses it, and validates the structure.
 */
export async function loadGameModuleFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<GameModule> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch game module from ${url}: ${res.status} ${res.statusText}`,
    );
  }
  const json: unknown = await res.json();
  return loadGameModule(json);
}

export { ModuleValidationError };
