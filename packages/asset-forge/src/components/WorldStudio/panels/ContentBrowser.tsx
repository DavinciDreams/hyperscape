/**
 * ContentBrowser — UE5-inspired unified content browser for World Studio
 *
 * Replaces ManifestBrowserPanel with a split-pane layout:
 * - Left: narrow category tree (entities, items, combat, etc.)
 * - Right: filterable grid/list of entries with drag-to-viewport support
 * - Bottom: detail preview when an item is selected
 *
 * All data sourced from `useWorldStudio().state.manifests`.
 */

import {
  AlertCircle,
  ChefHat,
  ChevronRight,
  ExternalLink,
  Grid3x3,
  List,
  Loader2,
  MapPin,
  Music,
  Package,
  Pickaxe,
  Search,
  Settings,
  Swords,
  TrendingUp,
  Users,
  X,
  Crosshair,
} from "lucide-react";
import React, { useState, useCallback, useMemo } from "react";

import type {
  ManifestItem,
  ManifestNPC,
  ManifestCombatSpell,
  ManifestPrayer,
  ManifestRune,
  ManifestAmmunition,
  ManifestQuest,
  ManifestRecipe,
  ManifestSkillUnlock,
  ManifestTierRequirement,
  ManifestDuelArena,
  ManifestStation,
  ManifestStore,
  ManifestMiningRock,
  ManifestTree,
  ManifestFishingSpot,
  ManifestData,
} from "../types";
import { useWorldStudio } from "../WorldStudioContext";

// ============== CONTENT ENTRY ==============

/** Unified content entry for the browser grid/list */
interface ContentEntry {
  id: string;
  name: string;
  /** Leaf category key matching a CategoryNode */
  categoryKey: string;
  /** Type label for the indicator dot */
  typeLabel: string;
  /** Color class for the type indicator dot */
  dotColor: string;
  /** Brief info shown in grid card or list row */
  info: string;
  /** Level or tier number for sorting */
  level?: number;
  /** Drag entity id (for text/entity-id) */
  entityId: string;
}

// ============== CATEGORY TREE ==============

interface CategoryNode {
  key: string;
  label: string;
  icon?: React.ReactNode;
  children?: CategoryNode[];
  /** When true, this is a leaf that maps to a content set */
  leaf?: boolean;
}

const CATEGORY_TREE: CategoryNode[] = [
  {
    key: "entities",
    label: "Entities",
    icon: <Users size={11} />,
    children: [
      { key: "entities/npcs", label: "NPCs", leaf: true },
      { key: "entities/stations", label: "Stations", leaf: true },
      { key: "entities/mob-spawns", label: "Mob Spawns", leaf: true },
    ],
  },
  {
    key: "items",
    label: "Items",
    icon: <Package size={11} />,
    children: [
      { key: "items/weapons", label: "Weapons", leaf: true },
      { key: "items/armor", label: "Armor", leaf: true },
      { key: "items/resources", label: "Resources", leaf: true },
      { key: "items/tools", label: "Tools", leaf: true },
      { key: "items/food", label: "Food", leaf: true },
      { key: "items/misc", label: "Misc", leaf: true },
      { key: "items/ammo", label: "Ammo", leaf: true },
      { key: "items/runes", label: "Runes", leaf: true },
    ],
  },
  {
    key: "combat",
    label: "Combat",
    icon: <Swords size={11} />,
    children: [
      { key: "combat/spells", label: "Spells", leaf: true },
      { key: "combat/prayers", label: "Prayers", leaf: true },
      { key: "combat/runes", label: "Runes", leaf: true },
      { key: "combat/ammo", label: "Ammo", leaf: true },
      { key: "combat/duel-arenas", label: "Duel Arenas", leaf: true },
    ],
  },
  {
    key: "progression",
    label: "Progression",
    icon: <TrendingUp size={11} />,
    children: [
      { key: "progression/quests", label: "Quests", leaf: true },
      { key: "progression/skill-unlocks", label: "Skill Unlocks", leaf: true },
      { key: "progression/tier-reqs", label: "Tier Requirements", leaf: true },
    ],
  },
  {
    key: "recipes",
    label: "Recipes",
    icon: <ChefHat size={11} />,
    children: [
      { key: "recipes/smithing", label: "Smithing", leaf: true },
      { key: "recipes/smelting", label: "Smelting", leaf: true },
      { key: "recipes/fletching", label: "Fletching", leaf: true },
      { key: "recipes/crafting", label: "Crafting", leaf: true },
      { key: "recipes/cooking", label: "Cooking", leaf: true },
      { key: "recipes/runecrafting", label: "Runecrafting", leaf: true },
    ],
  },
  {
    key: "gathering",
    label: "Gathering",
    icon: <Pickaxe size={11} />,
    children: [
      { key: "gathering/mining", label: "Mining", leaf: true },
      { key: "gathering/woodcutting", label: "Woodcutting", leaf: true },
      { key: "gathering/fishing", label: "Fishing", leaf: true },
    ],
  },
  {
    key: "world",
    label: "World",
    icon: <MapPin size={11} />,
    children: [
      { key: "world/biomes", label: "Biomes", leaf: true },
      { key: "world/areas", label: "Areas", leaf: true },
      { key: "world/config", label: "Config", leaf: true },
      { key: "world/buildings", label: "Buildings", leaf: true },
      { key: "world/lod", label: "LOD", leaf: true },
    ],
  },
  {
    key: "audio",
    label: "Audio",
    icon: <Music size={11} />,
    children: [{ key: "audio/music", label: "Music", leaf: true }],
  },
];

