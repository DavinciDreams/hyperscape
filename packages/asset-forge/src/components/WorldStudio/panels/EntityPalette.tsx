/**
 * EntityPalette — Entity placement browser for World Studio
 *
 * Shown in the left sidebar when the Place tool is active (editing mode).
 * Displays categorized entity templates loaded from game manifests:
 * - NPCs (mobs, bosses, neutral, quest)
 * - Stations (anvil, furnace, bank, altar, etc.)
 * - Mob Spawn Zones
 * - Resources: Mining, Woodcutting, Fishing
 * - Spawn Points
 * - Teleports
 *
 * Click an item to start a placement (ghost preview follows cursor in viewport).
 */

import {
  Axe,
  ChevronRight,
  Compass,
  Droplets,
  Fish,
  Flame,
  Gem,
  Grid3x3,
  List,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Shield,
  Skull,
  Star,
  TreePine,
  User,
  AlertTriangle,
} from "lucide-react";
import React, { useMemo, useState, useCallback } from "react";

import type { PaletteCategory, PaletteItem } from "../types";
import { useWorldStudio } from "../WorldStudioContext";

/** Category display config */
interface CategoryConfig {
  id: PaletteCategory;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: "npcs",
    label: "NPCs",
    icon: <User size={14} />,
    description: "Place NPC entities from manifest",
  },
  {
    id: "stations",
    label: "Stations",
    icon: <Flame size={14} />,
    description: "Crafting and service stations",
  },
  {
    id: "mob-spawns",
    label: "Mob Spawns",
    icon: <Skull size={14} />,
    description: "Mob spawn zone markers",
  },
  {
    id: "resources-mining",
    label: "Mining Rocks",
    icon: <Gem size={14} />,
    description: "Ore nodes and mining spots",
  },
  {
    id: "resources-woodcutting",
    label: "Trees",
    icon: <TreePine size={14} />,
    description: "Woodcutting trees",
  },
  {
    id: "resources-fishing",
    label: "Fishing Spots",
    icon: <Fish size={14} />,
    description: "Fishing spot markers",
  },
  {
    id: "spawn-points",
    label: "Spawn Points",
    icon: <MapPin size={14} />,
    description: "Player spawn locations",
  },
  {
    id: "teleports",
    label: "Teleports",
    icon: <Navigation size={14} />,
    description: "Teleport network nodes",
  },
  {
    id: "pois",
    label: "Points of Interest",
    icon: <Compass size={14} />,
    description: "Dungeons, shrines, landmarks, camps",
  },
  {
    id: "water-bodies",
    label: "Water Bodies",
    icon: <Droplets size={14} />,
    description: "Rivers, lakes, ponds",
  },
];

