/**
 * Achievements manifest schema.
 *
 * Phase G3 of the World Studio AAA plan — authors describe discrete
 * player accomplishments that unlock on a scripted condition. Each
 * entry carries its own display metadata (name, description, icon,
 * rarity, points) plus a `trigger` specifying how the runtime knows
 * to award it.
 *
 * Triggers are intentionally thin — systems hook `achievements:progress`
 * / `achievements:award` events and decide when to fire. The manifest
 * only stores the *declaration* of what an achievement is, not the
 * wiring.
 */

import { z } from "zod";

export const AchievementRaritySchema = z.enum([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
]);
export type AchievementRarity = z.infer<typeof AchievementRaritySchema>;

/**
 * Event-based trigger — runtime hooks the named event and evaluates
 * `match` against the event payload. Kept loosely typed (unknown
 * `Record<string, number|string|boolean>`) because the schema doesn't
 * know the payload shape per event; validation happens where the
 * event is emitted.
 */
export const AchievementEventTriggerSchema = z.object({
  kind: z.literal("event"),
  event: z
    .string()
    .min(1)
    .describe("Typed event name emitted by some gameplay system"),
  /**
   * Optional payload filter — all key/value pairs must match (AND
   * semantics). Omitted = any payload awards the achievement.
   */
  match: z
    .record(z.string().min(1), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
});
export type AchievementEventTrigger = z.infer<
  typeof AchievementEventTriggerSchema
>;

/**
 * Count-based trigger — runtime keeps an internal counter per
 * achievement per player; each matching event increments until
 * `threshold` is reached.
 */
export const AchievementCountTriggerSchema = z.object({
  kind: z.literal("count"),
  event: z.string().min(1),
  match: z
    .record(z.string().min(1), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  threshold: z.number().int().positive(),
});
export type AchievementCountTrigger = z.infer<
  typeof AchievementCountTriggerSchema
>;

/**
 * Stat-threshold trigger — runtime watches a player-scoped stat
 * (e.g. `"skill.woodcutting.level"`) and awards when it reaches
 * `>= threshold`.
 */
export const AchievementStatTriggerSchema = z.object({
  kind: z.literal("stat"),
  stat: z.string().min(1),
  threshold: z.number(),
});
export type AchievementStatTrigger = z.infer<
  typeof AchievementStatTriggerSchema
>;

export const AchievementTriggerSchema = z.discriminatedUnion("kind", [
  AchievementEventTriggerSchema,
  AchievementCountTriggerSchema,
  AchievementStatTriggerSchema,
]);
export type AchievementTrigger = z.infer<typeof AchievementTriggerSchema>;

export const AchievementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  /** Hidden until unlocked — don't show in the list pre-unlock. */
  hidden: z.boolean().default(false),
  rarity: AchievementRaritySchema.default("common"),
  /** Gamerscore-style point value (>=0). */
  points: z.number().int().min(0).default(0),
  /** Icon asset reference (path or asset:// URL). */
  icon: z.string().min(1).optional(),
  /** Optional category for UI grouping. */
  category: z.string().min(1).optional(),
  /** Optional ids of achievements that must be unlocked first. */
  prerequisites: z.array(z.string().min(1)).default([]),
  trigger: AchievementTriggerSchema,
});
export type Achievement = z.infer<typeof AchievementSchema>;

export const AchievementsManifestSchema = z
  .array(AchievementSchema)
  .refine((list) => new Set(list.map((a) => a.id)).size === list.length, {
    message: "achievement ids must be unique",
  })
  .refine(
    (list) => {
      const ids = new Set(list.map((a) => a.id));
      return list.every((a) =>
        a.prerequisites.every((p) => ids.has(p) && p !== a.id),
      );
    },
    {
      message:
        "prerequisites must reference other achievements in this manifest (no self-reference)",
    },
  );
export type AchievementsManifest = z.infer<typeof AchievementsManifestSchema>;
