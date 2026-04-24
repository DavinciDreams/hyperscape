/**
 * Loot System - GDD Compliant (TICK-BASED)
 *
 * Orchestrates loot drops using modular services:
 * - LootTableService: Pure loot table logic and rolling
 * - GroundItemSystem: Shared ground item management
 *
 * OSRS-STYLE BEHAVIOR:
 * - Mob dies → Items drop directly to ground at tile center
 * - Items pile on same tile, stackables merge
 * - Click item directly to pick up (no loot window)
 * - 2 minute despawn timer per item
 *
 * @see https://oldschool.runescape.wiki/w/Loot
 * @see https://oldschool.runescape.wiki/w/Dropped_items
 */

import type {
  LootTablesManifest,
  DropCondition,
} from "@hyperforge/manifest-schema";

import type { World } from "../../../types/index";
import { EventType } from "../../../types/events";
import type { InventoryItem } from "../../../types/core/core";
import { SystemBase } from "../infrastructure/SystemBase";
import { groundToTerrain } from "../../../utils/game/EntityUtils";
import {
  getGroundItemDespawnTicks,
  getLootProtectionTicks,
} from "../../../data/live/combat-live";
import { ticksToMs } from "../../../utils/game/CombatCalculations";
import { LootTableRoller } from "../../../loot/LootTableRoller";
import { LootTableService } from "./LootTableService";
import type { GroundItemSystem } from "./GroundItemSystem";

/**
 * Runtime context passed to a `LootDropConditionEvaluator`. Carries
 * the mob type that died and (when known) the killer's character id,
 * so the evaluator can query player-scoped state like inventory,
 * quest progress, or skill level.
 */
export interface LootDropContext {
  readonly mobType: string;
  readonly killerId?: string;
}

/**
 * Predicate invoked by `LootSystem.rollLootFor` to gate every non-
 * `always` `DropCondition`. Return `true` to allow the entry to roll,
 * `false` to skip it. Throwing is caught at the callsite and treated
 * as `false` — plugin misbehavior never takes down the drop loop.
 */
export type LootDropConditionEvaluator = (
  condition: DropCondition,
  ctx: LootDropContext,
) => boolean;

/**
 * Default evaluator. `always` → true; every other kind → false. Safe-
 * by-default so unlocked plugin conditions never fire until a real
 * evaluator is installed via `setDropConditionEvaluator`.
 */
export const defaultDropConditionEvaluator: LootDropConditionEvaluator = (
  condition,
) => condition.kind === "always";

export class LootSystem extends SystemBase {
  private lootTableService: LootTableService;
  private groundItemSystem: GroundItemSystem | null = null;

  /**
   * Authored loot-tables roller. When a mob type has an entry in
   * `mobLootTableIds`, the authored roller is used in place of the
   * legacy `LootTableService` path. Populated via
   * `setAuthoredLootTables(manifest)` — normally driven by the editor
   * through `PIEEditorSession.updateManifests`.
   */
  private authoredRoller: LootTableRoller | null = null;

  /**
   * Per-mob-type pointer into the authored manifest. Key is `mobType`
   * (same key the legacy service uses); value is the `tableId` inside
   * the loaded manifest. Absence falls through to `lootTableService`.
   */
  private readonly mobLootTableIds = new Map<string, string>();

  /**
   * Pluggable `DropCondition` evaluator. Invoked by `rollLootFor` for
   * every non-`always` drop condition on a weighted entry. Returning
   * `false` skips that entry; `true` allows it through.
   *
   * Default: `always` → true, every other kind → false. Safe-by-default
   * so conditional drops never trigger until a plugin wires a real
   * evaluator (e.g., a QuestSystem-backed evaluator for `quest-active`).
   *
   * Evaluators that throw are treated as `false` at the callsite.
   */
  private dropConditionEvaluator: LootDropConditionEvaluator =
    defaultDropConditionEvaluator;

  constructor(world: World) {
    super(world, {
      name: "loot",
      dependencies: {
        required: ["ground-items"], // Depends on shared GroundItemSystem
        optional: ["inventory", "entity-manager", "ui", "client-graphics"],
      },
      autoCleanup: true,
    });

    // Initialize pure loot table service (no World dependencies)
    this.lootTableService = new LootTableService();
  }

