/**
 * useManifestLoader — Fetches game manifests from the Asset Forge API
 *
 * Loads all game manifests (NPCs, items, quests, stores, stations, combat,
 * recipes, gathering, progression, arenas, config) on mount. Converts raw
 * manifest data into typed shapes for the entity palette, property editors,
 * and manifest browser. Dispatches to WorldStudioContext.
 */

import { useEffect, useRef } from "react";

import type {
  ManifestNPC,
  ManifestStation,
  ManifestMiningRock,
  ManifestTree,
  ManifestFishingSpot,
  ManifestItem,
  ManifestQuest,
  ManifestStore,
  ManifestCombatSpell,
  ManifestPrayer,
  ManifestRune,
  ManifestAmmunition,
  ManifestRecipe,
  ManifestSkillUnlock,
  ManifestTierRequirement,
  ManifestDuelArena,
  ManifestLODSettings,
} from "../types";
import { useWorldStudio } from "../WorldStudioContext";

// ============== RAW MANIFEST TYPES ==============

interface RawNPC {
  id: string;
  name: string;
  description: string;
  category: string;
  levelRange: [number, number];
  combat?: { attackable?: boolean };
  movement?: { type?: string };
  appearance?: {
    modelPath?: string;
    iconPath?: string;
    scale?: number;
  };
  services?: {
    enabled: boolean;
    types: string[];
  };
  [key: string]: unknown;
}

interface RawStation {
  type: string;
  name: string;
  model: string;
  examine: string;
}

interface RawMiningRock {
  id: string;
  name: string;
  type: string;
  modelPath: string;
  levelRequired: number;
  examine: string;
}

interface RawTree {
  id: string;
  name: string;
  type: string;
  modelVariants: string[];
  levelRequired: number;
  examine: string;
}

interface RawFishingSpot {
  id: string;
  name: string;
  type: string;
  toolRequired: string;
  levelRequired: number;
  examine: string;
}

interface RawItem {
  id: string;
  name: string;
  type?: string;
  tier?: string;
  value?: number;
  weight?: number;
  equipSlot?: string;
  description?: string;
  examine?: string;
  tradeable?: boolean;
  stackable?: boolean;
  rarity?: string;
  modelPath?: string;
  iconPath?: string;
  levelRequired?: number;
  bonuses?: Record<string, number>;
  [key: string]: unknown;
}

interface RawQuestStage {
  id: string;
  type: string;
  description: string;
  npcId?: string;
  target?: string;
  count?: number;
  location?: string;
}

interface RawQuest {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  questPoints: number;
  replayable?: boolean;
  startNpc?: string;
  requirements?: {
    quests?: string[];
    skills?: Record<string, number>;
    items?: string[];
  };
  stages: RawQuestStage[];
  rewards?: {
    questPoints?: number;
    items?: Array<{ itemId: string; quantity: number }>;
    xp?: Record<string, number>;
  };
}

interface RawStoreItem {
  id: string;
  itemId: string;
  name: string;
  price: number;
  stockQuantity: number;
  restockTime?: number;
  description?: string;
  category?: string;
}

interface RawStore {
  id: string;
  name: string;
  buyback?: boolean;
  buybackRate?: number;
  description?: string;
  items: RawStoreItem[];
}

interface RawCombatSpell {
  id: string;
  name: string;
  level: number;
  baseMaxHit: number;
  baseXp: number;
  element: string;
  attackSpeed?: number;
  runes: Array<{ runeId: string; quantity: number }>;
}

interface RawPrayer {
  id: string;
  name: string;
  description: string;
  icon?: string;
  level: number;
  category: string;
  drainEffect: number;
  bonuses: Record<string, number>;
  conflicts: string[];
}

// ============== API HELPERS ==============

const MANIFESTS_API_BASE = "/api/manifests";

async function fetchManifest<T>(path: string): Promise<T> {
  const res = await fetch(`${MANIFESTS_API_BASE}/${path}`);
  if (!res.ok) {
    throw new Error(
      `Failed to load manifest ${path}: ${res.status} ${res.statusText}`,
    );
  }
  return res.json() as Promise<T>;
}

