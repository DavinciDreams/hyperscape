/**
 * GameModuleGenerationService — AI-powered GameModule generation.
 *
 * User describes a game in natural language, the LLM generates a complete
 * GameModule JSON validated against the loader. Uses Vercel AI SDK
 * `generateObject` with Zod schemas for structured output.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { aiSDKService } from "./AISDKService";
import { loadGameModule } from "../../src/gameModules/GameModuleLoader";
import type { GameModule } from "../../src/gameModules/GameModule";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerateGameModuleRequest {
  description: string;
  genre?: string;
  hints?: {
    entityCountRange?: [number, number];
    includeAudio?: boolean;
    includeTerrain?: boolean;
  };
}

export interface GenerateGameModuleResponse {
  module: GameModule;
  reasoning: string;
}

export interface RefineGameModuleRequest {
  currentModule: GameModule;
  instruction: string;
}

export interface RefineGameModuleResponse {
  module: GameModule;
  changes: string;
}

// ---------------------------------------------------------------------------
// Zod schema matching GameModule interface
// ---------------------------------------------------------------------------

const fieldConfigSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    unit: z.string().optional(),
    options: z
      .array(
        z.object({
          value: z.string(),
          label: z.string(),
        }),
      )
      .optional(),
    referenceType: z.string().optional(),
  })
  .optional();

const fieldSchema = z.object({
  key: z.string().describe("Property key on the entity data object"),
  label: z.string().describe("Human-readable label"),
  type: z
    .enum([
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
    ])
    .describe("Widget type to render"),
  section: z.string().describe("Section heading for grouping in editor"),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  readOnly: z.boolean().optional(),
  description: z.string().optional(),
  config: fieldConfigSchema,
});

const markerSchema = z.object({
  shape: z
    .enum(["capsule", "cylinder", "sphere", "cube", "billboard", "model"])
    .describe("Shape of the 3D marker geometry"),
  scale: z.number().optional(),
  yOffset: z.number().optional(),
  showRadius: z.boolean().optional(),
  radiusField: z.string().optional(),
});

const entityTypeSchema = z.object({
  id: z.string().describe("Unique type identifier (e.g. 'enemy', 'pickup')"),
  name: z.string().describe("Human-readable name"),
  icon: z
    .string()
    .describe(
      "Lucide icon name (e.g. 'User', 'Skull', 'Gem', 'MapPin', 'Sword', 'Shield', 'Heart', 'Star', 'Flag', 'Box', 'Zap', 'Flame', 'TreePine', 'Mountain', 'Building2', 'Music')",
    ),
  color: z.string().describe("Hex color for markers and UI (e.g. '#ef4444')"),
  paletteCategory: z.string().describe("Must match a paletteCategories[].id"),
  outlinerLayer: z.string().describe("Must match an outlinerLayers[].id"),
  selectionType: z.string().describe("Unique selection type string"),
  storage: z.object({
    stateKey: z.string().describe("Key in the state store"),
    type: z.enum(["array", "scalar"]),
    stateRoot: z
      .enum(["extendedLayers", "audioLayers"])
      .optional()
      .describe("Defaults to extendedLayers"),
  }),
  spatial: z.boolean().describe("Whether this entity has a world position"),
  tracksSource: z.boolean().optional(),
  fields: z.array(fieldSchema),
  defaults: z
    .record(z.string(), z.unknown())
    .describe("Default values for new entities"),
  marker: markerSchema,
});

const paletteCategorySchema = z.object({
  id: z.string().describe("Unique identifier"),
  label: z.string().describe("Display label"),
  icon: z.string().describe("Lucide icon name"),
  description: z.string().describe("Short description"),
});

const outlinerLayerSchema = z.object({
  id: z.string().describe("Unique identifier"),
  label: z.string().describe("Display label"),
  icon: z.string().describe("Lucide icon name"),
  entityTypes: z
    .array(z.string())
    .describe("Entity type IDs that belong to this layer"),
});

const terrainSchema = z
  .object({
    enabled: z.boolean(),
    tileSize: z.number(),
    biomes: z.array(z.string()),
    procgen: z.boolean(),
  })
  .optional();

const gameModuleSchema = z.object({
  id: z.string().describe("Unique module identifier (kebab-case)"),
  name: z.string().describe("Human-readable display name"),
  version: z.string().describe("Semantic version string (e.g. '1.0.0')"),
  entityTypes: z.array(entityTypeSchema),
  paletteCategories: z.array(paletteCategorySchema),
  outlinerLayers: z.array(outlinerLayerSchema),
  terrain: terrainSchema,
  reasoning: z
    .string()
    .describe("Explanation of the design choices made for this game module"),
});

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a game design AI that generates complete GameModule definitions for a 3D game engine editor.

## GameModule Interface

A GameModule declares all entity types, palette categories, outliner layers, and terrain config for a game.

### Key Concepts:
- **Entity Types**: Define what kinds of objects exist in the game world (enemies, pickups, NPCs, spawn points, etc.)
- **Palette Categories**: Groups in the entity creation sidebar (e.g. "Characters", "Environment", "Gameplay")
- **Outliner Layers**: Groups in the hierarchy tree (similar to palette categories but for the scene tree)
- **Fields**: Each entity type has typed fields that appear in the property editor
- **Markers**: Each entity type has a 3D marker shape for viewport visualization
- **Storage**: Each entity type maps to a state key where instances are stored

### Valid Field Types:
string, number, slider, boolean, select, position, rotation, color, tags, json, entityId, polygon, waypoints

### Valid Marker Shapes:
capsule, cylinder, sphere, cube, billboard, model

### Valid Lucide Icon Names (use these only):
User, Users, Skull, Gem, MapPin, Sword, Shield, Heart, Star, Flag, Box, Zap, Flame, TreePine, Mountain, Building2, Music, Volume2, Bell, Globe, Map, Landmark, AlertTriangle, Waves, Package, Hexagon, Circle, Square, Triangle, Target, Crosshair, Eye, Camera, Layers, Grid, Compass, Navigation, Route, Waypoints, Home, Castle, Crown, Wand2, Sparkles, Rocket, Car, Plane, Ship, Anchor, Key, Lock, Unlock, Gift, Coins, Wallet, ShoppingBag, Wrench, Hammer, Paintbrush, Palette, Leaf, Flower, Sun, Moon, Cloud, Snowflake, Droplet, Wind

### Example (trimmed Hyperscape module):

\`\`\`json
{
  "id": "hyperscape",
  "name": "Hyperscape",
  "version": "0.2.0",
  "paletteCategories": [
    { "id": "npcs", "label": "NPCs", "icon": "Users", "description": "Non-player characters" },
    { "id": "creatures", "label": "Creatures", "icon": "Skull", "description": "Mob spawns and encounters" },
    { "id": "world-features", "label": "World Features", "icon": "Globe", "description": "Spawn points, teleports" },
    { "id": "resources", "label": "Resources", "icon": "Gem", "description": "Gathering nodes" }
  ],
  "outlinerLayers": [
    { "id": "npcs", "label": "NPCs", "icon": "Users", "entityTypes": ["npc"] },
    { "id": "creatures", "label": "Creatures", "icon": "Skull", "entityTypes": ["mobSpawn"] },
    { "id": "world-features", "label": "World Features", "icon": "Globe", "entityTypes": ["spawnPoint", "teleport"] },
    { "id": "resources", "label": "Resources", "icon": "Gem", "entityTypes": ["resource"] }
  ],
  "entityTypes": [
    {
      "id": "npc",
      "name": "NPC",
      "icon": "User",
      "color": "#3b82f6",
      "paletteCategory": "npcs",
      "outlinerLayer": "npcs",
      "selectionType": "npc",
      "storage": { "stateKey": "npcs", "type": "array" },
      "spatial": true,
      "fields": [
        { "key": "name", "label": "Name", "type": "string", "section": "General", "required": true, "default": "NPC" },
        { "key": "npcTypeId", "label": "NPC Type", "type": "string", "section": "General", "required": true },
        { "key": "rotation", "label": "Rotation", "type": "rotation", "section": "Transform", "default": 0 },
        { "key": "position", "label": "Position", "type": "position", "section": "Transform", "default": { "x": 0, "y": 0, "z": 0 } }
      ],
      "defaults": { "name": "NPC", "npcTypeId": "", "rotation": 0, "position": { "x": 0, "y": 0, "z": 0 } },
      "marker": { "shape": "capsule", "scale": 1, "yOffset": 0.5 }
    },
    {
      "id": "mobSpawn",
      "name": "Mob Spawn",
      "icon": "Skull",
      "color": "#f97316",
      "paletteCategory": "creatures",
      "outlinerLayer": "creatures",
      "selectionType": "mobSpawn",
      "storage": { "stateKey": "mobSpawns", "type": "array" },
      "spatial": true,
      "fields": [
        { "key": "name", "label": "Name", "type": "string", "section": "General", "required": true, "default": "Mob Spawn" },
        { "key": "mobId", "label": "Mob ID", "type": "string", "section": "General", "required": true },
        { "key": "maxCount", "label": "Max Count", "type": "number", "section": "Spawning", "default": 3, "config": { "min": 1, "max": 50, "step": 1 } },
        { "key": "spawnRadius", "label": "Spawn Radius", "type": "number", "section": "Spawning", "default": 5, "config": { "min": 1, "max": 100, "step": 1, "unit": "m" } },
        { "key": "position", "label": "Position", "type": "position", "section": "Transform", "default": { "x": 0, "y": 0, "z": 0 } }
      ],
      "defaults": { "name": "Mob Spawn", "mobId": "", "maxCount": 3, "spawnRadius": 5, "position": { "x": 0, "y": 0, "z": 0 } },
      "marker": { "shape": "sphere", "scale": 0.8, "yOffset": 1, "showRadius": true, "radiusField": "spawnRadius" }
    },
    {
      "id": "spawnPoint",
      "name": "Spawn Point",
      "icon": "MapPin",
      "color": "#22c55e",
      "paletteCategory": "world-features",
      "outlinerLayer": "world-features",
      "selectionType": "spawnPoint",
      "storage": { "stateKey": "spawnPoints", "type": "array" },
      "spatial": true,
      "fields": [
        { "key": "name", "label": "Name", "type": "string", "section": "General", "required": true, "default": "Spawn Point" },
        { "key": "spawnType", "label": "Spawn Type", "type": "select", "section": "General", "required": true, "default": "initial", "config": { "options": [{ "value": "initial", "label": "Initial Spawn" }, { "value": "death-respawn", "label": "Death Respawn" }] } },
        { "key": "position", "label": "Position", "type": "position", "section": "Transform", "default": { "x": 0, "y": 0, "z": 0 } }
      ],
      "defaults": { "name": "Spawn Point", "spawnType": "initial", "position": { "x": 0, "y": 0, "z": 0 } },
      "marker": { "shape": "capsule", "scale": 1, "yOffset": 0.5 }
    },
    {
      "id": "resource",
      "name": "Resource",
      "icon": "Gem",
      "color": "#eab308",
      "paletteCategory": "resources",
      "outlinerLayer": "resources",
      "selectionType": "resource",
      "storage": { "stateKey": "resources", "type": "array" },
      "spatial": true,
      "fields": [
        { "key": "name", "label": "Name", "type": "string", "section": "General", "required": true, "default": "Resource" },
        { "key": "resourceId", "label": "Resource ID", "type": "string", "section": "General", "required": true },
        { "key": "resourceType", "label": "Type", "type": "select", "section": "General", "required": true, "default": "mining", "config": { "options": [{ "value": "mining", "label": "Mining" }, { "value": "woodcutting", "label": "Woodcutting" }, { "value": "fishing", "label": "Fishing" }] } },
        { "key": "position", "label": "Position", "type": "position", "section": "Transform", "default": { "x": 0, "y": 0, "z": 0 } }
      ],
      "defaults": { "name": "Resource", "resourceId": "", "resourceType": "mining", "position": { "x": 0, "y": 0, "z": 0 } },
      "marker": { "shape": "cube", "scale": 0.6, "yOffset": 0.3 }
    }
  ],
  "terrain": { "enabled": true, "tileSize": 4, "biomes": ["plains", "forest", "desert", "snow"], "procgen": true }
}
\`\`\`

## Rules

1. Generate entity types appropriate to the described game genre and theme
2. Every entityType.paletteCategory must reference an existing paletteCategories[].id
3. Every entityType.outlinerLayer must reference an existing outlinerLayers[].id
4. Every outlinerLayers[].entityTypes must list the entity type IDs that belong to it
5. All entity type IDs and selectionTypes must be unique
6. Use kebab-case for the module id, camelCase for entity type ids and stateKeys
7. Every spatial entity should have "position" and usually "rotation" fields in the "Transform" section
8. Every entity should have a "name" field in the "General" section
9. Use diverse marker shapes and colors to distinguish entity types visually
10. Include meaningful defaults for all fields
11. Generate 6-15 entity types depending on the game's complexity
12. Group entity types into 3-6 palette categories that make sense for the game
13. Include terrain config if the game has outdoor environments
14. Use hex colors from the Tailwind palette for consistency (e.g. #ef4444, #3b82f6, #22c55e, #f97316, #8b5cf6, #06b6d4, #eab308, #ec4899, #14b8a6)
15. Assign appropriate marker shapes: capsule for characters, sphere for spawners, cube for objects, cylinder for zones, billboard for markers
16. Fields should have descriptive descriptions and appropriate config (min/max for numbers, options for selects)`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;

export class GameModuleGenerationService {
  /**
   * Generate a complete GameModule from a text description.
   * Uses `generateObject` for structured output, then validates with `loadGameModule`.
   * Retries with a repair prompt on validation failure (up to MAX_RETRIES).
   */
  async generateGameModule(
    request: GenerateGameModuleRequest,
  ): Promise<GenerateGameModuleResponse> {
    const model = await aiSDKService.getConfiguredModel("quality");

    const userPrompt = this.buildGeneratePrompt(request);

    let lastError = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const prompt =
        attempt === 0
          ? userPrompt
          : `${userPrompt}\n\n## REPAIR: Previous attempt failed validation\nError: ${lastError}\nPlease fix the issue and regenerate the complete module.`;

      console.log(
        `[GameModuleGeneration] Attempt ${attempt + 1}/${MAX_RETRIES + 1} for "${request.description.slice(0, 60)}..."`,
      );

      const result = await generateObject({
        model,
        schema: gameModuleSchema,
        system: SYSTEM_PROMPT,
        prompt,
        temperature: 0.7,
      });

      const generated = result.object;

      // Extract reasoning before validating
      const reasoning = generated.reasoning;

      // Remove reasoning from the module data (it's not part of GameModule)
      const moduleData = { ...generated } as Record<string, unknown>;
      delete moduleData.reasoning;

      try {
        const validatedModule = loadGameModule(moduleData);
        console.log(
          `[GameModuleGeneration] Successfully generated module "${validatedModule.name}" with ${validatedModule.entityTypes.length} entity types`,
        );

        return {
          module: validatedModule,
          reasoning,
        };
      } catch (err) {
        lastError =
          err instanceof Error ? err.message : "Unknown validation error";
        console.warn(
          `[GameModuleGeneration] Validation failed (attempt ${attempt + 1}): ${lastError}`,
        );

        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Failed to generate valid GameModule after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}`,
          );
        }
      }
    }

    // Should never reach here but TypeScript needs it
    throw new Error("Unexpected end of generation loop");
  }

  /**
   * Refine an existing GameModule with a natural language instruction.
   */
  async refineGameModule(
    request: RefineGameModuleRequest,
  ): Promise<RefineGameModuleResponse> {
    const model = await aiSDKService.getConfiguredModel("quality");

    const refinementSchema = gameModuleSchema.extend({
      changes: z.string().describe("Summary of what was changed and why"),
    });

    // Remove 'reasoning' since we're adding 'changes' instead
    const prompt = `## Current Module

\`\`\`json
${JSON.stringify(request.currentModule, null, 2)}
\`\`\`

## Refinement Instruction

${request.instruction}

Apply the requested changes to the module. Keep everything that isn't mentioned unchanged. Return the complete updated module.`;

    console.log(
      `[GameModuleGeneration] Refining module "${request.currentModule.name}" with instruction: "${request.instruction.slice(0, 60)}..."`,
    );

    let lastError = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const refinedPrompt =
        attempt === 0
          ? prompt
          : `${prompt}\n\n## REPAIR: Previous attempt failed validation\nError: ${lastError}\nPlease fix the issue.`;

      const result = await generateObject({
        model,
        schema: refinementSchema,
        system: SYSTEM_PROMPT,
        prompt: refinedPrompt,
        temperature: 0.5,
      });

      const generated = result.object;
      const changes = generated.changes;

      const moduleData = { ...generated } as Record<string, unknown>;
      delete moduleData.reasoning;
      delete moduleData.changes;

      try {
        const validatedModule = loadGameModule(moduleData);
        console.log(
          `[GameModuleGeneration] Successfully refined module "${validatedModule.name}"`,
        );

        return {
          module: validatedModule,
          changes,
        };
      } catch (err) {
        lastError =
          err instanceof Error ? err.message : "Unknown validation error";
        console.warn(
          `[GameModuleGeneration] Refinement validation failed (attempt ${attempt + 1}): ${lastError}`,
        );

        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Failed to refine GameModule after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}`,
          );
        }
      }
    }

    throw new Error("Unexpected end of refinement loop");
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildGeneratePrompt(request: GenerateGameModuleRequest): string {
    const parts: string[] = [];

    parts.push(`## Game Description\n\n${request.description}`);

    if (request.genre) {
      parts.push(`\n## Genre\n\n${request.genre}`);
    }

    if (request.hints) {
      const hints: string[] = [];
      if (request.hints.entityCountRange) {
        hints.push(
          `Target entity type count: ${request.hints.entityCountRange[0]}-${request.hints.entityCountRange[1]}`,
        );
      }
      if (request.hints.includeAudio) {
        hints.push(
          "Include audio entity types (music zones, ambient sounds, SFX triggers)",
        );
      }
      if (request.hints.includeTerrain !== undefined) {
        hints.push(
          request.hints.includeTerrain
            ? "Include terrain configuration with relevant biomes"
            : "Do not include terrain configuration",
        );
      }
      if (hints.length > 0) {
        parts.push(`\n## Hints\n\n${hints.join("\n")}`);
      }
    }

    parts.push(
      "\nGenerate a complete GameModule definition for this game. Include diverse entity types with meaningful fields, appropriate palette categories, and outliner layers.",
    );

    return parts.join("\n");
  }
}

export const gameModuleGenerationService = new GameModuleGenerationService();
