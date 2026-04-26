/**
 * @deprecated Re-export shim.
 *
 * `ScriptQueue` relocated to `@hyperforge/hyperscape` (2026-04-26).
 * Server callers should import directly from `@hyperforge/hyperscape`
 * once the shim is removed in a follow-up cleanup.
 */

export {
  PlayerScriptQueue,
  NPCScriptQueue,
  ScriptPriority,
  ScriptType,
  type QueuedScript,
  type ModalState,
} from "@hyperforge/hyperscape";
