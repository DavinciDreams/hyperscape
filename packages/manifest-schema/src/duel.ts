/**
 * Duel manifest schema.
 *
 * Source of truth for duel rule definitions, equipment slot
 * labels/order, equipment slot → ECS slot mapping, and the challenge
 * timeout. Previously hardcoded in
 * `packages/shared/src/data/duel-manifest.ts`.
 *
 * Narrow literal unions `keyof DuelRules` and
 * `EquipmentSlotRestriction` stay defined in
 * `packages/shared/src/types/game/duel-types.ts` for exhaustive switch
 * ergonomics; the shared façade adds a runtime drift check that
 * manifest keys match the hardcoded literals.
 *
 * Extracted as part of Phase A11 of
 * `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import { z } from "zod";

export const DuelRuleDefinitionSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  incompatibleWith: z.array(z.string().min(1)),
});
export type DuelRuleDefinition = z.infer<typeof DuelRuleDefinitionSchema>;

export const DuelEquipmentSlotDefinitionSchema = z.object({
  label: z.string().min(1),
  order: z.number().int().min(0),
});
export type DuelEquipmentSlotDefinition = z.infer<
  typeof DuelEquipmentSlotDefinitionSchema
>;

export const DuelManifestSchema = z.object({
  $schema: z.literal("hyperforge.duel.v1"),
  /** Challenge timeout in milliseconds. */
  challengeTimeoutMs: z.number().int().positive(),
  /** Rule definitions keyed by `keyof DuelRules`. */
  rules: z.record(z.string().min(1), DuelRuleDefinitionSchema),
  /** Equipment slot definitions keyed by EquipmentSlotRestriction. */
  equipmentSlots: z.record(
    z.string().min(1),
    DuelEquipmentSlotDefinitionSchema,
  ),
  /** Maps duel equipment slot names to ECS EquipmentSlots property names. */
  duelSlotToEquipmentSlot: z.record(z.string().min(1), z.string().min(1)),
});
export type DuelManifest = z.infer<typeof DuelManifestSchema>;