// ============== TYPE FILTER CHIPS ==============

/** Supported filter chip types */
type FilterType =
  | "npc"
  | "item"
  | "station"
  | "spell"
  | "prayer"
  | "quest"
  | "recipe"
  | "rune"
  | "ammo";

const FILTER_TYPE_LABELS: Record<FilterType, string> = {
  npc: "NPC",
  item: "Item",
  station: "Station",
  spell: "Spell",
  prayer: "Prayer",
  quest: "Quest",
  recipe: "Recipe",
  rune: "Rune",
  ammo: "Ammo",
};

/** Dot colors for each content type */
const DOT_COLORS: Record<string, string> = {
  npc: "bg-blue-400",
  mob: "bg-red-400",
  boss: "bg-red-600",
  station: "bg-orange-400",
  store: "bg-yellow-400",
  weapon: "bg-rose-400",
  armor: "bg-indigo-400",
  resource: "bg-amber-400",
  tool: "bg-lime-400",
  food: "bg-emerald-400",
  misc: "bg-gray-400",
  ammo: "bg-cyan-400",
  rune: "bg-purple-400",
  spell: "bg-violet-400",
  prayer: "bg-sky-400",
  quest: "bg-teal-400",
  recipe: "bg-orange-300",
  "skill-unlock": "bg-green-400",
  "tier-req": "bg-yellow-300",
  "duel-arena": "bg-red-300",
  mining: "bg-amber-500",
  woodcutting: "bg-green-500",
  fishing: "bg-cyan-500",
  biome: "bg-emerald-500",
  area: "bg-lime-500",
  config: "bg-gray-500",
  building: "bg-stone-400",
  lod: "bg-zinc-400",
  music: "bg-fuchsia-400",
};

// ============== BUILD ALL ENTRIES ==============

