/**
 * GameModule — Core interfaces for the game module abstraction.
 *
 * A GameModule declares entity types, palette categories, outliner layers,
 * and terrain config for a specific game built in the World Studio editor.
 * Hyperia is the first (and currently only) game module.
 *
 * Pure types — no runtime code.
 */

// ============== GAME MODULE ==============

/** Top-level game module definition. */
export interface GameModule {
  /** Unique identifier (e.g. "hyperia") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Semantic version string */
  version: string;
  /** Entity types this game defines */
  entityTypes: EntityTypeSchema[];
  /** Palette categories for the entity palette sidebar */
  paletteCategories: PaletteCategorySchema[];
  /** Outliner layer groupings for the hierarchy tree */
  outlinerLayers: OutlinerLayerSchema[];
  /** Optional terrain module configuration */
  terrain?: TerrainModuleConfig;
}

// ============== ENTITY TYPE SCHEMA ==============

/** Declares an entity type: its fields, visual marker, defaults, and where it lives in state. */
export interface EntityTypeSchema {
  /** Unique type identifier (e.g. "spawnPoint") */
  id: string;
  /** Human-readable name (e.g. "Spawn Point") */
  name: string;
  /** Lucide icon name for palette and outliner */
  icon: string;
  /** Hex color for markers and UI accents */
  color: string;
  /** Which palette category this entity belongs to */
  paletteCategory: string;
  /** Which outliner layer this entity belongs to */
  outlinerLayer: string;
  /** Selection.type value that maps to this entity type */
  selectionType: string;
  /** Where in state this entity is stored */
  storage: {
    stateKey: string;
    type: "array" | "scalar";
    /** Which root state object this entity lives in (default: "extendedLayers") */
    stateRoot?: "extendedLayers" | "audioLayers";
  };
  /** Whether this entity has a world position */
  spatial: boolean;
  /** Whether edits should promote procgen source to hand-placed */
  tracksSource?: boolean;
  /** Field definitions for the property editor */
  fields: FieldSchema[];
  /** Default values for new entities */
  defaults: Record<string, unknown>;
  /** 3D marker configuration */
  marker: MarkerConfig;
  /** Pre-defined templates for quick creation */
  templates?: EntityTemplate[];
  /** Override: use a bespoke component instead of SchemaPropertyEditor */
  customEditor?: string;
}

// ============== FIELD SCHEMA ==============

/** Declares a single editable field on an entity type. */
export interface FieldSchema {
  /** Property key on the entity data object */
  key: string;
  /** Human-readable label */
  label: string;
  /** Widget type to render */
  type: FieldType;
  /** Section heading for grouping in the property editor */
  section: string;
  /** Whether this field is required */
  required?: boolean;
  /** Default value for new entities */
  default?: unknown;
  /** If true, render as read-only InfoRow */
  readOnly?: boolean;
  /** Tooltip description */
  description?: string;
  /** Conditional visibility — hide field unless gate condition is met */
  visibleWhen?: { field: string; equals?: unknown; notEquals?: unknown };
  /** Type-specific configuration (min/max, options, etc.) */
  config?: FieldConfig;
}

/** Supported field widget types. */
export type FieldType =
  | "string"
  | "number"
  | "slider"
  | "boolean"
  | "select"
  | "position"
  | "rotation"
  | "color"
  | "tags"
  | "json"
  | "entityId"
  | "polygon"
  | "waypoints"
  | "scriptGraph";

/** Type-specific configuration for field widgets. */
export interface FieldConfig {
  /** Minimum value for number/slider fields */
  min?: number;
  /** Maximum value for number/slider fields */
  max?: number;
  /** Step increment for number/slider fields */
  step?: number;
  /** Unit suffix for display (e.g. "m", "deg") */
  unit?: string;
  /** Options for select fields */
  options?: Array<{ value: string; label: string }>;
  /** Entity type filter for entityId fields */
  referenceType?: string;
}

// ============== MARKER CONFIG ==============

/** Configures how an entity appears as a 3D marker in the viewport. */
export interface MarkerConfig {
  /** Shape of the marker geometry */
  shape: "capsule" | "cylinder" | "sphere" | "cube" | "billboard" | "model";
  /** Uniform scale multiplier */
  scale?: number;
  /** Vertical offset from terrain */
  yOffset?: number;
  /** Whether to show a radius ring */
  showRadius?: boolean;
  /** Which field provides the radius value */
  radiusField?: string;
}

// ============== TEMPLATES ==============

/** Pre-defined entity template for quick creation from the palette. */
export interface EntityTemplate {
  /** Template identifier */
  id: string;
  /** Display name */
  name: string;
  /** Optional description */
  description?: string;
  /** Default values that override the entity type defaults */
  defaults: Record<string, unknown>;
}

// ============== PALETTE & OUTLINER ==============

/** A category grouping in the entity palette sidebar. */
export interface PaletteCategorySchema {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Lucide icon name */
  icon: string;
  /** Short description */
  description: string;
}

/** A layer grouping in the outliner hierarchy tree. */
export interface OutlinerLayerSchema {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Lucide icon name */
  icon: string;
  /** Entity type IDs that belong to this layer */
  entityTypes: string[];
}

// ============== TERRAIN CONFIG ==============

/** Terrain module configuration for a game module. */
export interface TerrainModuleConfig {
  /** Whether terrain is enabled */
  enabled: boolean;
  /** Tile size in world units */
  tileSize: number;
  /** Available biome identifiers */
  biomes: string[];
  /** Whether procedural generation is supported */
  procgen: boolean;
}