  async init(): Promise<void> {
    // Get shared GroundItemSystem
    this.groundItemSystem =
      this.world.getSystem<GroundItemSystem>("ground-items") ?? null;
    if (!this.groundItemSystem) {
      console.warn(
        "[LootSystem] GroundItemSystem not found - mob loot drops disabled",
      );
    }

    // Subscribe to mob death events
    this.subscribe(
      EventType.NPC_DIED,
      (event: {
        mobId?: string;
        killerId?: string;
        mobType?: string;
        level?: number;
        killedBy?: string;
        position?: { x: number; y: number; z: number };
      }) => {
        // Validate event data
        if (!event || typeof event !== "object") {
          console.warn("[LootSystem] Invalid NPC_DIED event");
          return;
        }

        if (typeof event.mobId !== "string" || !event.mobId) {
          console.warn("[LootSystem] NPC_DIED missing mobId");
          return;
        }

        if (!event.position || typeof event.position !== "object") {
          console.warn("[LootSystem] NPC_DIED missing position");
          return;
        }

        const pos = event.position;
        if (
          typeof pos.x !== "number" ||
          typeof pos.y !== "number" ||
          typeof pos.z !== "number"
        ) {
          console.warn("[LootSystem] NPC_DIED invalid position");
          return;
        }

        const payload = {
          mobId: event.mobId,
          mobType:
            typeof event.mobType === "string" ? event.mobType : "unknown",
          level: typeof event.level === "number" ? event.level : 1,
          killedBy:
            typeof event.killerId === "string"
              ? event.killerId
              : typeof event.killedBy === "string"
                ? event.killedBy
                : "unknown",
          position: { x: pos.x, y: pos.y, z: pos.z },
        };

        this.handleMobDeath(payload);
      },
    );

    // NOTE: Ground item pickup is handled by InventorySystem via ITEM_PICKUP event
    // NOTE: Ground item despawn is handled by GroundItemSystem.processTick()
  }

  /**
   * Handle mob death and generate loot (OSRS-style ground items)
   *
   * Drops items directly to ground at tile center instead of creating
   * a corpse entity. Items can be picked up by clicking directly.
   */
  private async handleMobDeath(data: {
    mobId: string;
    mobType: string;
    level: number;
    killedBy: string;
    position: { x: number; y: number; z: number };
  }): Promise<void> {
    // Prefer authored roller when a manifest mapping exists for this mob
    // type; otherwise fall through to the legacy ALL_NPCS-backed service.
    const lootItems = this.rollLootFor(data.mobType, data.killedBy);
    if (lootItems.length === 0) {
      if (!this.lootTableService.hasLootTable(data.mobType)) {
        console.warn(
          `[LootSystem] No loot table found for mob type: ${data.mobType}`,
        );
      }
      return;
    }

    // Check if GroundItemSystem is available
    if (!this.groundItemSystem) {
      console.error(
        "[LootSystem] GroundItemSystem not available, cannot drop loot",
      );
      return;
    }

    // Convert loot items to InventoryItem format
    const inventoryItems: InventoryItem[] = lootItems.map((loot, index) => ({
      id: `mob_loot_${data.mobId}_${index}`,
      itemId: loot.itemId,
      quantity: loot.quantity,
      slot: index,
      metadata: null,
    }));

    // Ground position to terrain
    const groundedPosition = groundToTerrain(
      this.world,
      data.position,
      0.2,
      Infinity,
    );

    // OSRS-STYLE: Spawn ground items directly (no corpse entity)
    // Items pile at tile center, stackables merge, 2 minute despawn
    await this.groundItemSystem.spawnGroundItems(
      inventoryItems,
      groundedPosition,
      {
        despawnTime: ticksToMs(getGroundItemDespawnTicks()), // 2 minutes
        droppedBy: data.killedBy, // Killer gets loot protection
        lootProtection: ticksToMs(getLootProtectionTicks()), // 1 minute protection
        scatter: false, // Items pile at mob position tile center (OSRS-style)
      },
    );

    console.log(
      `[LootSystem] Dropped ${inventoryItems.length} ground items for ${data.mobType} killed by ${data.killedBy}`,
    );

    // Emit loot dropped event for any listeners
    this.emitTypedEvent(EventType.LOOT_DROPPED, {
      mobId: data.mobId,
      mobType: data.mobType,
      items: lootItems,
      position: data.position,
    });
  }