function buildAllEntries(manifests: ManifestData): ContentEntry[] {
  const entries: ContentEntry[] = [];

  // NPCs
  manifests.npcs.forEach((n: ManifestNPC) => {
    entries.push({
      id: `npc:${n.id}`,
      name: n.name,
      categoryKey: "entities/npcs",
      typeLabel: n.category,
      dotColor: DOT_COLORS[n.category] ?? DOT_COLORS.npc,
      info: `${n.category} Lv${n.levelRange[0]}-${n.levelRange[1]}`,
      level: n.levelRange[0],
      entityId: n.id,
    });
  });

  // Stations
  manifests.stations.forEach((s: ManifestStation) => {
    entries.push({
      id: `station:${s.type}`,
      name: s.name,
      categoryKey: "entities/stations",
      typeLabel: "station",
      dotColor: DOT_COLORS.station,
      info: s.type,
      entityId: s.type,
    });
  });

  // Mob spawns (mobs and bosses)
  manifests.npcs
    .filter((n: ManifestNPC) => n.category === "mob" || n.category === "boss")
    .forEach((n: ManifestNPC) => {
      entries.push({
        id: `mob-spawn:${n.id}`,
        name: `${n.name} Spawn`,
        categoryKey: "entities/mob-spawns",
        typeLabel: n.category,
        dotColor: DOT_COLORS[n.category] ?? DOT_COLORS.mob,
        info: `Lv${n.levelRange[0]}-${n.levelRange[1]}`,
        level: n.levelRange[0],
        entityId: n.id,
      });
    });

  // Items by type
  const itemTypeToCategory: Record<string, string> = {
    weapon: "items/weapons",
    armor: "items/armor",
    resource: "items/resources",
    tool: "items/tools",
    food: "items/food",
    misc: "items/misc",
    ammunition: "items/ammo",
    rune: "items/runes",
  };

  manifests.items.forEach((i: ManifestItem) => {
    entries.push({
      id: `item:${i.id}`,
      name: i.name,
      categoryKey: itemTypeToCategory[i.type] ?? "items/misc",
      typeLabel: i.type,
      dotColor: DOT_COLORS[i.type] ?? DOT_COLORS.misc,
      info:
        [i.tier, i.rarity, i.levelRequired ? `Lv${i.levelRequired}` : null]
          .filter(Boolean)
          .join(" · ") || i.type,
      level: i.levelRequired,
      entityId: i.id,
    });
  });

  // Combat spells
  manifests.combatSpells.forEach((s: ManifestCombatSpell) => {
    entries.push({
      id: `spell:${s.id}`,
      name: s.name,
      categoryKey: "combat/spells",
      typeLabel: "spell",
      dotColor: DOT_COLORS.spell,
      info: `Lv${s.level} ${s.element} (${s.tier})`,
      level: s.level,
      entityId: s.id,
    });
  });

  // Prayers
  manifests.prayers.forEach((p: ManifestPrayer) => {
    entries.push({
      id: `prayer:${p.id}`,
      name: p.name,
      categoryKey: "combat/prayers",
      typeLabel: "prayer",
      dotColor: DOT_COLORS.prayer,
      info: `Lv${p.level} ${p.category}`,
      level: p.level,
      entityId: p.id,
    });
  });

  // Runes (combat category)
  manifests.runes.forEach((r: ManifestRune) => {
    entries.push({
      id: `rune:${r.id}`,
      name: r.name,
      categoryKey: "combat/runes",
      typeLabel: "rune",
      dotColor: DOT_COLORS.rune,
      info: r.element ?? "basic",
      entityId: r.id,
    });
  });

  // Ammunition (combat category)
  manifests.ammunition.forEach((a: ManifestAmmunition) => {
    entries.push({
      id: `ammo:${a.id}`,
      name: a.name,
      categoryKey: "combat/ammo",
      typeLabel: "ammo",
      dotColor: DOT_COLORS.ammo,
      info: `+${a.rangedStrength} str Lv${a.requiredRangedLevel}`,
      level: a.requiredRangedLevel,
      entityId: a.id,
    });
  });

  // Duel arenas
  manifests.duelArenas.forEach((a: ManifestDuelArena) => {
    entries.push({
      id: `arena:${a.arenaId}`,
      name: `Arena ${a.arenaId}`,
      categoryKey: "combat/duel-arenas",
      typeLabel: "duel-arena",
      dotColor: DOT_COLORS["duel-arena"],
      info: `Size ${a.size}`,
      entityId: `arena_${a.arenaId}`,
    });
  });

  // Quests
  manifests.quests.forEach((q: ManifestQuest) => {
    entries.push({
      id: `quest:${q.id}`,
      name: q.name,
      categoryKey: "progression/quests",
      typeLabel: "quest",
      dotColor: DOT_COLORS.quest,
      info: `${q.difficulty} · ${q.stages.length} stages`,
      entityId: q.id,
    });
  });

  // Skill unlocks
  manifests.skillUnlocks.forEach((u: ManifestSkillUnlock, idx: number) => {
    entries.push({
      id: `skill-unlock:${u.skill}_${u.level}_${idx}`,
      name: `${u.skill} Lv${u.level}`,
      categoryKey: "progression/skill-unlocks",
      typeLabel: "skill-unlock",
      dotColor: DOT_COLORS["skill-unlock"],
      info: u.description,
      level: u.level,
      entityId: `${u.skill}_${u.level}`,
    });
  });

  // Tier requirements
  manifests.tierRequirements.forEach(
    (t: ManifestTierRequirement, idx: number) => {
      entries.push({
        id: `tier-req:${t.tier}_${t.category}_${idx}`,
        name: `${t.tier} ${t.category}`,
        categoryKey: "progression/tier-reqs",
        typeLabel: "tier-req",
        dotColor: DOT_COLORS["tier-req"],
        info: Object.entries(t.requirements)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", "),
        entityId: `${t.tier}_${t.category}`,
      });
    },
  );

  // Recipes by skill
  manifests.recipes.forEach((r: ManifestRecipe) => {
    const catKey = `recipes/${r.skill}`;
    entries.push({
      id: `recipe:${r.id}`,
      name: r.output,
      categoryKey: catKey,
      typeLabel: "recipe",
      dotColor: DOT_COLORS.recipe,
      info: `Lv${r.level} · ${r.xp}xp`,
      level: r.level,
      entityId: r.id,
    });
  });

  // Gathering: Mining
  manifests.miningRocks.forEach((r: ManifestMiningRock) => {
    entries.push({
      id: `mining:${r.id}`,
      name: r.name,
      categoryKey: "gathering/mining",
      typeLabel: "mining",
      dotColor: DOT_COLORS.mining,
      info: `Lv${r.levelRequired}`,
      level: r.levelRequired,
      entityId: r.id,
    });
  });

  // Gathering: Woodcutting
  manifests.trees.forEach((t: ManifestTree) => {
    entries.push({
      id: `woodcutting:${t.id}`,
      name: t.name,
      categoryKey: "gathering/woodcutting",
      typeLabel: "woodcutting",
      dotColor: DOT_COLORS.woodcutting,
      info: `Lv${t.levelRequired}`,
      level: t.levelRequired,
      entityId: t.id,
    });
  });

  // Gathering: Fishing
  manifests.fishingSpots.forEach((f: ManifestFishingSpot) => {
    entries.push({
      id: `fishing:${f.id}`,
      name: f.name,
      categoryKey: "gathering/fishing",
      typeLabel: "fishing",
      dotColor: DOT_COLORS.fishing,
      info: `Lv${f.levelRequired}`,
      level: f.levelRequired,
      entityId: f.id,
    });
  });

  // Stores (shown under entities/stations umbrella as a related type)
  manifests.stores.forEach((s: ManifestStore) => {
    entries.push({
      id: `store:${s.id}`,
      name: s.name,
      categoryKey: "entities/stations",
      typeLabel: "store",
      dotColor: DOT_COLORS.store,
      info: `${s.items.length} items`,
      entityId: s.id,
    });
  });

  return entries;
}

