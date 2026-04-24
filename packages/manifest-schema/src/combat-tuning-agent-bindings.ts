/**
 * Per-agent combat-tuning profile bindings manifest.
 *
 * Pairs a `characterId` (the in-world player / NPC id the
 * DuelOrchestrator resolves) with a `profileId` defined inside the
 * `CombatTuningManifest`. A `null` value explicitly clears any
 * previously authored binding for that character — useful when the
 * editor wants to roll back an override without deleting the manifest
 * entry entirely.
 *
 * Cross-manifest integrity (every non-null `profileId` resolves to an
 * entry in the loaded combat-tuning manifest) is validated at install
 * time inside the orchestrator, not at schema-parse time, because the
 * combat-tuning manifest isn't visible from this schema's scope.
 */

import { z } from "zod";

/**
 * `Record<characterId, profileId | null>`.
 *
 * `characterId` is a non-empty string. `profileId` is either a
 * non-empty string (bind) or `null` (explicit clear).
 */
export const CombatTuningAgentBindingsManifestSchema = z.record(
  z.string().min(1),
  z.union([z.string().min(1), z.null()]),
);
export type CombatTuningAgentBindingsManifest = z.infer<
  typeof CombatTuningAgentBindingsManifestSchema
>;
