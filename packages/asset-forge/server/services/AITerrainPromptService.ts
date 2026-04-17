/**
 * AITerrainPromptService — AI-powered terrain configuration from natural language.
 *
 * "Volcanic island with coastal villages" → WorldCreationConfig parameters
 * Uses Vercel AI SDK `generateObject` with Zod schemas for structured output.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { aiSDKService } from "./AISDKService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerrainConfigRequest {
  description: string;
  worldSize?: "small" | "medium" | "large";
  quality?: "quality" | "speed" | "balanced";
}

export interface TerrainConfigResponse {
  config: GeneratedTerrainConfig;
  biomePlan: BiomePlan[];
  townPlan: TownPlan[];
  reasoning: string;
}

export interface GeneratedTerrainConfig {
  seed?: number;
  worldWidth: number;
  worldDepth: number;
  heightScale: number;
  oceanLevel: number;
  mountainScale: number;
  hillFrequency: number;
  valleyDepth: number;
  coastalSmoothing: number;
  erosionPasses: number;
  plateauChance: number;
  riverCount: number;
}

export interface BiomePlan {
  biome: string;
  region: string;
  coverage: number;
  reasoning: string;
}

export interface TownPlan {
  name: string;
  type: string;
  approximatePosition: { x: number; z: number };
  size: "small" | "medium" | "large";
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Zod schema for structured output
// ---------------------------------------------------------------------------

const terrainConfigSchema = z.object({
  config: z.object({
    seed: z
      .number()
      .int()
      .optional()
      .describe("Random seed for reproducibility"),
    worldWidth: z
      .number()
      .int()
      .min(32)
      .max(512)
      .describe("World width in tiles"),
    worldDepth: z
      .number()
      .int()
      .min(32)
      .max(512)
      .describe("World depth in tiles"),
    heightScale: z.number().min(1).max(100).describe("Maximum terrain height"),
    oceanLevel: z
      .number()
      .min(0)
      .max(1)
      .describe("Sea level as fraction of height (0-1)"),
    mountainScale: z
      .number()
      .min(0)
      .max(1)
      .describe("Mountain prominence (0-1)"),
    hillFrequency: z.number().min(0).max(5).describe("Hill noise frequency"),
    valleyDepth: z
      .number()
      .min(0)
      .max(1)
      .describe("Valley carving depth (0-1)"),
    coastalSmoothing: z
      .number()
      .min(0)
      .max(1)
      .describe("Coastal terrain smoothing (0-1)"),
    erosionPasses: z
      .number()
      .int()
      .min(0)
      .max(10)
      .describe("Hydraulic erosion passes"),
    plateauChance: z
      .number()
      .min(0)
      .max(1)
      .describe("Chance of flat plateaus (0-1)"),
    riverCount: z
      .number()
      .int()
      .min(0)
      .max(20)
      .describe("Number of rivers to generate"),
  }),
  biomePlan: z.array(
    z.object({
      biome: z
        .string()
        .describe("Biome identifier (e.g., forest, desert, tundra)"),
      region: z
        .string()
        .describe(
          "Where this biome should be (e.g., 'northern mountains', 'coastal areas')",
        ),
      coverage: z
        .number()
        .min(0)
        .max(100)
        .describe("Approximate percentage of world covered"),
      reasoning: z.string().describe("Why this biome fits the description"),
    }),
  ),
  townPlan: z.array(
    z.object({
      name: z.string().describe("Town name"),
      type: z
        .string()
        .describe("Settlement type (village, town, city, outpost, camp)"),
      approximatePosition: z.object({
        x: z.number().min(0).max(1).describe("Normalized X position (0-1)"),
        z: z.number().min(0).max(1).describe("Normalized Z position (0-1)"),
      }),
      size: z.enum(["small", "medium", "large"]),
      reasoning: z.string().describe("Why this town is placed here"),
    }),
  ),
  reasoning: z.string().describe("Overall terrain design reasoning"),
});

// ---------------------------------------------------------------------------
// World size presets
// ---------------------------------------------------------------------------

const WORLD_SIZE_PRESETS = {
  small: { width: 64, depth: 64 },
  medium: { width: 128, depth: 128 },
  large: { width: 256, depth: 256 },
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AITerrainPromptService {
  async generateTerrainConfig(
    request: TerrainConfigRequest,
  ): Promise<TerrainConfigResponse> {
    const model = await aiSDKService.getConfiguredModel(
      request.quality ?? "balanced",
    );

    const sizePreset = WORLD_SIZE_PRESETS[request.worldSize ?? "medium"];

    const systemPrompt = `You are a procedural terrain design AI for a 3D game world editor. Given a natural language description of desired terrain, you generate terrain configuration parameters, biome distribution plans, and town placement plans.

## Terrain Parameters
- worldWidth/worldDepth: Grid dimensions in tiles (each tile is ~4 world units)
- heightScale: Maximum terrain elevation (1-100, typical: 15-40)
- oceanLevel: Sea level as fraction of heightScale (0 = no ocean, 0.3 = typical island)
- mountainScale: How prominent mountains are (0 = flat, 1 = extreme peaks)
- hillFrequency: Noise frequency for rolling hills (0 = smooth, 5 = very hilly)
- valleyDepth: How deep valleys are carved (0 = no valleys, 1 = deep gorges)
- coastalSmoothing: Smoothing near water edges (0 = jagged coast, 1 = smooth beaches)
- erosionPasses: Hydraulic erosion simulation (0 = none, 5+ = very eroded/realistic)
- plateauChance: Probability of flat mesa formations (0 = none, 0.5 = frequent)
- riverCount: Number of rivers (0-20)

## Guidelines
- Match the description's mood and setting
- Biome coverage should sum to ~100%
- Town positions are normalized 0-1 (will be scaled to world size)
- Place towns in logical locations (near water, on plains, at crossroads)
- Consider gameplay flow: starting areas should be accessible, harder areas further away`;

    const userPrompt = `Description: "${request.description}"
World size: ${request.worldSize ?? "medium"} (${sizePreset.width}×${sizePreset.depth} tiles)

Generate terrain configuration, biome plan, and town placement plan for this world.`;

    const result = await generateObject({
      model,
      schema: terrainConfigSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
    });

    const obj = result.object;

    // Override world dimensions to match preset
    obj.config.worldWidth = sizePreset.width;
    obj.config.worldDepth = sizePreset.depth;

    return {
      config: obj.config,
      biomePlan: obj.biomePlan,
      townPlan: obj.townPlan,
      reasoning: obj.reasoning,
    };
  }
}

export const aiTerrainPromptService = new AITerrainPromptService();