/** Fetch manifest content (uses the existing API that wraps in metadata) */
async function fetchManifestContent<T>(name: string): Promise<T> {
  const res = await fetch(`${MANIFESTS_API_BASE}/${name}`);
  if (!res.ok) {
    throw new Error(
      `Failed to load manifest ${name}: ${res.status} ${res.statusText}`,
    );
  }
  const json = await res.json();
  // The API wraps content in { name, filename, content, metadata }
  return (json.content ?? json) as T;
}

// ============== MAPPING FUNCTIONS ==============

function categorizeNPC(npc: RawNPC): ManifestNPC["category"] {
  const cat = npc.category?.toLowerCase();
  if (cat === "boss") return "boss";
  if (cat === "mob" || cat === "monster") return "mob";
  if (cat === "quest" || cat === "quest_npc") return "quest";
  return "neutral";
}

function mapNPCs(raw: RawNPC[]): ManifestNPC[] {
  return raw.map((npc) => ({
    id: npc.id,
    name: npc.name,
    description: npc.description,
    category: categorizeNPC(npc),
    levelRange: npc.levelRange,
    appearance: {
      modelPath: npc.appearance?.modelPath ?? "",
      iconPath: npc.appearance?.iconPath,
      scale: npc.appearance?.scale,
    },
    services: npc.services,
    _raw: npc as Record<string, unknown>,
  }));
}

function mapStations(raw: RawStation[]): ManifestStation[] {
  return raw.map((s) => ({
    type: s.type,
    name: s.name,
    model: s.model,
    examine: s.examine,
  }));
}

function mapMiningRocks(raw: RawMiningRock[]): ManifestMiningRock[] {
  return raw.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    modelPath: r.modelPath,
    levelRequired: r.levelRequired,
    examine: r.examine,
  }));
}

function mapTrees(raw: RawTree[]): ManifestTree[] {
  return raw.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    modelVariants: t.modelVariants,
    levelRequired: t.levelRequired,
    examine: t.examine,
  }));
}

function mapFishingSpots(raw: RawFishingSpot[]): ManifestFishingSpot[] {
  return raw.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    toolRequired: f.toolRequired,
    levelRequired: f.levelRequired,
    examine: f.examine,
  }));
}

function mapItems(raw: RawItem[], type: ManifestItem["type"]): ManifestItem[] {
  return raw.map((item) => ({
    id: item.id,
    name: item.name,
    type: (item.type as ManifestItem["type"]) ?? type,
    tier: item.tier,
    value: item.value ?? 0,
    weight: item.weight,
    equipSlot: item.equipSlot,
    description: item.description,
    examine: item.examine,
    tradeable: item.tradeable,
    stackable: item.stackable,
    rarity: item.rarity,
    modelPath: item.modelPath,
    iconPath: item.iconPath,
    levelRequired: item.levelRequired,
    bonuses: item.bonuses,
  }));
}

function mapQuests(raw: Record<string, RawQuest>): ManifestQuest[] {
  return Object.values(raw)
    .filter((q) => q && typeof q === "object" && "id" in q)
    .map((q) => ({
      id: q.id,
      name: q.name,
      description: q.description,
      difficulty: q.difficulty,
      questPoints: q.questPoints,
      replayable: q.replayable,
      startNpc: q.startNpc,
      requirements: q.requirements,
      stages: (q.stages ?? []).map((s) => ({
        id: s.id,
        type: s.type,
        description: s.description,
        npcId: s.npcId,
        target: s.target,
        count: s.count,
        location: s.location,
      })),
      rewards: q.rewards,
    }));
}

function mapStores(raw: RawStore[]): ManifestStore[] {
  return raw.map((s) => ({
    id: s.id,
    name: s.name,
    buyback: s.buyback,
    buybackRate: s.buybackRate,
    description: s.description,
    items: (s.items ?? []).map((item) => ({
      id: item.id,
      itemId: item.itemId,
      name: item.name,
      price: item.price,
      stockQuantity: item.stockQuantity,
      restockTime: item.restockTime,
      description: item.description,
      category: item.category,
    })),
  }));
}

