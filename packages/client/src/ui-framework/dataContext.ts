/**
 * dataContext.ts — bridge between the client's live stores and the
 * ui-framework runtime-bindings layer.
 *
 * The runtime-bindings expression language operates over a flat
 * `DataContext` shape: `{ player: {...}, inventory: {...}, ... }`.
 * This module is the one place that knows how to project the client's
 * internal state (world entities, event-driven stores, player-data
 * hook) into that shape, so every widget adapter can remain agnostic
 * of concrete event/store types.
 *
 * Namespaces currently exposed:
 *
 *   $player      player stats + health/prayer/combat level
 *   $inventory   items + coin count
 *   $equipment   slot → item map
 *   $skills      per-skill level/xp rows + totals
 *
 * Extend by adding a new namespace branch and projection helper — no
 * widget adapter changes required.
 */

import {
  SKILL_DEFINITIONS,
  type PlayerStats,
  type Skills,
} from "@hyperforge/shared";
import type { DataContext } from "@hyperforge/ui-framework";
import type { PlayerEquipmentItems } from "../types";
import type { InventorySlotViewItem } from "../game/types";

/**
 * Read-only subset of `PlayerDataState`. Callers only need the
 * values, not the React setters, so the bridge accepts this narrower
 * shape — `PlayerDataState` is structurally assignable to it.
 */
export interface PlayerDataSnapshot {
  inventory: InventorySlotViewItem[];
  equipment: PlayerEquipmentItems | null;
  playerStats: PlayerStats | null;
  coins: number;
}

/**
 * Player namespace — flattened onto the fields bindings reference.
 * Prefer explicit, bindable keys over nested wrapper objects so
 * expressions stay short and stable (`$player.hp` not
 * `$player.stats.health.current`).
 *
 * Fields are optional rather than `?? 0` defaulted. When a field is
 * unknown (pre-spawn, pre-first-stats event), leaving it omitted lets
 * the runtime bindings layer short-circuit to `undefined`, at which
 * point `resolveWidgetProps` keeps the instance's static fallback
 * value. Defaulting to `0` would instead overwrite the static prop
 * with zeros, which often violates the widget's Zod schema (e.g. HP
 * bar requires `max > 0`).
 */
interface PlayerNamespace {
  hp?: number;
  maxHp?: number;
  prayer?: number;
  maxPrayer?: number;
  combatLevel?: number;
  inCombat?: boolean;
}

interface InventoryNamespace {
  items: ReadonlyArray<{
    slot: number;
    itemId: string;
    quantity: number;
  }>;
  coins: number;
}

/**
 * Equipment is exposed two ways simultaneously:
 *
 * 1. As a flat slot map — bindings like `$equipment.mainhand.id` —
 *    convenient for single-slot widgets (e.g. HUD weapon icon).
 * 2. As `$equipment.items` — an array of `{slot, itemId, name}` rows
 *    matching the `hyperforge.panel.equipment` widget schema.
 *
 * The composite namespace is returned as a loosely-typed record so
 * the index signature and the `items` array key can coexist without
 * fighting TypeScript. The `DataContext` map accepts `unknown` values
 * so the runtime-bindings resolver handles both shapes fine.
 */
type EquipmentSlotValue = { id: string; name?: string } | null;
interface EquipmentItemsRow {
  slot: string;
  itemId: string | null;
  name?: string;
}
type EquipmentNamespace = Record<
  string,
  EquipmentSlotValue | ReadonlyArray<EquipmentItemsRow>
>;

function buildEquipmentNamespace(
  equipment: PlayerEquipmentItems | null,
): EquipmentNamespace {
  const out: EquipmentNamespace = {};
  const items: EquipmentItemsRow[] = [];
  if (equipment) {
    const slots = equipment as unknown as Record<string, EquipmentSlotValue>;
    for (const [slot, value] of Object.entries(slots)) {
      out[slot] = value;
      items.push({
        slot,
        itemId: value?.id ?? null,
        name: value?.name,
      });
    }
  }
  out.items = items;
  return out;
}

interface SkillsNamespace {
  items: ReadonlyArray<{
    key: string;
    label: string;
    icon: string;
    level: number;
    xp: number;
  }>;
  total: number;
  combatLevel: number;
}

/**
 * Project the player's skills state to the `$skills` namespace.
 * Falls back to `SKILL_DEFINITIONS` defaults when the live value is
 * missing (pre-first-stats event) so the widget always has a full
 * grid of rows to render.
 */
function buildSkillsNamespace(stats: PlayerStats | null): SkillsNamespace {
  const s: Partial<Skills> = stats?.skills ?? {};
  const items = SKILL_DEFINITIONS.map((def) => {
    const live = s[def.key];
    return {
      key: String(def.key),
      label: def.label,
      icon: def.icon,
      level: live?.level ?? def.defaultLevel,
      xp: live?.xp ?? 0,
    };
  });
  const total = items.reduce((sum, row) => sum + row.level, 0);
  const attack = s.attack?.level ?? 1;
  const strength = s.strength?.level ?? 1;
  const defense = s.defense?.level ?? 1;
  const constitution = s.constitution?.level ?? 10;
  const combatLevel = Math.floor(
    0.25 * (defense + constitution) + 0.325 * (attack + strength),
  );
  return { items, total, combatLevel };
}

/**
 * Build a `DataContext` from the client's player-data state. Safe to
 * call when `playerStats` is `null` — the namespace is still returned,
 * populated with zeros, so bindings like `$player.hp` resolve to `0`
 * rather than `undefined`.
 */
export function buildPlayerDataContext(state: PlayerDataSnapshot): DataContext {
  const playerStats: PlayerStats | null = state.playerStats;

  const player: PlayerNamespace = {};
  if (playerStats) {
    if (playerStats.health) {
      player.hp = playerStats.health.current;
      player.maxHp = playerStats.health.max;
    }
    if (playerStats.prayerPoints) {
      player.prayer = playerStats.prayerPoints.current;
      player.maxPrayer = playerStats.prayerPoints.max;
    }
    if (typeof playerStats.combatLevel === "number") {
      player.combatLevel = playerStats.combatLevel;
    }
    player.inCombat = Boolean(playerStats.inCombat);
  }

  const inventory: InventoryNamespace = {
    items: state.inventory,
    coins: state.coins,
  };

  // Equipment map is keyed by slot name (`mainhand`, `body`, …) AND
  // also exposes an `items` array matching the equipment widget's
  // schema. Both shapes are available via bindings.
  const equipment = buildEquipmentNamespace(state.equipment);

  const skills = buildSkillsNamespace(playerStats);

  return { player, inventory, equipment, skills };
}
