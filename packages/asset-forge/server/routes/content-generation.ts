/**
 * Content Generation API Routes
 * AI-powered content generation for NPCs, quests, dialogue, and lore
 */

import { Elysia, t } from "elysia";
import { ContentGenerationService } from "../services/ContentGenerationService";
import { aiWorldPopulationService } from "../services/AIWorldPopulationService";
import { aiQuestChainService } from "../services/AIQuestChainService";
import { aiNPCPersonalityService } from "../services/AINPCPersonalityService";
import { aiTerrainPromptService } from "../services/AITerrainPromptService";
import { gameModuleGenerationService } from "../services/GameModuleGenerationService";
import * as Models from "../models";

const contentGenService = new ContentGenerationService();

export const contentGenerationRoutes = new Elysia({
  prefix: "/api/content",
  name: "content-generation",
}).guard(
  {
    beforeHandle: ({ request }) => {
      console.log(
        `[ContentGeneration] ${request.method} ${new URL(request.url).pathname}`,
      );
    },
  },
  (app) =>
    app
      // GET /api/content/test - Simple test endpoint
      .get("/test", () => {
        return { message: "Content generation routes are working!" };
      })

      // POST /api/content/generate-dialogue
      .post(
        "/generate-dialogue",
        async ({ body }) => {
          try {
            console.log(
              `[ContentGeneration] Generating dialogue for NPC: ${body.npcName}`,
            );

            const result = await contentGenService.generateDialogue({
              npcName: body.npcName,
              npcPersonality: body.npcPersonality,
              context: body.context,
              existingNodes: body.existingNodes,
              quality: body.quality,
            });

            console.log(`[ContentGeneration] Successfully generated dialogue`);
            return result;
          } catch (error) {
            console.error(
              `[ContentGeneration] Error generating dialogue:`,
              error,
            );
            throw error;
          }
        },
        {
          body: Models.GenerateDialogueRequest,
          response: Models.GenerateDialogueResponse,
          detail: {
            tags: ["Content Generation"],
            summary: "Generate NPC dialogue",
            description:
              "Generate dialogue tree nodes for an NPC using AI. Supports existing dialogue context.",
          },
        },
      )

      // POST /api/content/generate-npc
      .post(
        "/generate-npc",
        async ({ body }) => {
          console.log(
            `[ContentGeneration] Generating NPC with archetype: ${body.archetype}`,
          );

          const result = await contentGenService.generateNPC({
            archetype: body.archetype,
            prompt: body.prompt,
            context: body.context,
            quality: body.quality,
          });

          return result;
        },
        {
          body: Models.GenerateNPCRequest,
          response: Models.GenerateNPCResponse,
          detail: {
            tags: ["Content Generation"],
            summary: "Generate complete NPC",
            description:
              "Generate a complete NPC character with personality, dialogue, and behavior using AI.",
          },
        },
      )

      // POST /api/content/generate-quest
      .post(
        "/generate-quest",
        async ({ body }) => {
          console.log(
            `[ContentGeneration] Generating ${body.difficulty} ${body.questType} quest`,
          );

          const result = await contentGenService.generateQuest({
            questType: body.questType,
            difficulty: body.difficulty,
            theme: body.theme,
            context: body.context,
            quality: body.quality,
          });

          return result;
        },
        {
          body: Models.GenerateQuestRequest,
          response: Models.GenerateQuestResponse,
          detail: {
            tags: ["Content Generation"],
            summary: "Generate game quest",
            description:
              "Generate a complete quest with objectives, rewards, and narrative using AI.",
          },
        },
      )

      // POST /api/content/generate-lore
      .post(
        "/generate-lore",
        async ({ body }) => {
          console.log(
            `[ContentGeneration] Generating lore: ${body.category} - ${body.topic}`,
          );

          const result = await contentGenService.generateLore({
            category: body.category,
            topic: body.topic,
            context: body.context,
            quality: body.quality,
          });

          return result;
        },
        {
          body: Models.GenerateLoreRequest,
          response: Models.GenerateLoreResponse,
          detail: {
            tags: ["Content Generation"],
            summary: "Generate game lore",
            description:
              "Generate rich lore content for world-building using AI.",
          },
        },
      )

      // POST /api/content/populate-world — AI world population
      .post(
        "/populate-world",
        async ({ body }) => {
          const result = await aiWorldPopulationService.populateWorld({
            module: body.module,
            terrainSummary: body.terrainSummary,
            existingEntities: body.existingEntities,
            instruction: body.instruction,
            mode: body.mode,
            maxPlacements: body.maxPlacements,
            quality: body.quality,
          });
          return result;
        },
        {
          body: t.Object({
            module: t.Any(),
            terrainSummary: t.Any(),
            existingEntities: t.Optional(t.Any()),
            instruction: t.String(),
            mode: t.Union([t.Literal("suggest"), t.Literal("auto")]),
            maxPlacements: t.Optional(t.Number()),
            quality: t.Optional(
              t.Union([
                t.Literal("quality"),
                t.Literal("speed"),
                t.Literal("balanced"),
              ]),
            ),
          }),
          detail: {
            tags: ["Content Generation"],
            summary: "AI world population",
            description:
              "Generate contextual entity placements using AI analysis of terrain and existing entities.",
          },
        },
      )

      // POST /api/content/generate-quest-chain — AI quest chain generation
      .post(
        "/generate-quest-chain",
        async ({ body }) => {
          const result = await aiQuestChainService.generateQuestChain({
            description: body.description,
            questCount: body.questCount,
            npcs: body.npcs,
            locations: body.locations,
            difficultyProgression: body.difficultyProgression,
            quality: body.quality,
          });
          return result;
        },
        {
          body: t.Object({
            description: t.String(),
            questCount: t.Number({ minimum: 1, maximum: 20 }),
            npcs: t.Optional(
              t.Array(
                t.Object({
                  id: t.String(),
                  name: t.String(),
                  location: t.Optional(t.String()),
                }),
              ),
            ),
            locations: t.Optional(
              t.Array(t.Object({ name: t.String(), type: t.String() })),
            ),
            difficultyProgression: t.Optional(
              t.Union([
                t.Literal("linear"),
                t.Literal("bell-curve"),
                t.Literal("escalating"),
              ]),
            ),
            quality: t.Optional(
              t.Union([
                t.Literal("quality"),
                t.Literal("speed"),
                t.Literal("balanced"),
              ]),
            ),
          }),
          detail: {
            tags: ["Content Generation"],
            summary: "Generate quest chain",
            description:
              "Generate a multi-quest storyline with NPC references and difficulty progression.",
          },
        },
      )

      // POST /api/content/generate-npc-personality — AI NPC personality generation
      .post(
        "/generate-npc-personality",
        async ({ body }) => {
          const result = await aiNPCPersonalityService.generateNPCPersonality({
            description: body.description,
            entityTypeId: body.entityTypeId,
            module: body.module,
            existingNpcs: body.existingNpcs,
            location: body.location,
            quality: body.quality,
          });
          return result;
        },
        {
          body: t.Object({
            description: t.String(),
            entityTypeId: t.String(),
            module: t.Any(),
            existingNpcs: t.Optional(
              t.Array(
                t.Object({
                  name: t.String(),
                  role: t.Optional(t.String()),
                }),
              ),
            ),
            location: t.Optional(t.String()),
            quality: t.Optional(
              t.Union([
                t.Literal("quality"),
                t.Literal("speed"),
                t.Literal("balanced"),
              ]),
            ),
          }),
          detail: {
            tags: ["Content Generation"],
            summary: "Generate NPC personality",
            description:
              "Generate a complete NPC with field values matching the entity type schema, dialogue, and backstory.",
          },
        },
      )

      // POST /api/content/generate-terrain-config — AI terrain from description
      .post(
        "/generate-terrain-config",
        async ({ body }) => {
          const result = await aiTerrainPromptService.generateTerrainConfig({
            description: body.description,
            worldSize: body.worldSize,
            quality: body.quality,
          });
          return result;
        },
        {
          body: t.Object({
            description: t.String(),
            worldSize: t.Optional(
              t.Union([
                t.Literal("small"),
                t.Literal("medium"),
                t.Literal("large"),
              ]),
            ),
            quality: t.Optional(
              t.Union([
                t.Literal("quality"),
                t.Literal("speed"),
                t.Literal("balanced"),
              ]),
            ),
          }),
          detail: {
            tags: ["Content Generation"],
            summary: "Generate terrain config from description",
            description:
              "Convert a natural language terrain description into WorldCreationConfig parameters, biome plan, and town placements.",
          },
        },
      )

      // POST /api/content/generate-game-module — AI game module generation
      .post(
        "/generate-game-module",
        async ({ body }) => {
          console.log(
            `[ContentGeneration] Generating game module: "${body.description.slice(0, 60)}..."`,
          );

          const result = await gameModuleGenerationService.generateGameModule({
            description: body.description,
            genre: body.genre,
            hints: body.hints,
          });

          console.log(
            `[ContentGeneration] Generated module "${result.module.name}" with ${result.module.entityTypes.length} entity types`,
          );

          return result;
        },
        {
          body: t.Object({
            description: t.String({ minLength: 10 }),
            genre: t.Optional(t.String()),
            hints: t.Optional(
              t.Object({
                entityCountRange: t.Optional(t.Tuple([t.Number(), t.Number()])),
                includeAudio: t.Optional(t.Boolean()),
                includeTerrain: t.Optional(t.Boolean()),
              }),
            ),
          }),
          detail: {
            tags: ["Content Generation"],
            summary: "Generate game module from description",
            description:
              "Generate a complete GameModule definition (entity types, palettes, layers, terrain) from a natural language game description using AI.",
          },
        },
      )

      // POST /api/content/refine-game-module — Iterative AI module refinement
      .post(
        "/refine-game-module",
        async ({ body }) => {
          console.log(
            `[ContentGeneration] Refining module "${body.currentModule.name}": "${body.instruction.slice(0, 60)}..."`,
          );

          const result = await gameModuleGenerationService.refineGameModule({
            currentModule: body.currentModule,
            instruction: body.instruction,
          });

          console.log(
            `[ContentGeneration] Refined module: ${result.changes.slice(0, 100)}`,
          );

          return result;
        },
        {
          body: t.Object({
            currentModule: t.Any(),
            instruction: t.String({ minLength: 3 }),
          }),
          detail: {
            tags: ["Content Generation"],
            summary: "Refine an existing game module",
            description:
              "Apply natural language changes to an existing GameModule definition using AI.",
          },
        },
      ),
);
