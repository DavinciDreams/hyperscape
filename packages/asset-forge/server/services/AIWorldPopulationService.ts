/**
 * AIWorldPopulationService — AI-powered entity placement for worlds.
 *
 * Two modes:
 * - "suggest": User instruction ("Place a village near the river") → placement list
 * - "auto": Analyze terrain grid → contextual placements per region
 *
 * Uses Vercel AI SDK `generateObject` with Zod schemas for structured output.
 */

import { generateObject } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import { aiSDKService } from "./AISDKService";
import type { GameModule } from "../../src/gameModules/GameModule";
import {
  buildTerrainContext,
  buildEntityContext,
  buildModuleSchemaContext,
  type TerrainSummary,
  type EntitySummary,
} from "../utils/promptContextBuilder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityPlacement {
  entityTypeId: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  data: Record<string, unknown>;
  reasoning: string;
}

export interface PopulateWorldRequest {
  module: GameModule;
  terrainSummary: TerrainSummary;
  existingEntities?: EntitySummary;
  instruction: string;
  mode: "suggest" | "auto";
  maxPlacements?: number;
  quality?: "quality" | "speed" | "balanced";
}

export interface PopulateWorldResponse {
  placements: EntityPlacement[];
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Zod schema for structured output
// ---------------------------------------------------------------------------

const placementSchema = z.object({
  placements: z.array(
    z.object({
      entityTypeId: z
        .string()
        .describe("Entity type ID from the module schema"),
      name: z.string().describe("Display name for this entity instance"),
      position: z.object({
        x: z.number().describe("World X coordinate"),
        y: z.number().describe("World Y coordinate (elevation)"),
        z: z.number().describe("World Z coordinate"),
      }),
      rotation: z.number().min(0).max(360).describe("Rotation in degrees"),
      data: z
        .record(z.string(), z.unknown())
        .describe("Entity-specific field values matching the type schema"),
      reasoning: z.string().describe("Why this entity was placed here"),
    }),
  ),
  reasoning: z
    .string()
    .describe("Overall reasoning for the placement strategy"),
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AIWorldPopulationService {
  /**
   * Generate entity placements for a world based on instruction or auto-analysis.
   */
  async populateWorld(
    request: PopulateWorldRequest,
  ): Promise<PopulateWorldResponse> {
    const model = await aiSDKService.getConfiguredModel(
      request.quality ?? "balanced",
    );

    const systemPrompt = this.buildSystemPrompt(request);
    const userPrompt = this.buildUserPrompt(request);

    const maxPlacements = request.maxPlacements ?? 50;

    const result = await generateObject({
      model,
      schema: placementSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
    });

    // Clamp to max and filter invalid entity types
    const validTypeIds = new Set(request.module.entityTypes.map((et) => et.id));
    const placements = result.object.placements
      .filter((p) => validTypeIds.has(p.entityTypeId))
      .slice(0, maxPlacements);

    return {
      placements,
      reasoning: result.object.reasoning,
    };
  }

  private buildSystemPrompt(request: PopulateWorldRequest): string {
    const schemaContext = buildModuleSchemaContext(request.module);

    return `You are a game level designer AI. Your job is to place entities in a 3D game world to create engaging, believable environments.

${schemaContext}

## Rules
- Only use entity type IDs from the module schema above
- Place entities at realistic positions considering terrain elevation and biome
- Vary entity names for uniqueness
- Include proper field values matching each entity type's schema
- Consider spatial relationships: NPCs near buildings, resources in appropriate biomes, guards at entrances
- Avoid placing entities too close together (minimum ~3 world units apart)
- Position Y values should approximate terrain height (use 0 if unknown)
- Rotation should vary for visual interest (0-360 degrees)`;
  }

  private buildUserPrompt(request: PopulateWorldRequest): string {
    const parts: string[] = [];

    parts.push(buildTerrainContext(request.terrainSummary));

    if (request.existingEntities) {
      parts.push(buildEntityContext(request.existingEntities, request.module));
    }

    if (request.mode === "suggest") {
      parts.push(
        `\n## Instruction\n${request.instruction}\n\nPlace entities according to this instruction. Be specific about positions and include relevant field data.`,
      );
    } else {
      parts.push(
        `\n## Auto-Populate Mode\nAnalyze the terrain and existing entities, then populate the world with appropriate entities. Create a diverse, game-ready environment.\n\nAdditional guidance: ${request.instruction || "Fill the world with a balanced mix of all entity types."}`,
      );
    }

    const maxPlacements = request.maxPlacements ?? 50;
    parts.push(`\nGenerate up to ${maxPlacements} entity placements.`);

    return parts.join("\n\n");
  }
}

export const aiWorldPopulationService = new AIWorldPopulationService();
