/**
 * CombatPlayerQueries — read-only player query helpers used by the
 * combat system.
 *
 * Wraps the four read-then-translate helpers that CombatSystem uses
 * during attack resolution + rune consumption:
 *
 *   - `getPlayerSkillLevel` — reads `stats` component, normalizes
 *     legacy plain-number vs. `{ level }` shapes
 *   - `getPlayerSelectedSpell` — reads the player's currently-armed
 *     autocast spell from entity data
 *   - `getPlayerInventoryItems` — flattens the inventory system's
 *     PlayerInventory into a stable `{ itemId, quantity, slot }`
 *     shape used by combat rune-checking
 *   - `consumeRunesForSpell` — atomically removes the configured
 *     rune-cost items for a spell cast
 *
 * Extracted from CombatSystem.ts as the second slice of the system's
 * decomposition (item #9 in PROGRESS_AUDIT, after CombatEventEmitter).
 *
 * Coupling shape: takes a `world` reference + an inventory-system
 * accessor closure. Doesn't keep state. The host system holds one
 * instance and delegates each `this.getPlayerFoo(...)` callsite to
 * it: `this.playerQueries.getPlayerFoo(...)`.
 */

import type { Item, PlayerInventory, World } from "@hyperforge/shared";
import { runeService } from "./RuneService.js";
import type { Spell } from "./SpellService.js";

/** Inventory system surface this helper depends on. */
interface InventorySystemDuck {
  getInventory(playerId: string): PlayerInventory | undefined;
  removeItemDirect(
    playerId: string,
    item: { itemId: string; quantity: number; slot?: number },
  ): Promise<boolean>;
}

export class CombatPlayerQueries {
  private readonly world: World;
  private readonly getInventorySystem: () => InventorySystemDuck | undefined;

  constructor(
    world: World,
    getInventorySystem: () => InventorySystemDuck | undefined,
  ) {
    this.world = world;
    this.getInventorySystem = getInventorySystem;
  }

  /**
   * Read a player's level for a specific combat skill. Falls back to
   * `1` when the player isn't found, has no `stats` component, or the
   * skill isn't present in `stats.data`.
   */
  getPlayerSkillLevel(
    playerId: string,
    skill: "ranged" | "magic" | "defense",
  ): number {
    // Use world.getPlayer() to ensure consistency with PlayerSystem.
    const playerEntity = this.world.getPlayer?.(playerId);
    if (!playerEntity) return 1;

    const statsComponent = playerEntity.getComponent("stats");
    if (!statsComponent?.data) return 1;

    const stats = statsComponent.data as Record<
      string,
      { level: number } | number
    >;
    const skillData = stats[skill];

    if (typeof skillData === "object" && skillData !== null) {
      return skillData.level ?? 1;
    }
    if (typeof skillData === "number") {
      return skillData;
    }
    return 1;
  }

  /** Get the player's currently-armed autocast spell, or null. */
  getPlayerSelectedSpell(playerId: string): string | null {
    // Use world.getPlayer() to ensure we get the same player entity as PlayerSystem.
    const playerEntity = this.world.getPlayer?.(playerId);
    if (!playerEntity?.data) return null;

    return (
      (playerEntity.data as { selectedSpell?: string }).selectedSpell ?? null
    );
  }

  /**
   * Flatten the inventory into a stable `{ itemId, quantity, slot }`
   * array. Returns an empty array when the inventory system isn't
   * available or the player has no inventory.
   */
  getPlayerInventoryItems(
    playerId: string,
  ): Array<{ itemId: string; quantity: number; slot: number }> {
    const inventorySystem = this.getInventorySystem();
    if (!inventorySystem) return [];

    const inventory = inventorySystem.getInventory(playerId);
    if (!inventory?.items) return [];

    return inventory.items
      .filter((item) => item.itemId)
      .map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity ?? 1,
        slot: item.slot,
      }));
  }

  /**
   * Atomically remove the configured rune-cost items for a spell.
   * No-op when the inventory system isn't available. Async to match
   * the inventory system's removal API.
   */
  async consumeRunesForSpell(
    playerId: string,
    spell: Spell,
    weapon: Item | null,
  ): Promise<void> {
    const inventorySystem = this.getInventorySystem();
    if (!inventorySystem) return;

    const runesToConsume = runeService.getRunesToConsume(spell.runes, weapon);

    for (const requirement of runesToConsume) {
      await inventorySystem.removeItemDirect(playerId, {
        itemId: requirement.runeId,
        quantity: requirement.quantity,
      });
    }
  }
}
