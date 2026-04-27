/**
 * dataContext.ts — bridge between the client's live stores and the
 * ui-framework runtime-bindings layer.
 *
 * The runtime-bindings expression language operates over a flat
 * `DataContext` shape: `{ player: {...}, inventory: {...}, ... }`.
 * This module owns the host-side `DataSourceRegistry` instance and
 * registers the 4 built-in player namespaces against it. At render
 * time `buildPlayerDataContext` delegates to the registry's
 * `buildContext`, which projects the snapshot through every
 * registered source.
 *
 * Plugins can extend the surface without touching this file by
 * importing `playerDataSourceRegistry` and calling `.register({
 * key, build })` at boot time. New namespaces become available to
 * any layout binding immediately.
 *
 * Phase D8 — `DataSourceRegistry` was introduced 2026-04-27 (top-10
 * #7 cleanup). The legacy `buildPlayerDataContext` helper is kept as
 * a thin wrapper for callers that already import it (`ManifestHud`).
 *
 * Built-in namespaces:
 *
 *   $player      player stats + health/prayer/combat level
 *   $inventory   items + coin count
 *   $equipment   slot → item map + flat `items` array
 *   $skills      per-skill level/xp rows + totals
 */

import {
  SKILL_DEFINITIONS,
  type PlayerStats,
  type Skills,
} from "@hyperforge/shared";
import {
  DataSourceRegistry,
  type DataContext,
  type DataSource,
} from "@hyperforge/ui-framework";
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

// ============================================================================
// Namespace builders — one per built-in source.
// ============================================================================

function buildPlayerNamespace(
  playerStats: PlayerStats | null,
): PlayerNamespace {
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
  return player;
}

function buildInventoryNamespace(
  state: PlayerDataSnapshot,
): InventoryNamespace {
  return {
    items: state.inventory,
    coins: state.coins,
  };
}

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

// ============================================================================
// Built-in DataSource bindings.
// ============================================================================

const playerSource: DataSource<PlayerDataSnapshot, PlayerNamespace> = {
  key: "player",
  build: (state) => buildPlayerNamespace(state.playerStats),
};

const inventorySource: DataSource<PlayerDataSnapshot, InventoryNamespace> = {
  key: "inventory",
  build: buildInventoryNamespace,
};

const equipmentSource: DataSource<PlayerDataSnapshot, EquipmentNamespace> = {
  key: "equipment",
  build: (state) => buildEquipmentNamespace(state.equipment),
};

const skillsSource: DataSource<PlayerDataSnapshot, SkillsNamespace> = {
  key: "skills",
  build: (state) => buildSkillsNamespace(state.playerStats),
};

// ============================================================================
// Host-owned registry — extension surface for plugins.
// ============================================================================

/**
 * Singleton `DataSourceRegistry` instance owned by the client. Plugins
 * extend the bindings surface by importing this registry and calling
 * `.register({ key, build })` at boot time. The 4 built-in player
 * sources are registered eagerly below so existing layouts work
 * unchanged.
 */
export const playerDataSourceRegistry =
  new DataSourceRegistry<PlayerDataSnapshot>();

playerDataSourceRegistry.register(playerSource);
playerDataSourceRegistry.register(inventorySource);
playerDataSourceRegistry.register(equipmentSource);
playerDataSourceRegistry.register(skillsSource);

/**
 * Build a `DataContext` from the client's player-data state. Safe to
 * call when `playerStats` is `null` — the namespace is still returned,
 * populated with empty defaults, so bindings like `$player.hp`
 * resolve to `undefined` and widgets fall back to their static prop.
 *
 * Thin wrapper over `playerDataSourceRegistry.buildContext(state)`.
 * Kept as a named export for callers that already import it
 * (`ManifestHud`).
 */
export function buildPlayerDataContext(state: PlayerDataSnapshot): DataContext {
  return playerDataSourceRegistry.buildContext(state);
}
