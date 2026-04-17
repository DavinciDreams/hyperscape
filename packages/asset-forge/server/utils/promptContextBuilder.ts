/**
 * promptContextBuilder — Builds structured context strings for LLM prompts.
 *
 * Provides world summaries (terrain, entities, biomes, towns) that AI services
 * can inject into system prompts for context-aware generation.
 */

import type {
  GameModule,
  EntityTypeSchema,
} from "../../src/gameModules/GameModule";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Summary of terrain state for LLM context. */
export interface TerrainSummary {
  /** World dimensions in tiles */
  worldSize: { width: number; height: number };
  /** Tile size in world units */
  tileSize: number;
  /** Total area in world units² */
  totalArea: number;
  /** Average elevation */
  avgElevation: number;
  /** Elevation range */
  elevationRange: { min: number; max: number };
  /** Biome distribution as name → percentage */
  biomes: Record<string, number>;
}

/** Summary of entity counts by type. */
export interface EntitySummary {
  /** Type ID → count */
  counts: Record<string, number>;
  /** Total entity count */
  total: number;
  /** Named locations (towns, POIs) */
  namedLocations: Array<{
    name: string;
    type: string;
    position?: { x: number; z: number };
  }>;
}

/** Full world context for LLM prompts. */
export interface WorldContext {
  terrain: TerrainSummary | null;
  entities: EntitySummary;
  module: { id: string; name: string; version: string };
}

// ---------------------------------------------------------------------------
// Context string builders
// ---------------------------------------------------------------------------

/**
 * Build a terrain summary string for LLM prompts.
 */
export function buildTerrainContext(terrain: TerrainSummary): string {
  const lines: string[] = [
    `## Terrain`,
    `- World size: ${terrain.worldSize.width}×${terrain.worldSize.height} tiles (${terrain.totalArea.toLocaleString()} sq units)`,
    `- Tile size: ${terrain.tileSize} units`,
    `- Elevation: avg ${terrain.avgElevation.toFixed(1)}, range [${terrain.elevationRange.min.toFixed(1)}, ${terrain.elevationRange.max.toFixed(1)}]`,
  ];

  const biomeEntries = Object.entries(terrain.biomes)
    .sort((a, b) => b[1] - a[1])
    .filter(([, pct]) => pct > 1);

  if (biomeEntries.length > 0) {
    lines.push(`- Biome distribution:`);
    for (const [biome, pct] of biomeEntries) {
      lines.push(`  - ${biome}: ${pct.toFixed(1)}%`);
    }
  }

  return lines.join("\n");
}

/**
 * Build an entity summary string for LLM prompts.
 */
export function buildEntityContext(
  entities: EntitySummary,
  module: GameModule,
): string {
  const lines: string[] = [`## Entities (${entities.total} total)`];

  // Group counts by entity type with display names
  const typeNames = new Map<string, string>();
  for (const et of module.entityTypes) {
    typeNames.set(et.id, et.name);
  }

  const countEntries = Object.entries(entities.counts)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 0);

  if (countEntries.length > 0) {
    for (const [typeId, count] of countEntries) {
      const displayName = typeNames.get(typeId) ?? typeId;
      lines.push(`- ${displayName}: ${count}`);
    }
  }

  if (entities.namedLocations.length > 0) {
    lines.push(`\n### Named Locations`);
    for (const loc of entities.namedLocations.slice(0, 20)) {
      const posStr = loc.position
        ? ` at (${loc.position.x.toFixed(0)}, ${loc.position.z.toFixed(0)})`
        : "";
      lines.push(`- ${loc.name} (${loc.type})${posStr}`);
    }
    if (entities.namedLocations.length > 20) {
      lines.push(`  ... and ${entities.namedLocations.length - 20} more`);
    }
  }

  return lines.join("\n");
}

/**
 * Build a module schema summary for LLM prompts.
 * Useful when the LLM needs to know what entity types and fields are available.
 */
