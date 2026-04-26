/**
 * @deprecated Re-export shim.
 *
 * All combat handlers relocated to `@hyperforge/hyperscape`.
 *  - `handleAttackPlayer` / `handleAttackMob` migrated via the
 *    `ICombatAttackService` substrate (Phase F3 batch-9, 2026-04-26).
 *    `ServerNetwork.onAttackPlayer` inline block calls
 *    `world.combatAttackService?.attackPlayer(...)` after engine-side
 *    range-check preprocessing.
 *  - `handleChangeAttackStyle` / `handleSetAutoRetaliate` migrated as
 *    pure server-only handlers (Phase F3 batch-6, 2026-04-26).
 */

export {
  handleAttackPlayer,
  handleAttackMob,
  handleChangeAttackStyle,
  handleSetAutoRetaliate,
} from "@hyperforge/hyperscape";
