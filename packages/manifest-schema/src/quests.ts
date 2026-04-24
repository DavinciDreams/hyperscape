/**
 * Quests manifest schema.
 *
 * Covers `packages/server/world/assets/manifests/quests.json` — the catalog
 * of quest definitions. Each quest is keyed by its id at the top level.
 *
 * Stages are a discriminated union on `type`:
 *   - `dialogue` — talk to an NPC
 *   - `kill` — kill N mobs of a target type
 *   - `gather` — gather N items of a target id
 *   - `interact` — interact with N instances of a target object
 */

import { z } from "zod";

const ItemRefSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const DialogueStageSchema = z.object({
  type: z.literal("dialogue"),
  id: z.string().min(1),
  description: z.string(),
  npcId: z.string().min(1),
});

const KillStageSchema = z.object({
  type: z.literal("kill"),
  id: z.string().min(1),
  description: z.string(),
  target: z.string().min(1),
  count: z.number().int().positive(),
});

const GatherStageSchema = z.object({
  type: z.literal("gather"),
  id: z.string().min(1),
  description: z.string(),
  target: z.string().min(1),
  count: z.number().int().positive(),
});

const InteractStageSchema = z.object({
  type: z.literal("interact"),
  id: z.string().min(1),
  description: z.string(),
  target: z.string().min(1),
  count: z.number().int().positive(),
});

export const QuestStageSchema = z.discriminatedUnion("type", [
  DialogueStageSchema,
  KillStageSchema,
  GatherStageSchema,
  InteractStageSchema,
]);
export type QuestStage = z.infer<typeof QuestStageSchema>;

export const QuestRequirementsSchema = z.object({
  quests: z.array(z.string().min(1)),
  skills: z.record(z.string(), z.number().int().nonnegative()),
  items: z.array(ItemRefSchema),
});

export const QuestPlacementRulesSchema = z
  .object({
    placement: z.string().min(1),
    biomePreference: z.string().min(1).optional(),
    maxDistFromTown: z.number().nonnegative().optional(),
  })
  .passthrough();

export const QuestOnStartSchema = z
  .object({
    items: z.array(ItemRefSchema).optional(),
    dialogue: z.string().min(1).optional(),
  })
  .passthrough();

export const QuestRewardsSchema = z.object({
  questPoints: z.number().int().nonnegative(),
  items: z.array(ItemRefSchema),
  xp: z.record(z.string(), z.number().nonnegative()),
});

export const QuestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  difficulty: z
    .string()
    .min(1)
    .describe("novice / intermediate / experienced / master / grandmaster"),
  questPoints: z.number().int().nonnegative(),
  replayable: z.boolean(),
  requirements: QuestRequirementsSchema,
  startNpc: z.string().min(1),
  placementRules: QuestPlacementRulesSchema.optional(),
  stages: z.array(QuestStageSchema).nonempty(),
  onStart: QuestOnStartSchema,
  rewards: QuestRewardsSchema,
});
export type Quest = z.infer<typeof QuestSchema>;

/** The manifest is a record keyed by quest id. */
export const QuestsManifestSchema = z.record(z.string(), QuestSchema);
export type QuestsManifest = z.infer<typeof QuestsManifestSchema>;