export function buildModuleSchemaContext(module: GameModule): string {
  const lines: string[] = [
    `## Game Module: ${module.name} (v${module.version})`,
    ``,
    `### Entity Types`,
  ];

  for (const et of module.entityTypes) {
    lines.push(`\n#### ${et.name} (\`${et.id}\`)`);
    lines.push(`- Category: ${et.paletteCategory}`);
    lines.push(`- Spatial: ${et.spatial ? "yes" : "no"}`);
    lines.push(
      `- Storage: ${et.storage.stateRoot ?? "extendedLayers"}.${et.storage.stateKey}`,
    );

    if (et.fields.length > 0) {
      lines.push(`- Fields:`);
      for (const f of et.fields) {
        const req = f.required ? " (required)" : "";
        const extra = formatFieldExtra(f);
        lines.push(`  - \`${f.key}\`: ${f.type}${req}${extra} — ${f.label}`);
      }
    }
  }

  if (module.terrain?.enabled) {
    lines.push(`\n### Terrain`);
    lines.push(`- Tile size: ${module.terrain.tileSize}`);
    lines.push(`- Biomes: ${module.terrain.biomes.join(", ")}`);
    lines.push(`- Procgen: ${module.terrain.procgen ? "enabled" : "disabled"}`);
  }

  return lines.join("\n");
}

/**
 * Build the full world context string for an LLM system prompt.
 */
export function buildWorldContextPrompt(
  ctx: WorldContext,
  module: GameModule,
): string {
  const sections: string[] = [
    `# Current World State`,
    `Module: ${ctx.module.name} v${ctx.module.version}`,
  ];

  if (ctx.terrain) {
    sections.push(buildTerrainContext(ctx.terrain));
  }

  sections.push(buildEntityContext(ctx.entities, module));

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Entity summary extraction
// ---------------------------------------------------------------------------

/**
 * Extract an EntitySummary from the raw state layers.
 * Works with both typed Hyperia layers and dynamic module layers.
 */
export function extractEntitySummary(
  extendedLayers: Record<string, unknown>,
  audioLayers: Record<string, unknown>,
  entityTypes: EntityTypeSchema[],
): EntitySummary {
  const counts: Record<string, number> = {};
  const namedLocations: EntitySummary["namedLocations"] = [];
  let total = 0;

  // Build a stateKey → entityType map for name resolution
  const keyToType = new Map<string, EntityTypeSchema>();
  for (const et of entityTypes) {
    keyToType.set(et.storage.stateKey, et);
  }

  const processLayer = (layers: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(layers)) {
      if (!Array.isArray(value)) continue;

      const et = keyToType.get(key);
      const typeId = et?.id ?? key;
      const arr = value as Array<Record<string, unknown>>;
      counts[typeId] = (counts[typeId] ?? 0) + arr.length;
      total += arr.length;

      // Collect named entities for location context
      for (const entity of arr) {
        if (typeof entity.name === "string" && entity.name.length > 0) {
          const pos = entity.position as { x?: number; z?: number } | undefined;
          namedLocations.push({
            name: entity.name,
            type: et?.name ?? key,
            position:
              pos && typeof pos.x === "number" && typeof pos.z === "number"
                ? { x: pos.x, z: pos.z }
                : undefined,
          });
        }
      }
    }
  };

  processLayer(extendedLayers);
  processLayer(audioLayers);

  return { counts, total, namedLocations };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFieldExtra(f: {
  type: string;
  config?: { min?: number; max?: number; options?: Array<{ value: string }> };
}): string {
  const parts: string[] = [];
  if (f.config?.min !== undefined || f.config?.max !== undefined) {
    const min = f.config?.min ?? "−∞";
    const max = f.config?.max ?? "∞";
    parts.push(`[${min}..${max}]`);
  }
  if (f.config?.options && f.config.options.length > 0) {
    const vals = f.config.options.map((o) => o.value).slice(0, 6);
    const suffix = f.config.options.length > 6 ? ", ..." : "";
    parts.push(`{${vals.join("|")}${suffix}}`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}
