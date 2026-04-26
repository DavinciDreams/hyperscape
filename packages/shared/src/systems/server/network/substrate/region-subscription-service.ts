/**
 * Engine substrate — `IRegionSubscriptionService`.
 *
 * Per `PLAN_ENGINE_API_EXTRACTION.md` Phase A3. Captures the
 * pubsub-topic subscription management that ServerNetwork's
 * `updatePlayerRegionSubscriptions` + `resubscribePlayerRegionTopics`
 * private methods own today.
 *
 * Why the substrate needs this: plugin-side movement code
 * (TileMovementManager, post-migration) needs to keep a player's
 * region pubsub subscriptions in sync as they walk between regions.
 * Today that's done by calling ServerNetwork's private methods
 * via a closure captured at construction time. Lifting the surface
 * to a substrate interface lets plugin code resolve it via
 * `world.regionSubscriptions` lookup, decoupling movement from
 * ServerNetwork's instance identity.
 *
 * Concrete impl: ServerNetwork keeps the spectator-tracking state
 * (`spectatorsByPlayer` map) and the per-socket pubsub adapter
 * lookup (`getUwsAdapterForPlayer`) — both are tightly tied to the
 * uWS transport and the connection-handler's spectator wiring. The
 * concrete impl that ServerNetwork instantiates in Phase B will
 * delegate into those ServerNetwork-internal services.
 *
 * Boot order: same as the rest of the substrate — the concrete
 * instance is constructed in `ServerNetwork`'s constructor (Phase B,
 * future commit) and pinned to `world.regionSubscriptions`. By the
 * time any plugin onEnable runs (server: between register and init,
 * PIE: after init), the property is populated.
 */

/**
 * Region pubsub-topic subscription manager. Updates a player's
 * subscribed region topics (and any spectators that follow them)
 * when the player crosses region boundaries.
 */
export interface IRegionSubscriptionService {
  /**
   * Player crossed from `oldKey` → `newKey`. Computes the 3-region
   * subscribe/unsubscribe delta against the spatial index and applies
   * it to the player's pubsub adapter (if any) plus any spectators
   * following the player.
   *
   * Safe to call with `oldKey === newKey` (no-op).
   */
  updatePlayerRegionSubscriptions(
    playerId: string,
    oldKey: number,
    newKey: number,
  ): void;

  /**
   * Full 9-region resubscription, used when a player jumps regions
   * (teleport, respawn) so the small-delta path doesn't apply. Unsubs
   * the entire old 3×3 grid and subs the entire new 3×3 grid against
   * the player's pubsub adapter; also updates spectators.
   */
  resubscribePlayerRegionTopics(
    playerId: string,
    oldKey: number,
    worldX: number,
    worldZ: number,
  ): void;
}