// ============== CATEGORY COUNT HELPERS ==============

function countByCategory(entries: ContentEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.categoryKey, (counts.get(entry.categoryKey) ?? 0) + 1);
  }
  return counts;
}

/** Sum counts for a parent node (all children) */
function getNodeCount(node: CategoryNode, counts: Map<string, number>): number {
  if (node.leaf) return counts.get(node.key) ?? 0;
  if (!node.children) return 0;
  return node.children.reduce(
    (sum, child) => sum + getNodeCount(child, counts),
    0,
  );
}

// ============== FILTER CHIP PARSING ==============

interface ParsedSearch {
  text: string;
  typeFilters: FilterType[];
}

function parseSearchQuery(raw: string): ParsedSearch {
  const typeFilters: FilterType[] = [];
  let text = raw;

  // Extract type:xxx chips
  const typeRegex = /type:(\w+)/gi;
  let match: RegExpExecArray | null;
  while ((match = typeRegex.exec(raw)) !== null) {
    const val = match[1].toLowerCase() as FilterType;
    if (val in FILTER_TYPE_LABELS) {
      typeFilters.push(val);
    }
  }
  text = text.replace(/type:\w+/gi, "").trim();

  return { text, typeFilters };
}

/** Check if a content entry matches filter type chips */
function matchesTypeFilter(
  entry: ContentEntry,
  filters: FilterType[],
): boolean {
  if (filters.length === 0) return true;
  return filters.some((f) => {
    switch (f) {
      case "npc":
        return entry.id.startsWith("npc:") || entry.id.startsWith("mob-spawn:");
      case "item":
        return entry.id.startsWith("item:");
      case "station":
        return entry.id.startsWith("station:") || entry.id.startsWith("store:");
      case "spell":
        return entry.id.startsWith("spell:");
      case "prayer":
        return entry.id.startsWith("prayer:");
      case "quest":
        return entry.id.startsWith("quest:");
      case "recipe":
        return entry.id.startsWith("recipe:");
      case "rune":
        return entry.id.startsWith("rune:");
      case "ammo":
        return entry.id.startsWith("ammo:");
      default:
        return false;
    }
  });
}