function mapCombatSpells(raw: Record<string, unknown>): ManifestCombatSpell[] {
  const spells: ManifestCombatSpell[] = [];
  const standard = raw.standard as Record<string, RawCombatSpell[]> | undefined;
  if (!standard) return spells;

  for (const [tier, tierSpells] of Object.entries(standard)) {
    if (!Array.isArray(tierSpells)) continue;
    for (const s of tierSpells) {
      spells.push({
        id: s.id,
        name: s.name,
        level: s.level,
        baseMaxHit: s.baseMaxHit,
        baseXp: s.baseXp,
        element: s.element,
        attackSpeed: s.attackSpeed,
        runes: s.runes ?? [],
        tier,
      });
    }
  }
  return spells;
}

function mapPrayers(raw: { prayers?: RawPrayer[] }): ManifestPrayer[] {
  return (raw.prayers ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    icon: p.icon,
    level: p.level,
    category: p.category,
    drainEffect: p.drainEffect,
    bonuses: p.bonuses ?? {},
    conflicts: p.conflicts ?? [],
  }));
}

function mapRunes(raw: {
  runes?: Array<{
    id: string;
    name: string;
    element: string | null;
    stackable: boolean;
  }>;
}): ManifestRune[] {
  return (raw.runes ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    element: r.element,
    stackable: r.stackable,
  }));
}

function mapAmmunition(raw: {
  arrows?: Array<{
    id: string;
    name: string;
    rangedStrength: number;
    requiredRangedLevel: number;
    requiredBowTier?: number;
  }>;
}): ManifestAmmunition[] {
  return (raw.arrows ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    rangedStrength: a.rangedStrength,
    requiredRangedLevel: a.requiredRangedLevel,
    requiredBowTier: a.requiredBowTier,
  }));
}

interface RawRecipeEntry {
  output?: string;
  raw?: string;
  cooked?: string;
  level: number;
  xp: number;
  ticks?: number;
  category?: string;
  bar?: string;
  barsRequired?: number;
  [key: string]: unknown;
}

function mapRecipes(
  skill: string,
  raw: { recipes?: RawRecipeEntry[] },
): ManifestRecipe[] {
  return (raw.recipes ?? []).map((r, idx) => {
    const output = r.output ?? r.cooked ?? `${skill}_output_${idx}`;
    const inputs: Array<{ itemId: string; quantity: number }> = [];
    if (r.bar) inputs.push({ itemId: r.bar, quantity: r.barsRequired ?? 1 });
    if (r.raw) inputs.push({ itemId: r.raw, quantity: 1 });

    return {
      id: `${skill}_${output}_${idx}`,
      skill,
      output,
      inputs,
      level: r.level,
      xp: r.xp,
      ticks: r.ticks,
      category: r.category,
      _raw: r as Record<string, unknown>,
    };
  });
}

function mapSkillUnlocks(raw: {
  skills?: Record<
    string,
    Array<{ level: number; description: string; type?: string }>
  >;
}): ManifestSkillUnlock[] {
  const unlocks: ManifestSkillUnlock[] = [];
  if (!raw.skills) return unlocks;
  for (const [skill, entries] of Object.entries(raw.skills)) {
    for (const e of entries) {
      unlocks.push({
        skill,
        level: e.level,
        description: e.description,
        type: e.type,
      });
    }
  }
  return unlocks;
}

function mapTierRequirements(
  raw: Record<string, unknown>,
): ManifestTierRequirement[] {
  const reqs: ManifestTierRequirement[] = [];
  for (const [category, tiers] of Object.entries(raw)) {
    if (category.startsWith("$") || category.startsWith("_")) continue;
    if (typeof tiers !== "object" || tiers === null) continue;
    for (const [tier, requirements] of Object.entries(
      tiers as Record<string, unknown>,
    )) {
      if (typeof requirements === "object" && requirements !== null) {
        reqs.push({
          tier,
          category,
          requirements: requirements as Record<string, number>,
        });
      }
    }
  }
  return reqs;
}

