/**
 * @deprecated Re-export shim.
 *
 * Combat handlers split between two homes:
 *   - `handleAttackPlayer`, `handleAttackMob` stay in `@hyperforge/shared`
 *     (dispatched inline from `ServerNetwork.registerHandlers()` after
 *     engine-side preprocessing).
 *   - `handleChangeAttackStyle`, `handleSetAutoRetaliate` migrated to
 *     `@hyperforge/hyperscape` (Phase F3 batch-6 of
 *     PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26).
 */

export {
  handleAttackPlayer,
  handleAttackMob,
} from "../../../../../shared/src/systems/server/network/handlers/combat";
export {
  handleChangeAttackStyle,
  handleSetAutoRetaliate,
} from "@hyperforge/hyperscape";
