/**
 * PIE pawn factory.
 *
 * Wraps a `PIEEntity` + its viewport marker Object3D into a `Pawn`
 * instance the GameMode contract understands. Used by `PlayTestWorld`
 * when a `PlayerController` needs a pawn to possess.
 *
 * The returned `Pawn.position` is a live reference to the marker's
 * `object.position` Vector3 — controllers that mutate it (e.g. WASD
 * advancing position) move the on-screen marker directly. The companion
 * PIEEntity's position record is kept in sync from `tick()` in
 * `PlayTestWorld` so the script runtime continues to read fresh values.
 *
 * Deliberately thin: no possession side-effects, no pointer handling.
 * PIE is not UE5, and Phase 3 will replace this shim when the real
 * in-process server+client pair lands.
 *
 * @internal
 */

import type { Object3D } from "three";
import type { Pawn } from "../../gameMode/pawns/Pawn";

/**
 * Construct a Pawn that references `object`'s transform. `possess` and
 * `unpossess` are no-ops — the PIE viewport has no possession concept
 * beyond the fact that the controller is attached.
 */
export function createPIEPawn(id: string, object: Object3D): Pawn {
  return {
    id,
    object,
    position: object.position,
    possess: () => {
      /* no-op in PIE */
    },
    unpossess: () => {
      /* no-op in PIE */
    },
  };
}
