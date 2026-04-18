/**
 * PIE shims — throwaway scaffolding that lets the GameMode contract
 * drive the PIE viewport until Phase 3 of the engine/game separation
 * replaces PlayTestWorld with an in-process server+client pair.
 *
 * @internal
 */

export { createPIEPawn } from "./createPIEPawn";
export { PIEOrbitCameraShim } from "./PIEOrbitCameraShim";
export {
  PIEInteractionRouterShim,
  type PIEInteractionRouterShimOptions,
} from "./PIEInteractionRouterShim";