  /**
   * Roll loot for `mobType`. Resolves the authored roller first — if
   * a mapping exists and the roller is loaded, roll against it;
   * otherwise fall through to the legacy `LootTableService`.
   *
   * The authored roller needs a `RollContext`; since conditional-drop
   * plumbing (killer skill level, quest flags, etc.) isn't threaded
   * through the `NPC_DIED` event yet, we pass a permissive evaluator
   * that satisfies every condition. Callers that want condition-aware
   * rolling should switch to the richer authoring pipeline first.
   */
  public rollLootFor(
    mobType: string,
    killerId?: string,
  ): Array<{ itemId: string; quantity: number }> {
    const authoredTableId = this.mobLootTableIds.get(mobType);
    if (authoredTableId && this.authoredRoller?.has(authoredTableId)) {
      const dropCtx: LootDropContext = { mobType, killerId };
      return this.authoredRoller.roll(authoredTableId, {
        rng: Math.random,
        evaluateCondition: (condition) => {
          // Defensive: raw (non-schema-validated) manifests can arrive
          // with `condition: undefined` on individual entries. The
          // `LootTableSchema` default is `{ kind: "always", params: {} }`,
          // so an absent condition means "always drop".
          const resolved: DropCondition = condition ?? {
            kind: "always",
            params: {},
          };
          try {
            return this.dropConditionEvaluator(resolved, dropCtx);
          } catch (err) {
            this.logger.warn(
              `[LootSystem] drop-condition evaluator threw for kind="${resolved.kind}" — treating as false: ${err instanceof Error ? err.message : String(err)}`,
            );
            return false;
          }
        },
      });
    }
    return this.lootTableService.rollLoot(mobType);
  }

  /**
   * Install a custom drop-condition evaluator. Replaces the default
   * `always`-only evaluator. Pass `null` to restore the safe default.
   *
   * Typical wiring: a QuestSystem-aware plugin implements
   * `quest-active` / `quest-completed`, an InventorySystem-aware
   * plugin implements `has-item`, a StatsSystem plugin implements
   * `level-at-least`, and a registry-backed plugin dispatches the
   * `custom` kind by `params.id`.
   */
  public setDropConditionEvaluator(
    evaluator: LootDropConditionEvaluator | null,
  ): void {
    this.dropConditionEvaluator = evaluator ?? defaultDropConditionEvaluator;
  }

  /**
   * Replace the authored loot-table set. Pre-validated — callers
   * (editor / PIEEditorSession) must pass a `LootTablesManifest` that
   * already round-tripped through `LootTablesManifestSchema`.
   *
   * Pass `null` to clear and fall back to the legacy path for every
   * mob type.
   */
  public setAuthoredLootTables(manifest: LootTablesManifest | null): void {
    if (manifest === null) {
      this.authoredRoller = null;
      return;
    }
    if (this.authoredRoller === null) {
      this.authoredRoller = new LootTableRoller(manifest);
    } else {
      this.authoredRoller.load(manifest);
    }
  }

  /**
   * Bind a single `mobType → tableId` mapping. Takes effect
   * immediately; next `handleMobDeath` for `mobType` will roll
   * against the authored manifest.
   */
  public setMobLootTable(mobType: string, tableId: string): void {
    this.mobLootTableIds.set(mobType, tableId);
  }

  /**
   * Replace the whole mob-type → table-id map in one call. Every
   * mob type not present in `mappings` falls back to the legacy
   * service.
   */
  public setMobLootTableMappings(
    mappings: ReadonlyMap<string, string> | Record<string, string>,
  ): void {
    this.mobLootTableIds.clear();
    const pairs =
      mappings instanceof Map ? mappings.entries() : Object.entries(mappings);
    for (const [mobType, tableId] of pairs) {
      this.mobLootTableIds.set(mobType, tableId);
    }
  }

  /** Drop every authored mob→table mapping. */
  public resetMobLootTableMappings(): void {
    this.mobLootTableIds.clear();
  }

  /**
   * Public API for testing
   */
  public getLootTableCount(): number {
    return this.lootTableService.getLootTableCount();
  }

  destroy(): void {
    // GroundItemSystem cleanup is handled by the system itself
    // Call parent cleanup (handles event listeners)
    super.destroy();
  }
}
