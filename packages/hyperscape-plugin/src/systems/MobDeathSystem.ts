/**
 * MobDeathSystem — handles mob death: despawn via ENTITY_DEATH event.
 *
 * Migrated 2026-04-24 from `packages/shared/src/systems/shared/combat/`
 * into `@hyperforge/hyperscape` as the first slice of the
 * Hyperscape→meta-plugin extraction. This system is gameplay-specific
 * (the despawn behavior is a game decision, not an engine primitive)
 * so it belongs in the Hyperscape plugin rather than `@hyperforge/shared`.
 *
 * Registration happens via the meta-plugin's `onEnable` hook, which
 * receives a `HyperscapeContext.world` and calls
 * `world.register("mob-death", MobDeathSystem)`. The plugin's scope
 * disposer runs `world.unregister?.("mob-death")` (or no-op if the
 * world doesn't expose unregister) so a clean session.stop()
 * tears down the registration.
 *
 * No behavior change vs. the pre-migration version — same imports,
 * same event subscription, same despawn logic. The only semantic
 * change is *who registers it*.
 */

import type { World } from "@hyperforge/shared";
import { EventType, SystemBase } from "@hyperforge/shared";

/** Handles mob death: despawn via ENTITY_DEATH event */
export class MobDeathSystem extends SystemBase {
  constructor(world: World) {
    super(world, {
      name: "mob-death",
      dependencies: { required: [], optional: [] },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {
    this.subscribe(
      EventType.ENTITY_DEATH,
      (data: {
        entityId: string;
        killedBy: string;
        entityType: "player" | "mob";
      }) => this.handleMobDeath(data),
    );
  }

  private handleMobDeath(data: {
    entityId: string;
    killedBy: string;
    entityType: "player" | "mob";
  }): void {
    if (data.entityType !== "mob") {
      return;
    }

    const mobId = data.entityId;

    // Handle mob death (despawn, drops, etc.)
    this.despawnMob(mobId);
  }

  private despawnMob(mobId: string): void {
    // Remove mob entity from world
    const mobEntity = this.world.entities?.get?.(mobId);
    if (mobEntity) {
      // Emit despawn event for other systems
      this.emitTypedEvent(EventType.MOB_NPC_DESPAWN, { mobId });

      // Remove from entity manager
      if (this.world.entities && "remove" in this.world.entities) {
        (this.world.entities as { remove: (id: string) => void }).remove(mobId);
      } else {
        this.logger.error(
          "Cannot despawn mob: entities.remove not available",
          undefined,
          { mobId },
        );
      }
    }
  }

  override destroy(): void {
    super.destroy();
  }
}
