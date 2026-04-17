/**
 * AINPCPersonalityService — AI-powered NPC personality & data generation.
 *
 * Module-aware: generates field values matching the active GameModule's
 * NPC entity type schema (e.g., faction select → valid option).
 * Uses `generateObject` with dynamically-built Zod schemas.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { aiSDKService } from "./AISDKService";
import type {
  GameModule,
  EntityTypeSchema,
} from "../../src/gameModules/GameModule";
import { zodSchemaFromFields } from "../utils/zodSchemaFromFields";
import { buildModuleSchemaContext } from "../utils/promptContextBuilder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NPCPersonalityRequest {
  description: string;
  entityTypeId: string;
  module: GameModule;
  existingNpcs?: Array<{ name: string; role?: string }>;
  location?: string;
  quality?: "quality" | "speed" | "balanced";
}

export interface NPCPersonalityResponse {
  entityData: Record<string, unknown>;
  dialogue: {
    greeting: string;
    farewell: string;
    idle: string[];
    questAccept?: string;
    questDecline?: string;
  } | null;
  backstory: string;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Static Zod schema for the wrapper
// ---------------------------------------------------------------------------

const dialogueSchema = z
  .object({
    greeting: z.string().describe("What the NPC says when approached"),
    farewell: z.string().describe("What the NPC says when leaving"),
    idle: z.array(z.string()).describe("Random idle chatter lines (3-5)"),
    questAccept: z
      .string()
      .optional()
      .describe("Response when player accepts a quest"),
    questDecline: z
      .string()
      .optional()
      .describe("Response when player declines a quest"),
  })
  .nullable()
  .describe("Dialogue lines, or null if not applicable");

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AINPCPersonalityService {
  async generateNPCPersonality(
    request: NPCPersonalityRequest,
  ): Promise<NPCPersonalityResponse> {
    const model = await aiSDKService.getConfiguredModel(
      request.quality ?? "quality",
    );

    // Find the entity type schema in the module
    const entitySchema = request.module.entityTypes.find(
      (et) => et.id === request.entityTypeId,
    );

    if (!entitySchema) {
      throw new Error(
        `Entity type "${request.entityTypeId}" not found in module "${request.module.id}"`,
      );
    }

    // Build a dynamic Zod schema from the entity type's fields
    const entityFieldsSchema = zodSchemaFromFields(entitySchema.fields);

    // Compose the full output schema
    const outputSchema = z.object({
      entityData: entityFieldsSchema.describe(
        "Entity field values matching the schema",
      ),
      dialogue: dialogueSchema,
      backstory: z.string().describe("2-3 sentence character backstory"),
      reasoning: z.string().describe("Design reasoning for this NPC"),
    });

    const systemPrompt = this.buildSystemPrompt(request, entitySchema);
    const userPrompt = this.buildUserPrompt(request, entitySchema);

    const result = await generateObject({
      model,
      schema: outputSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.8,
    });

    return {
      entityData: result.object.entityData as Record<string, unknown>,
      dialogue: result.object.dialogue,
      backstory: result.object.backstory,
      reasoning: result.object.reasoning,
    };
  }

  private buildSystemPrompt(
    request: NPCPersonalityRequest,
    entitySchema: EntityTypeSchema,
  ): string {
    const fieldDescriptions = entitySchema.fields
      .filter((f) => !f.readOnly)
      .map((f) => {
        let desc = `- ${f.key} (${f.type}): ${f.label}`;
        if (f.config?.options) {
          desc += ` [options: ${f.config.options.map((o) => o.value).join(", ")}]`;
        }
        if (f.config?.min !== undefined || f.config?.max !== undefined) {
          desc += ` [range: ${f.config?.min ?? "−∞"}..${f.config?.max ?? "∞"}]`;
        }
        if (f.required) desc += " (REQUIRED)";
        return desc;
      })
      .join("\n");

    return `You are an NPC character designer for a game. Generate a complete NPC personality with field values that match the entity type schema.

## Entity Type: ${entitySchema.name} (${entitySchema.id})

### Available Fields
${fieldDescriptions}

## Guidelines
- Generate values for ALL non-read-only fields
- For "select" fields, ONLY use the provided options
- For "number" and "slider" fields, stay within the min/max range
- Create distinctive, memorable characters
- Names should fit the game's tone and setting
- If the entity has a "faction" or similar field, make the character's personality consistent with it
- Include dialogue that reflects the character's personality
- Backstory should justify the character's current role and location`;
  }

  private buildUserPrompt(
    request: NPCPersonalityRequest,
    entitySchema: EntityTypeSchema,
  ): string {
    const parts: string[] = [
      `Generate a ${entitySchema.name} NPC based on this description: "${request.description}"`,
    ];

    if (request.location) {
      parts.push(`Location: ${request.location}`);
    }

    if (request.existingNpcs && request.existingNpcs.length > 0) {
      parts.push(
        `\nExisting NPCs (avoid duplicating):\n${request.existingNpcs.map((n) => `- ${n.name}${n.role ? ` (${n.role})` : ""}`).join("\n")}`,
      );
    }

    parts.push(
      `\nMake this character unique and interesting. Generate appropriate values for all schema fields.`,
    );

    return parts.join("\n");
  }
}

export const aiNPCPersonalityService = new AINPCPersonalityService();
