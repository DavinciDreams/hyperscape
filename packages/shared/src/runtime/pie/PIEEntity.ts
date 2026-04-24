/**
 * Lightweight entity record the editor iterates each frame to sync markers.
 *
 * PIEEditorSession mirrors server ECS entities into a `Map<string, PIEEntity>`
 * so the editor viewport doesn't have to walk the real World.entities tree.
 * This type used to live in `createPlayTestWorld.ts`; it was lifted out when
 * that file was removed so consumers still have a stable public home.
 */

import type { RuntimeScriptGraph } from "../../systems/shared/scripting/ScriptGraphInterpreter";

export interface PIEEntity {
  id: string;
  type: "player" | "mob" | "npc" | "resource" | "station";
  position: { x: number; y: number; z: number };
  rotation: number;
  name: string;
  /** Mob-specific: patrol center */
  patrolCenter?: { x: number; z: number };
  /** Mob-specific: patrol radius */
  patrolRadius?: number;
  /** Current movement target for patrol animation */
  moveTarget?: { x: number; z: number } | null;
  /** Mob-specific: mob ID from manifest */
  mobId?: string;
  /** Resource-specific: resource type */
  resourceType?: string;
  /** Station-specific: station type */
  stationType?: string;
  /** NPC-specific: NPC type */
  npcType?: string;
  /** Optional behavior graph attached to this entity (PIE-only). */
  behaviorGraph?: RuntimeScriptGraph;
  /**
   * Per-entity proximity-trigger state.
   * `true` = player is currently within `proximityRadius`; used to debounce
   * `player:nearby` so the trigger fires once per enter, not every tick.
   */
  _playerNearby?: boolean;
  /** Distance at which `player:nearby` fires. Defaults to 5 metres. */
  proximityRadius?: number;
}
