/**
 * Combat Handlers
 *
 * Polymorphic damage handling for different entity types.
 *
 * (Attack handler classes Melee/Ranged/Magic + AttackContext were
 * removed 2026-04-27 as orphan code — they had been parallel
 * implementations from a prior extraction attempt that never got
 * wired up. The active inbound-attack handlers live as
 * Combat{Melee,Ranged,Magic}AttackHandler.ts at the parent dir.)
 */

export type { DamageHandler, DamageApplicationResult } from "./DamageHandler";
export { PlayerDamageHandler } from "./PlayerDamageHandler";
export { MobDamageHandler } from "./MobDamageHandler";