export function EntityPalette() {
  const { state, actions } = useWorldStudio();
  const { manifests, tools } = state;
  const activePlacement = tools.activePlacement;

  const [expandedCategory, setExpandedCategory] =
    useState<PaletteCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [recentPlacements, setRecentPlacements] = useState<string[]>([]);

  // Build palette items from loaded manifests
  const paletteItems = useMemo((): Map<PaletteCategory, PaletteItem[]> => {
    const map = new Map<PaletteCategory, PaletteItem[]>();

    if (!manifests.loaded) {
      CATEGORIES.forEach((c) => map.set(c.id, []));
      return map;
    }

    // NPCs
    map.set(
      "npcs",
      manifests.npcs.map((npc) => ({
        id: npc.id,
        name: npc.name,
        category: "npcs" as PaletteCategory,
        modelPath: npc.appearance?.modelPath || undefined,
        iconPath: npc.appearance?.iconPath,
        description: npc.description,
        levelRequired: npc.levelRange?.[0],
        manifestData: { ...npc } as unknown as Record<string, unknown>,
      })),
    );

    // Stations
    map.set(
      "stations",
      manifests.stations.map((s) => ({
        id: s.type,
        name: s.name,
        category: "stations" as PaletteCategory,
        modelPath: s.model || undefined,
        description: s.examine,
        manifestData: { ...s } as unknown as Record<string, unknown>,
      })),
    );

    // Mob spawns — reuse NPC mobs for the template list
    map.set(
      "mob-spawns",
      manifests.npcs
        .filter((npc) => npc.category === "mob" || npc.category === "boss")
        .map((npc) => ({
          id: npc.id,
          name: `${npc.name} Spawn`,
          category: "mob-spawns" as PaletteCategory,
          modelPath: npc.appearance?.modelPath || undefined,
          description: `Lvl ${npc.levelRange?.[0] ?? "?"}–${npc.levelRange?.[1] ?? "?"} — ${npc.description}`,
          levelRequired: npc.levelRange?.[0],
          manifestData: { ...npc } as unknown as Record<string, unknown>,
        })),
    );

    // Mining rocks
    map.set(
      "resources-mining",
      manifests.miningRocks.map((r) => ({
        id: r.id,
        name: r.name,
        category: "resources-mining" as PaletteCategory,
        modelPath: r.modelPath || undefined,
        description: r.examine,
        levelRequired: r.levelRequired,
        manifestData: { ...r } as unknown as Record<string, unknown>,
      })),
    );

    // Woodcutting trees
    map.set(
      "resources-woodcutting",
      manifests.trees.map((t) => ({
        id: t.id,
        name: t.name,
        category: "resources-woodcutting" as PaletteCategory,
        modelPath: t.modelVariants?.[0] || undefined,
        description: t.examine,
        levelRequired: t.levelRequired,
        manifestData: { ...t } as unknown as Record<string, unknown>,
      })),
    );

    // Fishing spots
    map.set(
      "resources-fishing",
      manifests.fishingSpots.map((f) => ({
        id: f.id,
        name: f.name,
        category: "resources-fishing" as PaletteCategory,
        description: f.examine,
        levelRequired: f.levelRequired,
        manifestData: { ...f } as unknown as Record<string, unknown>,
      })),
    );

    // Spawn points — templates are created by the user, not from manifests
    map.set("spawn-points", [
      {
        id: "spawn-initial",
        name: "Initial Spawn",
        category: "spawn-points" as PaletteCategory,
        description: "Where new players first appear",
        manifestData: { spawnType: "initial" },
      },
      {
        id: "spawn-death-respawn",
        name: "Death Respawn",
        category: "spawn-points" as PaletteCategory,
        description: "Where players respawn after death",
        manifestData: { spawnType: "death-respawn" },
      },
      {
        id: "spawn-teleport-arrival",
        name: "Teleport Arrival",
        category: "spawn-points" as PaletteCategory,
        description: "Teleport destination point",
        manifestData: { spawnType: "teleport-arrival" },
      },
    ]);

    // Teleports — user-created templates
    map.set("teleports", [
      {
        id: "teleport-node",
        name: "Teleport Node",
        category: "teleports" as PaletteCategory,
        description: "Bidirectional teleport network node",
        manifestData: { nodeType: "standard" },
      },
    ]);

    // POIs — templates for each category
    map.set("pois", [
      {
        id: "poi-dungeon",
        name: "Dungeon Entrance",
        category: "pois" as PaletteCategory,
        description: "Underground dungeon access point",
        manifestData: { poiCategory: "dungeon" },
      },
      {
        id: "poi-shrine",
        name: "Shrine",
        category: "pois" as PaletteCategory,
        description: "Healing or buff shrine",
        manifestData: { poiCategory: "shrine" },
      },
      {
        id: "poi-landmark",
        name: "Landmark",
        category: "pois" as PaletteCategory,
        description: "Notable visual feature",
        manifestData: { poiCategory: "landmark" },
      },
      {
        id: "poi-resource-area",
        name: "Resource Area",
        category: "pois" as PaletteCategory,
        description: "Rich gathering zone",
        manifestData: { poiCategory: "resource_area" },
      },
      {
        id: "poi-ruin",
        name: "Ruin",
        category: "pois" as PaletteCategory,
        description: "Ancient structure remnants",
        manifestData: { poiCategory: "ruin" },
      },
      {
        id: "poi-camp",
        name: "Camp",
        category: "pois" as PaletteCategory,
        description: "NPC or player campsite",
        manifestData: { poiCategory: "camp" },
      },
      {
        id: "poi-crossing",
        name: "Crossing",
        category: "pois" as PaletteCategory,
        description: "Road or river crossing point",
        manifestData: { poiCategory: "crossing" },
      },
      {
        id: "poi-waystation",
        name: "Waystation",
        category: "pois" as PaletteCategory,
        description: "Rest stop along roads",
        manifestData: { poiCategory: "waystation" },
      },
      {
        id: "poi-fishing-spot",
        name: "Fishing Spot",
        category: "pois" as PaletteCategory,
        description: "Notable fishing location",
        manifestData: { poiCategory: "fishing_spot" },
      },
    ]);

    // Water bodies — templates for each type
    map.set("water-bodies", [
      {
        id: "water-river",
        name: "River",
        category: "water-bodies" as PaletteCategory,
        description: "Flowing water with waypoints",
        manifestData: { bodyType: "river" },
      },
      {
        id: "water-lake",
        name: "Lake",
        category: "water-bodies" as PaletteCategory,
        description: "Still water body with polygon",
        manifestData: { bodyType: "lake" },
      },
      {
        id: "water-pond",
        name: "Pond",
        category: "water-bodies" as PaletteCategory,
        description: "Small water feature",
        manifestData: { bodyType: "pond" },
      },
    ]);

    return map;
  }, [manifests]);

  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return paletteItems;

    const query = searchQuery.toLowerCase();
    const filtered = new Map<PaletteCategory, PaletteItem[]>();

    paletteItems.forEach((items, category) => {
      const matching = items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query),
      );
      if (matching.length > 0) {
        filtered.set(category, matching);
      }
    });

    return filtered;
  }, [paletteItems, searchQuery]);

  const handleCategoryToggle = useCallback((categoryId: PaletteCategory) => {
    setExpandedCategory((prev) => (prev === categoryId ? null : categoryId));
  }, []);

  const handleItemClick = useCallback(
    (item: PaletteItem) => {
      actions.startPlacement(item.category, item.id, item.name);
      // Track recent placements
      setRecentPlacements((prev) => {
        const key = `${item.category}:${item.id}`;
        const filtered = prev.filter((k) => k !== key);
        return [key, ...filtered].slice(0, 8);
      });
    },
    [actions],
  );

  const toggleFavorite = useCallback((itemId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  // Drag start handler for drag-and-drop placement
  const handleDragStart = useCallback(
    (e: React.DragEvent, item: PaletteItem) => {
      e.dataTransfer.setData(
        "application/x-entity-palette",
        JSON.stringify({
          category: item.category,
          id: item.id,
          name: item.name,
        }),
      );
      e.dataTransfer.effectAllowed = "copy";
    },
    [],
  );

  // Loading state
  if (manifests.loading) {
    return (
      <div className="flex flex-col h-full">
        <PaletteHeader viewMode={viewMode} onViewModeChange={setViewMode} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Loader2
              size={20}
              className="mx-auto animate-spin text-text-tertiary"
            />
            <p className="text-xs text-text-tertiary">Loading manifests...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (manifests.error) {
    return (
      <div className="flex flex-col h-full">
        <PaletteHeader viewMode={viewMode} onViewModeChange={setViewMode} />
        <div className="flex-1 flex items-center justify-center px-3">
          <div className="text-center space-y-2">
            <AlertTriangle size={20} className="mx-auto text-red-400" />
            <p className="text-xs text-red-400">{manifests.error}</p>
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PaletteHeader viewMode={viewMode} onViewModeChange={setViewMode} />

      {/* Search */}
      <div className="px-3 py-2 border-b border-border-primary">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            placeholder="Search entities..."
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Active placement indicator */}
      {activePlacement && (
        <div className="px-3 py-2 bg-primary/10 border-b border-primary/20">
          <div className="flex items-center justify-between">
            <span className="text-xs text-primary font-medium">
              Placing: {activePlacement.templateName}
            </span>
            <button
              className="text-xs text-text-tertiary hover:text-text-primary"
              onClick={actions.cancelPlacement}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {CATEGORIES.map((category) => {
          const items = filteredItems.get(category.id);
          if (searchQuery && !items) return null;

          const itemCount = items?.length ?? 0;
          const isExpanded = expandedCategory === category.id;

          return (
            <div
              key={category.id}
              className="border-b border-border-primary/50"
            >
              {/* Category header */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-tertiary/50 transition-colors"
                onClick={() => handleCategoryToggle(category.id)}
              >
                <ChevronRight
                  size={12}
                  className={`text-text-tertiary transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
                <span className="text-text-secondary">{category.icon}</span>
                <span className="text-xs font-medium text-text-primary flex-1">
                  {category.label}
                </span>
                <span className="text-[10px] text-text-tertiary font-mono">
                  {itemCount}
                </span>
              </button>

              {/* Expanded items */}
              {isExpanded && items && (
                <div className="pb-1">
                  {items.length === 0 ? (
                    <div className="px-7 py-2 text-[10px] text-text-tertiary italic">
                      No items available
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-3 gap-1 px-2 py-1">
                      {items.map((item) => (
                        <PaletteItemCard
                          key={item.id}
                          item={item}
                          isActive={
                            activePlacement?.templateId === item.id &&
                            activePlacement?.category === item.category
                          }
                          onClick={() => handleItemClick(item)}
                          onDragStart={(e) => handleDragStart(e, item)}
                        />
                      ))}
                    </div>
                  ) : (
                    items.map((item) => (
                      <PaletteItemRow
                        key={item.id}
                        item={item}
                        isActive={
                          activePlacement?.templateId === item.id &&
                          activePlacement?.category === item.category
                        }
                        isFavorite={favorites.has(item.id)}
                        onClick={() => handleItemClick(item)}
                        onDragStart={(e) => handleDragStart(e, item)}
                        onToggleFavorite={() => toggleFavorite(item.id)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Header for the palette panel */
function PaletteHeader({
  viewMode,
  onViewModeChange,
}: {
  viewMode: "list" | "grid";
  onViewModeChange: (mode: "list" | "grid") => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border-primary">
      <Shield size={14} className="text-primary" />
      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex-1">
        Entity Palette
      </span>
      <div className="flex items-center gap-0.5">
        <button
          className={`p-1 rounded transition-colors ${viewMode === "list" ? "text-primary bg-primary/10" : "text-text-tertiary hover:text-text-primary"}`}
          onClick={() => onViewModeChange("list")}
          title="List view"
        >
          <List size={12} />
        </button>
        <button
          className={`p-1 rounded transition-colors ${viewMode === "grid" ? "text-primary bg-primary/10" : "text-text-tertiary hover:text-text-primary"}`}
          onClick={() => onViewModeChange("grid")}
          title="Grid view"
        >
          <Grid3x3 size={12} />
        </button>
      </div>
    </div>
  );
}

/** Category badge color mapping */
const CATEGORY_COLORS: Record<string, string> = {
  npcs: "bg-blue-500/20 text-blue-400",
  stations: "bg-orange-500/20 text-orange-400",
  "mob-spawns": "bg-red-500/20 text-red-400",
  "resources-mining": "bg-amber-500/20 text-amber-400",
  "resources-woodcutting": "bg-green-500/20 text-green-400",
  "resources-fishing": "bg-cyan-500/20 text-cyan-400",
  "spawn-points": "bg-violet-500/20 text-violet-400",
  teleports: "bg-purple-500/20 text-purple-400",
  pois: "bg-emerald-500/20 text-emerald-400",
  "water-bodies": "bg-sky-500/20 text-sky-400",
};

/** Single item row in the palette (list view) */
function PaletteItemRow({
  item,
  isActive,
  isFavorite,
  onClick,
  onDragStart,
  onToggleFavorite,
}: {
  item: PaletteItem;
  isActive: boolean;
  isFavorite: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      className={`group w-full flex items-center gap-2 px-3 py-1.5 pl-7 text-left transition-colors cursor-pointer ${
        isActive
          ? "bg-primary/15 border-l-2 border-primary"
          : "hover:bg-bg-tertiary/50 border-l-2 border-transparent"
      }`}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      title={item.description}
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text-primary truncate">{item.name}</div>
        {item.levelRequired != null && item.levelRequired > 1 && (
          <div className="text-[10px] text-text-tertiary">
            Lvl {item.levelRequired}
          </div>
        )}
      </div>
      <button
        className={`p-0.5 rounded transition-opacity ${isFavorite ? "text-amber-400 opacity-100" : "text-text-tertiary opacity-0 group-hover:opacity-100"}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        title={isFavorite ? "Unpin" : "Pin to favorites"}
      >
        <Star size={10} fill={isFavorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

/** Grid card view for an entity */
function PaletteItemCard({
  item,
  isActive,
  onClick,
  onDragStart,
}: {
  item: PaletteItem;
  isActive: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const badgeColor =
    CATEGORY_COLORS[item.category] ?? "bg-gray-500/20 text-gray-400";
  const categoryLabel =
    CATEGORIES.find((c) => c.id === item.category)?.label ?? item.category;

  return (
    <div
      className={`flex flex-col items-center p-2 rounded-md border cursor-pointer transition-colors ${
        isActive
          ? "border-primary bg-primary/10"
          : "border-border-primary hover:border-border-secondary hover:bg-bg-tertiary/50"
      }`}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      title={item.description}
    >
      {/* Placeholder thumbnail area */}
      <div className="w-full aspect-square rounded bg-bg-tertiary flex items-center justify-center mb-1.5">
        <span className="text-lg text-text-tertiary/40">
          {item.name.charAt(0).toUpperCase()}
        </span>
      </div>
      <span className="text-[10px] text-text-primary text-center truncate w-full leading-tight">
        {item.name}
      </span>
      <span
        className={`text-[8px] px-1 py-0.5 rounded-sm mt-0.5 ${badgeColor}`}
      >
        {categoryLabel}
      </span>
    </div>
  );
}
