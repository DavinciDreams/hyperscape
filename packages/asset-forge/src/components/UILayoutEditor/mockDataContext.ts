/**
 * mockDataContext — realistic-but-fake `DataContext` for the editor
 * preview so bindings like `$player.hp` resolve to plausible values.
 *
 * The shape mirrors the live client's `buildPlayerDataContext` so
 * whatever resolves in the preview also resolves in-game.
 */

import type { DataContext } from "@hyperforge/ui-framework";

const mockInventoryItems = Array.from({ length: 14 }, (_, i) => ({
  slot: i,
  itemId: [
    "bronze_sword",
    "shrimp",
    "bread",
    "copper_ore",
    "tin_ore",
    "iron_ore",
    "logs",
    "bronze_axe",
    "bronze_pickaxe",
    "coins",
    "cooked_shrimp",
    "bucket_of_water",
    "thread",
    "leather",
  ][i],
  quantity: [1, 8, 3, 12, 6, 2, 24, 1, 1, 1_250, 5, 1, 10, 4][i],
}));

const mockEquipmentItems = [
  { slot: "head", itemId: "bronze_helm" },
  { slot: "neck", itemId: "amulet_of_strength" },
  { slot: "cape", itemId: "team_cape" },
  { slot: "mainhand", itemId: "bronze_sword" },
  { slot: "body", itemId: "bronze_chainmail" },
  { slot: "offhand", itemId: "bronze_shield" },
  { slot: "legs", itemId: "bronze_platelegs" },
  { slot: "gloves", itemId: "leather_gloves" },
  { slot: "feet", itemId: "leather_boots" },
  { slot: "ring", itemId: "gold_ring" },
];

const mockSkillsItems = [
  { id: "attack", level: 40, xp: 37224 },
  { id: "strength", level: 45, xp: 61512 },
  { id: "defence", level: 35, xp: 22406 },
  { id: "ranged", level: 30, xp: 13363 },
  { id: "prayer", level: 27, xp: 10000 },
  { id: "magic", level: 32, xp: 16456 },
  { id: "hitpoints", level: 48, xp: 80000 },
  { id: "agility", level: 20, xp: 4470 },
  { id: "herblore", level: 15, xp: 2500 },
  { id: "thieving", level: 18, xp: 3800 },
  { id: "crafting", level: 22, xp: 6500 },
  { id: "fletching", level: 25, xp: 8000 },
  { id: "mining", level: 42, xp: 45000 },
  { id: "smithing", level: 35, xp: 22000 },
  { id: "woodcutting", level: 50, xp: 100000 },
];

/**
 * Single canonical mock context for the editor. Stable across
 * renders (module-level constant) so widget memoization works.
 */
export const editorMockDataContext: DataContext = {
  $player: {
    hp: 34,
    maxHp: 48,
    prayer: 20,
    maxPrayer: 27,
    combatLevel: 52,
    name: "Preview Player",
  },
  $inventory: {
    items: mockInventoryItems,
    coins: 12_450,
  },
  $equipment: {
    items: mockEquipmentItems,
  },
  $skills: {
    items: mockSkillsItems,
    total: mockSkillsItems.reduce((sum, s) => sum + s.level, 0),
    combatLevel: 52,
  },
};
