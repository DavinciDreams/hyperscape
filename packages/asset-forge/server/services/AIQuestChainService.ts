/**
 * AIQuestChainService — AI-powered quest chain generation.
 *
 * Generates multi-quest storylines with NPC references, locations, and
 * difficulty progression. Uses `generateObject` for structured output.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { aiSDKService } from "./AISDKService";
import type { GameModule } from "../../src/gameModules/GameModule";
import { buildModuleSchemaContext } from "../utils/promptContextBuilder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuestChainRequest {
  description: string;
  questCount: number;
  npcs?: Array<{ id: string; name: string; location?: string }>;
  locations?: Array<{ name: string; type: string }>;
  difficultyProgression?: "linear" | "bell-curve" | "escalating";
  module?: GameModule;
  quality?: "quality" | "speed" | "balanced";
}

export interface QuestManifestEntry {
  id: string;
  title: string;
  description: string;
  questGiverId: string;
  questGiverName: string;
  location: string;
  difficulty: number;
  levelRequirement: number;
  previousQuestId: string | null;
  objectives: Array<{
    description: string;
    type: "kill" | "collect" | "talk" | "explore" | "escort" | "defend";
    target: string;
    count: number;
  }>;
  rewards: {
    experience: number;
    gold: number;
    items: string[];
  };
  dialogue: {
    intro: string;
    progress: string;
    completion: string;
  };
  storyBeat: string;
}

export interface QuestChainResponse {
  quests: QuestManifestEntry[];
  reasoning: string;
  npcSuggestions: Array<{
    name: string;
    role: string;
    location: string;
    reason: string;
  }>;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const questChainSchema = z.object({
  quests: z.array(
    z.object({
      id: z.string().describe("Unique quest identifier"),
      title: z.string().describe("Quest title"),
      description: z.string().describe("Quest description shown to the player"),
      questGiverId: z.string().describe("NPC ID who gives this quest"),
      questGiverName: z.string().describe("NPC name"),
      location: z.string().describe("Where this quest takes place"),
      difficulty: z.number().min(1).max(10).describe("Difficulty rating 1-10"),
      levelRequirement: z
        .number()
        .min(1)
        .max(100)
        .describe("Minimum player level"),
      previousQuestId: z
        .string()
        .nullable()
        .describe("ID of the prerequisite quest, or null for chain start"),
      objectives: z.array(
        z.object({
          description: z.string(),
          type: z.enum([
            "kill",
            "collect",
            "talk",
            "explore",
            "escort",
            "defend",
          ]),
          target: z.string(),
          count: z.number().int().min(1),
        }),
      ),
      rewards: z.object({
        experience: z.number().int().min(0),
        gold: z.number().int().min(0),
        items: z.array(z.string()),
      }),
      dialogue: z.object({
        intro: z.string().describe("What the NPC says to offer the quest"),
        progress: z
          .string()
          .describe("What the NPC says while quest is in progress"),
        completion: z.string().describe("What the NPC says on quest turn-in"),
      }),
      storyBeat: z
        .string()
        .describe("Narrative purpose of this quest in the chain"),
    }),
  ),
  reasoning: z.string().describe("Overall quest chain design reasoning"),
  npcSuggestions: z.array(
    z.object({
      name: z.string(),
      role: z.string().describe("Gameplay role: merchant, quest giver, etc."),
      location: z.string(),
      reason: z.string().describe("Why this NPC would enhance the quest chain"),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AIQuestChainService {
  async generateQuestChain(
    request: QuestChainRequest,
  ): Promise<QuestChainResponse> {
    const model = await aiSDKService.getConfiguredModel(
      request.quality ?? "quality",
    );

    const systemPrompt = this.buildSystemPrompt(request);
    const userPrompt = this.buildUserPrompt(request);

    const result = await generateObject({
      model,
      schema: questChainSchema,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.8,
    });

    // Validate quest chain linkage
    const quests = result.object.quests;
    const questIds = new Set(quests.map((q) => q.id));
    for (const quest of quests) {
      if (quest.previousQuestId && !questIds.has(quest.previousQuestId)) {
        quest.previousQuestId = null; // Fix broken references
      }
    }

    return {
      quests,
      reasoning: result.object.reasoning,
      npcSuggestions: result.object.npcSuggestions,
    };
  }

  private buildSystemPrompt(request: QuestChainRequest): string {
    let prompt = `You are a quest designer for an RPG game. Generate a quest chain — a series of connected quests that form a cohesive storyline.

## Quest Design Guidelines
- Each quest should have clear objectives with specific targets and counts
- Dialogue should feel natural and character-appropriate
- Difficulty should progress according to the specified pattern
- Rewards should scale with difficulty (more XP, gold, better items)
- Use previousQuestId to create a linear or branching chain
- Quest IDs should follow the pattern: quest_<chain_name>_<number>
- The first quest in the chain should have previousQuestId: null
- Story beats should advance the narrative arc (setup, rising action, climax, resolution)
- Suggest new NPCs that would enhance the quest chain but don't exist yet`;

    if (request.module) {
      prompt += `\n\n${buildModuleSchemaContext(request.module)}`;
    }

    return prompt;
  }

  private buildUserPrompt(request: QuestChainRequest): string {
    const parts: string[] = [
      `Generate a quest chain with ${request.questCount} quests.`,
      `\nDescription: "${request.description}"`,
    ];

    const progression = request.difficultyProgression ?? "linear";
    parts.push(`Difficulty progression: ${progression}`);

    if (request.npcs && request.npcs.length > 0) {
      parts.push(
        `\nExisting NPCs available:\n${request.npcs.map((n) => `- ${n.name} (${n.id})${n.location ? ` at ${n.location}` : ""}`).join("\n")}`,
      );
    }

    if (request.locations && request.locations.length > 0) {
      parts.push(
        `\nKnown locations:\n${request.locations.map((l) => `- ${l.name} (${l.type})`).join("\n")}`,
      );
    }

    return parts.join("\n");
  }
}

export const aiQuestChainService = new AIQuestChainService();