// ============== MAIN COMPONENT ==============

export const ContentBrowser = React.memo(function ContentBrowser() {
  const { state, actions } = useWorldStudio();
  const manifests = state.manifests;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set(["entities", "items"]),
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedEntry, setSelectedEntry] = useState<ContentEntry | null>(null);

  // Build all content entries
  const allEntries = useMemo(
    () => (manifests.loaded ? buildAllEntries(manifests) : []),
    [manifests],
  );

  const categoryCounts = useMemo(
    () => countByCategory(allEntries),
    [allEntries],
  );

  // Parse search
  const parsed = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = allEntries;

    // Category filter
    if (selectedCategory) {
      result = result.filter((e) => e.categoryKey === selectedCategory);
    }

    // Type chip filter
    if (parsed.typeFilters.length > 0) {
      result = result.filter((e) => matchesTypeFilter(e, parsed.typeFilters));
    }

    // Text search
    if (parsed.text) {
      const q = parsed.text.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.info.toLowerCase().includes(q) ||
          e.typeLabel.toLowerCase().includes(q) ||
          e.entityId.toLowerCase().includes(q),
      );
    }

    return result;
  }, [allEntries, selectedCategory, parsed]);

  // Toggle parent expansion
  const toggleParent = useCallback((key: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Select a leaf category
  const handleCategorySelect = useCallback((key: string) => {
    setSelectedCategory((prev) => (prev === key ? null : key));
    setSelectedEntry(null);
  }, []);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  // Add type filter chip
  const addFilterChip = useCallback((ft: FilterType) => {
    setSearchQuery((prev) => {
      if (prev.toLowerCase().includes(`type:${ft}`)) return prev;
      return `${prev} type:${ft}`.trim();
    });
  }, []);

  // Remove a specific type filter chip
  const removeFilterChip = useCallback((ft: FilterType) => {
    setSearchQuery((prev) =>
      prev.replace(new RegExp(`type:${ft}`, "gi"), "").trim(),
    );
  }, []);

  // Drag start handler
  const handleDragStart = useCallback(
    (e: React.DragEvent, entry: ContentEntry) => {
      e.dataTransfer.setData("text/entity-id", entry.entityId);
      e.dataTransfer.setData(
        "application/x-content-browser",
        JSON.stringify({
          id: entry.entityId,
          name: entry.name,
          type: entry.typeLabel,
          categoryKey: entry.categoryKey,
        }),
      );
      e.dataTransfer.effectAllowed = "copy";
    },
    [],
  );

  // Place in world handler
  const handlePlaceInWorld = useCallback(
    (entry: ContentEntry) => {
      // Map content type to palette category for the placement system
      const categoryKey = entry.categoryKey;
      if (categoryKey === "entities/npcs") {
        actions.startPlacement("npcs", entry.entityId, entry.name);
      } else if (categoryKey === "entities/stations") {
        actions.startPlacement("stations", entry.entityId, entry.name);
      } else if (categoryKey === "entities/mob-spawns") {
        actions.startPlacement("mob-spawns", entry.entityId, entry.name);
      } else if (categoryKey === "gathering/mining") {
        actions.startPlacement("resources-mining", entry.entityId, entry.name);
      } else if (categoryKey === "gathering/woodcutting") {
        actions.startPlacement(
          "resources-woodcutting",
          entry.entityId,
          entry.name,
        );
      } else if (categoryKey === "gathering/fishing") {
        actions.startPlacement("resources-fishing", entry.entityId, entry.name);
      }
    },
    [actions],
  );

  // Loading state
  if (!manifests.loaded) {
    return (
      <div className="flex flex-col h-full">
        <BrowserHeader
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          resultCount={0}
        />
        <div className="flex-1 flex items-center justify-center">
          {manifests.loading ? (
            <div className="text-center text-text-tertiary">
              <Loader2 size={16} className="mx-auto mb-2 animate-spin" />
              <p className="text-xs">Loading manifests...</p>
            </div>
          ) : manifests.error ? (
            <div className="text-center text-red-400 px-4">
              <AlertCircle size={16} className="mx-auto mb-2" />
              <p className="text-xs">{manifests.error}</p>
            </div>
          ) : (
            <p className="text-xs text-text-tertiary">Manifests not loaded</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with view toggle */}
      <BrowserHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        resultCount={filteredEntries.length}
      />

      {/* Unified search bar */}
      <div className="px-2 py-1.5 border-b border-border-primary">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all content... (type:npc, type:item)"
            className="w-full pl-7 pr-7 py-1 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary/50"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {parsed.typeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {parsed.typeFilters.map((ft) => (
              <span
                key={ft}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-primary/15 text-primary rounded"
              >
                {FILTER_TYPE_LABELS[ft]}
                <button
                  onClick={() => removeFilterChip(ft)}
                  className="hover:text-red-400"
                >
                  <X size={8} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Quick filter chip bar */}
        {!searchQuery && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(["npc", "item", "spell", "quest", "recipe"] as FilterType[]).map(
              (ft) => (
                <button
                  key={ft}
                  onClick={() => addFilterChip(ft)}
                  className="px-1.5 py-0.5 text-[10px] text-text-tertiary bg-bg-tertiary border border-border-primary rounded hover:border-primary/50 hover:text-text-secondary transition-colors"
                >
                  {FILTER_TYPE_LABELS[ft]}
                </button>
              ),
            )}
          </div>
        )}
      </div>

      {/* Main body: tree + content */}
      <div className="flex-1 flex min-h-0">
        {/* Left category tree */}
        <div className="w-[140px] flex-shrink-0 border-r border-border-primary overflow-y-auto scrollbar-thin">
          {CATEGORY_TREE.map((node) => (
            <CategoryTreeNode
              key={node.key}
              node={node}
              depth={0}
              expandedParents={expandedParents}
              selectedCategory={selectedCategory}
              categoryCounts={categoryCounts}
              onToggleParent={toggleParent}
              onSelectCategory={handleCategorySelect}
            />
          ))}
        </div>

        {/* Right content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Content grid/list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {filteredEntries.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-text-tertiary px-4">
                  <Search size={20} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs">
                    {searchQuery || selectedCategory
                      ? "No matching content"
                      : "Select a category or search"}
                  </p>
                </div>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 gap-1 p-1.5">
                {filteredEntries.map((entry) => (
                  <ContentGridCard
                    key={entry.id}
                    entry={entry}
                    isSelected={selectedEntry?.id === entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    onDragStart={(e) => handleDragStart(e, entry)}
                  />
                ))}
              </div>
            ) : (
              <div>
                {filteredEntries.map((entry) => (
                  <ContentListRow
                    key={entry.id}
                    entry={entry}
                    isSelected={selectedEntry?.id === entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    onDragStart={(e) => handleDragStart(e, entry)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Bottom detail preview */}
          {selectedEntry && (
            <ContentDetailPreview
              entry={selectedEntry}
              onClose={() => setSelectedEntry(null)}
              onPlaceInWorld={() => handlePlaceInWorld(selectedEntry)}
            />
          )}
        </div>
      </div>
    </div>
  );
});

// ============== HEADER ==============

function BrowserHeader({
  viewMode,
  onViewModeChange,
  resultCount,
}: {
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  resultCount: number;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border-primary">
      <Settings size={12} className="text-primary" />
      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex-1">
        Content
      </span>
      <span className="text-[10px] text-text-tertiary tabular-nums mr-1">
        {resultCount}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          className={`p-1 rounded transition-colors ${
            viewMode === "list"
              ? "text-primary bg-primary/10"
              : "text-text-tertiary hover:text-text-primary"
          }`}
          onClick={() => onViewModeChange("list")}
          title="List view"
        >
          <List size={12} />
        </button>
        <button
          className={`p-1 rounded transition-colors ${
            viewMode === "grid"
              ? "text-primary bg-primary/10"
              : "text-text-tertiary hover:text-text-primary"
          }`}
          onClick={() => onViewModeChange("grid")}
          title="Grid view"
        >
          <Grid3x3 size={12} />
        </button>
      </div>
    </div>
  );
}

// ============== CATEGORY TREE NODE ==============

function CategoryTreeNode({
  node,
  depth,
  expandedParents,
  selectedCategory,
  categoryCounts,
  onToggleParent,
  onSelectCategory,
}: {
  node: CategoryNode;
  depth: number;
  expandedParents: Set<string>;
  selectedCategory: string | null;
  categoryCounts: Map<string, number>;
  onToggleParent: (key: string) => void;
  onSelectCategory: (key: string) => void;
}) {
  const count = getNodeCount(node, categoryCounts);
  const isExpanded = expandedParents.has(node.key);
  const isSelected = selectedCategory === node.key;
  const hasChildren = !node.leaf && node.children && node.children.length > 0;

  return (
    <div>
      <button
        className={`w-full flex items-center gap-1 py-1 pr-2 text-left transition-colors ${
          isSelected
            ? "bg-primary/15 text-primary"
            : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
        }`}
        style={{ paddingLeft: `${depth * 10 + 6}px` }}
        onClick={() => {
          if (node.leaf) {
            onSelectCategory(node.key);
          } else {
            onToggleParent(node.key);
          }
        }}
      >
        {hasChildren ? (
          <ChevronRight
            size={10}
            className={`flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="w-[10px] flex-shrink-0" />
        )}
        {node.icon && (
          <span className="flex-shrink-0 opacity-70">{node.icon}</span>
        )}
        <span className="text-[11px] flex-1 truncate">{node.label}</span>
        {count > 0 && (
          <span className="text-[9px] text-text-tertiary tabular-nums flex-shrink-0">
            {count}
          </span>
        )}
      </button>

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <CategoryTreeNode
              key={child.key}
              node={child}
              depth={depth + 1}
              expandedParents={expandedParents}
              selectedCategory={selectedCategory}
              categoryCounts={categoryCounts}
              onToggleParent={onToggleParent}
              onSelectCategory={onSelectCategory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============== CONTENT GRID CARD ==============

function ContentGridCard({
  entry,
  isSelected,
  onClick,
  onDragStart,
}: {
  entry: ContentEntry;
  isSelected: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={`flex flex-col p-1.5 rounded border cursor-pointer transition-colors ${
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border-primary hover:border-border-secondary hover:bg-bg-tertiary/50"
      }`}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      title={`${entry.name}\n${entry.info}`}
    >
      {/* Icon placeholder */}
      <div className="w-full aspect-square rounded bg-bg-tertiary flex items-center justify-center mb-1 relative">
        <span className="text-sm text-text-tertiary/40 font-medium">
          {entry.name.charAt(0).toUpperCase()}
        </span>
        {/* Type indicator dot */}
        <span
          className={`absolute top-1 right-1 w-2 h-2 rounded-full ${entry.dotColor}`}
        />
      </div>
      <span className="text-[10px] text-text-primary truncate leading-tight">
        {entry.name}
      </span>
      <span className="text-[9px] text-text-tertiary truncate leading-tight">
        {entry.info}
      </span>
    </div>
  );
}

// ============== CONTENT LIST ROW ==============

function ContentListRow({
  entry,
  isSelected,
  onClick,
  onDragStart,
}: {
  entry: ContentEntry;
  isSelected: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 cursor-pointer transition-colors border-b border-border-primary/30 ${
        isSelected
          ? "bg-primary/10 border-l-2 border-l-primary"
          : "hover:bg-bg-tertiary/50 border-l-2 border-l-transparent"
      }`}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
    >
      {/* Type dot */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.dotColor}`}
      />
      {/* Icon placeholder */}
      <div className="w-5 h-5 rounded bg-bg-tertiary flex items-center justify-center flex-shrink-0">
        <span className="text-[9px] text-text-tertiary/50 font-medium">
          {entry.name.charAt(0).toUpperCase()}
        </span>
      </div>
      {/* Name + info */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-text-primary truncate">
          {entry.name}
        </div>
      </div>
      {/* Type label */}
      <span className="text-[9px] text-text-tertiary flex-shrink-0">
        {entry.typeLabel}
      </span>
      {/* Level/info */}
      {entry.level != null && (
        <span className="text-[9px] text-text-tertiary tabular-nums flex-shrink-0">
          Lv{entry.level}
        </span>
      )}
    </div>
  );
}

// ============== DETAIL PREVIEW ==============

function ContentDetailPreview({
  entry,
  onClose,
  onPlaceInWorld,
}: {
  entry: ContentEntry;
  onClose: () => void;
  onPlaceInWorld: () => void;
}) {
  // Determine if this entry type is placeable
  const isPlaceable = [
    "entities/npcs",
    "entities/stations",
    "entities/mob-spawns",
    "gathering/mining",
    "gathering/woodcutting",
    "gathering/fishing",
  ].includes(entry.categoryKey);

  return (
    <div className="border-t border-border-primary bg-bg-secondary px-2 py-2">
      <div className="flex items-start gap-2">
        {/* Type dot + icon */}
        <div className="w-8 h-8 rounded bg-bg-tertiary flex items-center justify-center flex-shrink-0 relative">
          <span className="text-xs text-text-tertiary/50 font-medium">
            {entry.name.charAt(0).toUpperCase()}
          </span>
          <span
            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-bg-secondary ${entry.dotColor}`}
          />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-text-primary truncate">
            {entry.name}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {entry.typeLabel} · {entry.info}
          </div>
          <div className="text-[10px] text-text-tertiary truncate opacity-60">
            ID: {entry.entityId}
          </div>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="p-0.5 text-text-tertiary hover:text-text-primary"
        >
          <X size={10} />
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5 mt-2">
        <button
          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-bg-tertiary border border-border-primary rounded text-text-secondary hover:text-text-primary hover:border-border-secondary transition-colors"
          title="Open in Manifest Browser"
        >
          <ExternalLink size={10} />
          Edit in Manifest
        </button>
        {isPlaceable && (
          <button
            onClick={onPlaceInWorld}
            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary/15 border border-primary/30 rounded text-primary hover:bg-primary/25 transition-colors"
            title="Start placement in viewport"
          >
            <Crosshair size={10} />
            Place in World
          </button>
        )}
      </div>
    </div>
  );
}