function mapDuelArenas(raw: {
  arenas?: Array<{
    arenaId: number;
    center: { x: number; z: number };
    size: number;
    spawnPoints: Array<{ x: number; y: number; z: number }>;
    trapdoorPositions?: Array<{ x: number; z: number }>;
  }>;
}): ManifestDuelArena[] {
  return (raw.arenas ?? []).map((a) => ({
    arenaId: a.arenaId,
    center: a.center,
    size: a.size,
    spawnPoints: a.spawnPoints,
    trapdoorPositions: a.trapdoorPositions,
  }));
}

// ============== SAFE FETCH WITH FALLBACK ==============

/** Fetch manifest or return fallback on failure (non-critical manifests) */
async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    return await fetchManifestContent<T>(path);
  } catch {
    console.warn(`[ManifestLoader] Failed to load ${path}, using fallback`);
    return fallback;
  }
}

// ============== HOOK ==============

/**
 * Loads all game manifests on mount and dispatches results to WorldStudioContext.
 * Only loads once — subsequent mounts skip if already loaded.
 */
export function useManifestLoader() {
  const { state, actions } = useWorldStudio();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (
      state.manifests.loaded ||
      state.manifests.loading ||
      loadedRef.current
    ) {
      return;
    }

    loadedRef.current = true;
    actions.loadManifestsStart();

    (async () => {
      try {
        // Phase 1: Critical manifests for entity palette (fast path)
        const [npcsRaw, stationsRaw, miningRaw, woodcuttingRaw, fishingRaw] =
          await Promise.all([
            fetchManifestContent<RawNPC[]>("npcs"),
            fetchManifestContent<{ stations: RawStation[] }>("stations"),
            fetchManifestContent<{ rocks: RawMiningRock[] }>(
              "gathering/mining",
            ),
            fetchManifestContent<{ trees: RawTree[] }>("gathering/woodcutting"),
            fetchManifestContent<{ spots: RawFishingSpot[] }>(
              "gathering/fishing",
            ),
          ]);

        // Phase 2: Extended manifests for Phase 6 (items, quests, stores, combat, etc.)
        const [
          weaponsRaw,
          armorRaw,
          resourcesRaw,
          toolsRaw,
          ammoItemsRaw,
          foodRaw,
          miscRaw,
          runeItemsRaw,
          questsRaw,
          storesRaw,
          combatSpellsRaw,
          prayersRaw,
          runesRaw,
          ammunitionRaw,
          smithingRaw,
          fletchingRaw,
          craftingRaw,
          cookingRaw,
          smeltingRaw,
          runecraftingRaw,
          firemakingRaw,
          tanningRaw,
          skillUnlocksRaw,
          tierReqsRaw,
          duelArenasRaw,
          lodSettingsRaw,
        ] = await Promise.all([
          // Items (8 files)
          safeFetch<RawItem[]>("items/weapons", []),
          safeFetch<RawItem[]>("items/armor", []),
          safeFetch<RawItem[]>("items/resources", []),
          safeFetch<RawItem[]>("items/tools", []),
          safeFetch<RawItem[]>("items/ammunition", []),
          safeFetch<RawItem[]>("items/food", []),
          safeFetch<RawItem[]>("items/misc", []),
          safeFetch<RawItem[]>("items/runes", []),
          // Quests & stores
          safeFetch<Record<string, RawQuest>>("quests", {}),
          safeFetch<RawStore[]>("stores", []),
          // Combat
          safeFetch<Record<string, unknown>>("combat-spells", {}),
          safeFetch<{ prayers?: RawPrayer[] }>("prayers", {}),
          safeFetch<{ runes?: ManifestRune[] }>("runes", {}),
          safeFetch<{ arrows?: ManifestAmmunition[] }>("ammunition", {}),
          // Recipes (8 files)
          safeFetch<{ recipes?: RawRecipeEntry[] }>("recipes/smithing", {}),
          safeFetch<{ recipes?: RawRecipeEntry[] }>("recipes/fletching", {}),
          safeFetch<{ recipes?: RawRecipeEntry[] }>("recipes/crafting", {}),
          safeFetch<{ recipes?: RawRecipeEntry[] }>("recipes/cooking", {}),
          safeFetch<{ recipes?: RawRecipeEntry[] }>("recipes/smelting", {}),
          safeFetch<{ recipes?: RawRecipeEntry[] }>("recipes/runecrafting", {}),
          safeFetch<{ recipes?: RawRecipeEntry[] }>("recipes/firemaking", {}),
          safeFetch<{ recipes?: RawRecipeEntry[] }>("recipes/tanning", {}),
          // Progression
          safeFetch<{
            skills?: Record<
              string,
              Array<{ level: number; description: string; type?: string }>
            >;
          }>("skill-unlocks", {}),
          safeFetch<Record<string, unknown>>("tier-requirements", {}),
          // Arenas & config
          safeFetch<{ arenas?: ManifestDuelArena[] }>("duel-arenas", {}),
          safeFetch<ManifestLODSettings>("lod-settings", {
            distanceThresholds: {},
          }),
        ]);

        // Combine all items into a single array
        const allItems: ManifestItem[] = [
          ...mapItems(Array.isArray(weaponsRaw) ? weaponsRaw : [], "weapon"),
          ...mapItems(Array.isArray(armorRaw) ? armorRaw : [], "armor"),
          ...mapItems(
            Array.isArray(resourcesRaw) ? resourcesRaw : [],
            "resource",
          ),
          ...mapItems(Array.isArray(toolsRaw) ? toolsRaw : [], "tool"),
          ...mapItems(
            Array.isArray(ammoItemsRaw) ? ammoItemsRaw : [],
            "ammunition",
          ),
          ...mapItems(Array.isArray(foodRaw) ? foodRaw : [], "food"),
          ...mapItems(Array.isArray(miscRaw) ? miscRaw : [], "misc"),
          ...mapItems(Array.isArray(runeItemsRaw) ? runeItemsRaw : [], "rune"),
        ];

        // Combine all recipes
        const allRecipes: ManifestRecipe[] = [
          ...mapRecipes("smithing", smithingRaw),
          ...mapRecipes("fletching", fletchingRaw),
          ...mapRecipes("crafting", craftingRaw),
          ...mapRecipes("cooking", cookingRaw),
          ...mapRecipes("smelting", smeltingRaw),
          ...mapRecipes("runecrafting", runecraftingRaw),
          ...mapRecipes("firemaking", firemakingRaw),
          ...mapRecipes("tanning", tanningRaw),
        ];

        actions.loadManifestsSuccess({
          // Existing (Phase 3)
          npcs: mapNPCs(Array.isArray(npcsRaw) ? npcsRaw : []),
          stations: mapStations(stationsRaw.stations ?? []),
          miningRocks: mapMiningRocks(miningRaw.rocks ?? []),
          trees: mapTrees(woodcuttingRaw.trees ?? []),
          fishingSpots: mapFishingSpots(fishingRaw.spots ?? []),
          // Extended (Phase 6)
          items: allItems,
          quests: mapQuests(questsRaw),
          stores: mapStores(Array.isArray(storesRaw) ? storesRaw : []),
          combatSpells: mapCombatSpells(combatSpellsRaw),
          prayers: mapPrayers(prayersRaw),
          runes: mapRunes(runesRaw),
          ammunition: mapAmmunition(ammunitionRaw),
          recipes: allRecipes,
          skillUnlocks: mapSkillUnlocks(skillUnlocksRaw),
          tierRequirements: mapTierRequirements(tierReqsRaw),
          duelArenas: mapDuelArenas(duelArenasRaw),
          lodSettings: lodSettingsRaw,
          rawManifests: {},
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load manifests";
        console.error("[ManifestLoader] Failed to load manifests:", message);
        actions.loadManifestsError(message);
        // Don't reset loadedRef — prevent infinite retry loop.
        // User can reload the page to retry.
      }
    })();
  }, [actions]);
}
