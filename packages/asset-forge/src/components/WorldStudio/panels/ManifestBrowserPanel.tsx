/**
 * ManifestBrowserPanel — Browse and edit all game manifests within World Studio
 *
 * Shows manifests organized by category (world, entities, items, combat, etc.)
 * with entry counts and quick access to form or JSON editors.
 */

import {
  Book,
  ChevronRight,
  ChevronDown,
  Search,
  Package,
  Swords,
  Users,
  MapPin,
  Music,
  Settings,
  TrendingUp,
  ChefHat,
  Pickaxe,
  AlertCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import React, { useState, useCallback, useMemo } from "react";

import type { ManifestCategory, ManifestFileInfo } from "../types";
import { MANIFEST_REGISTRY } from "../types";
import { useWorldStudio } from "../WorldStudioContext";
import { ManifestFormEditor } from "./properties/ManifestEntryEditor";

const CATEGORY_LABELS: Record<ManifestCategory, string> = {
  world: "World",
  entities: "Entities",
  items: "Items",
  combat: "Combat",
  progression: "Progression",
  recipes: "Recipes",
  gathering: "Gathering",
  audio: "Audio",
  config: "Config",
};

const CATEGORY_ICONS: Record<ManifestCategory, React.ReactNode> = {
  world: <MapPin size={12} />,
  entities: <Users size={12} />,
  items: <Package size={12} />,
  combat: <Swords size={12} />,
  progression: <TrendingUp size={12} />,
  recipes: <ChefHat size={12} />,
  gathering: <Pickaxe size={12} />,
  audio: <Music size={12} />,
  config: <Settings size={12} />,
};

const CATEGORY_ORDER: ManifestCategory[] = [
  "entities",
  "items",
  "combat",
  "recipes",
  "gathering",
  "progression",
  "world",
  "audio",
  "config",
];

/** Get entry count for a manifest from loaded data */
function getEntryCount(
  name: string,
  manifests: ReturnType<typeof useWorldStudio>["state"]["manifests"],
): number | null {
  switch (name) {
    case "npcs":
      return manifests.npcs.length;
    case "stations":
      return manifests.stations.length;
    case "stores":
      return manifests.stores.length;
    case "quests":
      return manifests.quests.length;
    case "combat-spells":
      return manifests.combatSpells.length;
    case "prayers":
      return manifests.prayers.length;
    case "runes":
      return manifests.runes.length;
    case "ammunition":
      return manifests.ammunition.length;
    case "duel-arenas":
      return manifests.duelArenas.length;
    case "skill-unlocks":
      return manifests.skillUnlocks.length;
    case "tier-requirements":
      return manifests.tierRequirements.length;
    case "gathering/mining":
      return manifests.miningRocks.length;
    case "gathering/woodcutting":
      return manifests.trees.length;
    case "gathering/fishing":
      return manifests.fishingSpots.length;
    default: {
      // Item manifests
      if (name.startsWith("items/")) {
        const typeMap: Record<string, string> = {
          "items/weapons": "weapon",
          "items/armor": "armor",
          "items/resources": "resource",
          "items/tools": "tool",
          "items/ammunition": "ammunition",
          "items/food": "food",
          "items/misc": "misc",
          "items/runes": "rune",
        };
        const t = typeMap[name];
        if (t) return manifests.items.filter((i) => i.type === t).length;
      }
      // Recipe manifests
      if (name.startsWith("recipes/")) {
        const skill = name.replace("recipes/", "");
        return manifests.recipes.filter((r) => r.skill === skill).length;
      }
      return null;
    }
  }
}

interface ManifestRowProps {
  info: ManifestFileInfo;
  entryCount: number | null;
  isSelected: boolean;
  onClick: () => void;
}

function ManifestRow({
  info,
  entryCount,
  isSelected,
  onClick,
}: ManifestRowProps) {
  return (
    <button
      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors ${
        isSelected
          ? "bg-primary/15 text-primary"
          : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
      }`}
      onClick={onClick}
    >
      <span className="flex-1 truncate">{info.displayName}</span>
      {entryCount !== null && (
        <span className="text-[10px] text-text-tertiary tabular-nums">
          {entryCount}
        </span>
      )}
      {!info.editable && (
        <span title="Read-only" className="flex-shrink-0">
          <AlertCircle size={10} className="text-amber-400/60" />
        </span>
      )}
    </button>
  );
}

export function ManifestBrowserPanel() {
  const { state } = useWorldStudio();
  const manifests = state.manifests;
  const [expandedCategories, setExpandedCategories] = useState<
    Set<ManifestCategory>
  >(new Set(["entities", "items"]));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedManifest, setSelectedManifest] = useState<string | null>(null);

  const toggleCategory = useCallback((cat: ManifestCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // Group manifests by category
  const groupedManifests = useMemo(() => {
    const groups = new Map<ManifestCategory, ManifestFileInfo[]>();
    for (const cat of CATEGORY_ORDER) {
      groups.set(cat, []);
    }
    for (const info of MANIFEST_REGISTRY) {
      const list = groups.get(info.category);
      if (list) list.push(info);
    }
    return groups;
  }, []);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedManifests;

    const q = searchQuery.toLowerCase();
    const filtered = new Map<ManifestCategory, ManifestFileInfo[]>();
    for (const [cat, infos] of groupedManifests) {
      const matching = infos.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q),
      );
      if (matching.length > 0) filtered.set(cat, matching);
    }
    return filtered;
  }, [groupedManifests, searchQuery]);

  // Selected manifest info
  const selectedInfo = selectedManifest
    ? MANIFEST_REGISTRY.find((r) => r.name === selectedManifest)
    : null;

  if (!manifests.loaded) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-primary">
          <Book size={12} className="text-text-tertiary" />
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Manifests
          </span>
        </div>
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
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-primary">
        <Book size={12} className="text-text-tertiary" />
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Manifests
        </span>
        <span className="text-[10px] text-text-tertiary ml-auto">
          {MANIFEST_REGISTRY.length} files
        </span>
      </div>

      {/* Search */}
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
            placeholder="Search manifests..."
            className="w-full pl-7 pr-2 py-1 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {/* Category list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {selectedManifest && selectedInfo ? (
          // Selected manifest detail view
          <div>
            <button
              className="w-full text-left px-3 py-2 flex items-center gap-1.5 text-xs text-primary hover:bg-bg-tertiary border-b border-border-primary"
              onClick={() => setSelectedManifest(null)}
            >
              <ChevronRight size={10} className="rotate-180" />
              Back to list
            </button>
            <ManifestDetailView info={selectedInfo} />
          </div>
        ) : (
          // Category browser
          Array.from(filteredGroups.entries()).map(([category, infos]) => (
            <div key={category}>
              <button
                className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary transition-colors"
                onClick={() => toggleCategory(category)}
              >
                {expandedCategories.has(category) ? (
                  <ChevronDown size={10} />
                ) : (
                  <ChevronRight size={10} />
                )}
                {CATEGORY_ICONS[category]}
                <span>{CATEGORY_LABELS[category]}</span>
                <span className="text-[10px] text-text-tertiary ml-auto">
                  {infos.length}
                </span>
              </button>
              {expandedCategories.has(category) && (
                <div className="pb-0.5">
                  {infos.map((info) => (
                    <ManifestRow
                      key={info.name}
                      info={info}
                      entryCount={getEntryCount(info.name, manifests)}
                      isSelected={selectedManifest === info.name}
                      onClick={() => setSelectedManifest(info.name)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Summary footer */}
      <div className="px-3 py-1.5 border-t border-border-primary text-[10px] text-text-tertiary flex justify-between">
        <span>
          {manifests.items.length} items · {manifests.npcs.length} NPCs
        </span>
        <span>{manifests.recipes.length} recipes</span>
      </div>
    </div>
  );
}

// ============== MANIFEST DETAIL VIEW ==============

function ManifestDetailView({ info }: { info: ManifestFileInfo }) {
  const { state } = useWorldStudio();
  const manifests = state.manifests;
  const entryCount = getEntryCount(info.name, manifests);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  // Get entries for this manifest
  const entries = useMemo(() => {
    switch (info.name) {
      case "npcs":
        return manifests.npcs.map((n) => ({
          id: n.id,
          name: n.name,
          detail: `${n.category} Lv${n.levelRange[0]}-${n.levelRange[1]}`,
        }));
      case "stations":
        return manifests.stations.map((s) => ({
          id: s.type,
          name: s.name,
          detail: s.type,
        }));
      case "stores":
        return manifests.stores.map((s) => ({
          id: s.id,
          name: s.name,
          detail: `${s.items.length} items`,
        }));
      case "quests":
        return manifests.quests.map((q) => ({
          id: q.id,
          name: q.name,
          detail: `${q.difficulty} · ${q.stages.length} stages`,
        }));
      case "combat-spells":
        return manifests.combatSpells.map((s) => ({
          id: s.id,
          name: s.name,
          detail: `Lv${s.level} ${s.element} (${s.tier})`,
        }));
      case "prayers":
        return manifests.prayers.map((p) => ({
          id: p.id,
          name: p.name,
          detail: `Lv${p.level} ${p.category}`,
        }));
      case "runes":
        return manifests.runes.map((r) => ({
          id: r.id,
          name: r.name,
          detail: r.element ?? "—",
        }));
      case "ammunition":
        return manifests.ammunition.map((a) => ({
          id: a.id,
          name: a.name,
          detail: `+${a.rangedStrength} str`,
        }));
      case "duel-arenas":
        return manifests.duelArenas.map((a) => ({
          id: `arena_${a.arenaId}`,
          name: `Arena ${a.arenaId}`,
          detail: `Size ${a.size}`,
        }));
      case "skill-unlocks":
        return manifests.skillUnlocks
          .slice(0, 50)
          .map((u) => ({
            id: `${u.skill}_${u.level}`,
            name: `${u.skill} Lv${u.level}`,
            detail: u.description,
          }));
      case "gathering/mining":
        return manifests.miningRocks.map((r) => ({
          id: r.id,
          name: r.name,
          detail: `Lv${r.levelRequired}`,
        }));
      case "gathering/woodcutting":
        return manifests.trees.map((t) => ({
          id: t.id,
          name: t.name,
          detail: `Lv${t.levelRequired}`,
        }));
      case "gathering/fishing":
        return manifests.fishingSpots.map((f) => ({
          id: f.id,
          name: f.name,
          detail: `Lv${f.levelRequired}`,
        }));
      default: {
        // Items
        if (info.name.startsWith("items/")) {
          const typeMap: Record<string, string> = {
            "items/weapons": "weapon",
            "items/armor": "armor",
            "items/resources": "resource",
            "items/tools": "tool",
            "items/ammunition": "ammunition",
            "items/food": "food",
            "items/misc": "misc",
            "items/runes": "rune",
          };
          const t = typeMap[info.name];
          if (t) {
            return manifests.items
              .filter((i) => i.type === t)
              .map((i) => ({
                id: i.id,
                name: i.name,
                detail:
                  [
                    i.tier,
                    i.rarity,
                    i.levelRequired ? `Lv${i.levelRequired}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || i.type,
              }));
          }
        }
        // Recipes
        if (info.name.startsWith("recipes/")) {
          const skill = info.name.replace("recipes/", "");
          return manifests.recipes
            .filter((r) => r.skill === skill)
            .map((r) => ({
              id: r.id,
              name: r.output,
              detail: `Lv${r.level} · ${r.xp}xp`,
            }));
        }
        return [];
      }
    }
  }, [info.name, manifests]);

  const [entrySearch, setEntrySearch] = useState("");
  const filteredEntries = useMemo(() => {
    if (!entrySearch.trim()) return entries;
    const q = entrySearch.toLowerCase();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q),
    );
  }, [entries, entrySearch]);

  return (
    <div className="flex flex-col">
      {/* Manifest header */}
      <div className="px-3 py-2 border-b border-border-primary">
        <div className="text-xs font-medium text-text-primary">
          {info.displayName}
        </div>
        <div className="text-[10px] text-text-tertiary mt-0.5">
          {info.description}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
            {info.category}
          </span>
          {entryCount !== null && (
            <span className="text-[10px] text-text-tertiary">
              {entryCount} entries
            </span>
          )}
          {!info.editable && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400">
              read-only
            </span>
          )}
        </div>
      </div>

      {/* Entry search */}
      {entries.length > 10 && (
        <div className="px-2 py-1 border-b border-border-primary">
          <div className="relative">
            <Search
              size={10}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              value={entrySearch}
              onChange={(e) => setEntrySearch(e.target.value)}
              placeholder={`Search ${info.displayName.toLowerCase()}...`}
              className="w-full pl-6 pr-2 py-0.5 text-[10px] bg-bg-tertiary border border-border-primary rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>
      )}

      {/* Entry list */}
      <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
        {filteredEntries.map((entry) => (
          <React.Fragment key={entry.id}>
            <div className="flex items-center gap-2 px-3 py-1 text-xs border-b border-border-primary/30 hover:bg-bg-tertiary transition-colors">
              <div className="flex-1 min-w-0">
                <div className="text-text-primary truncate">{entry.name}</div>
                <div className="text-[10px] text-text-tertiary truncate">
                  {entry.detail}
                </div>
              </div>
              <button
                className="flex-shrink-0 p-0.5 rounded text-text-tertiary hover:text-primary transition-colors"
                title="View raw data"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEntryId(
                    selectedEntryId === entry.id ? null : entry.id,
                  );
                }}
              >
                <ExternalLink size={10} />
              </button>
            </div>
            {selectedEntryId === entry.id && (
              <>
                <ManifestFormEditor
                  manifestName={info.name}
                  entryId={entry.id}
                />
                <ManifestEntryDetail
                  manifestName={info.name}
                  entryId={entry.id}
                />
              </>
            )}
          </React.Fragment>
        ))}
        {filteredEntries.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-text-tertiary">
            {entrySearch ? "No matching entries" : "No entries loaded"}
          </div>
        )}
      </div>

      {/* Raw manifest JSON viewer */}
      {info.name !== "model-bounds" && (
        <RawManifestViewer manifestName={info.name} />
      )}
    </div>
  );
}

/**
 * Shows raw JSON data for a specific manifest entry.
 */
function ManifestEntryDetail({
  manifestName,
  entryId,
}: {
  manifestName: string;
  entryId: string;
}) {
  const { state } = useWorldStudio();
  const manifests = state.manifests;

  const rawData = useMemo(() => {
    // Find the entry's raw data from manifests
    switch (manifestName) {
      case "npcs": {
        const npc = manifests.npcs.find((n) => n.id === entryId);
        return npc?._raw ?? npc;
      }
      case "quests": {
        return manifests.quests.find((q) => q.id === entryId) ?? null;
      }
      case "stores": {
        const store = manifests.stores.find((s) => s.id === entryId);
        return store;
      }
      case "combat-spells": {
        const spell = manifests.combatSpells.find((s) => s.id === entryId);
        return spell;
      }
      case "prayers": {
        const prayer = manifests.prayers.find((p) => p.id === entryId);
        return prayer;
      }
      case "runes": {
        const rune = manifests.runes.find((r) => r.id === entryId);
        return rune;
      }
      case "ammunition": {
        const ammo = manifests.ammunition.find((a) => a.id === entryId);
        return ammo;
      }
      default: {
        // Items
        if (manifestName.startsWith("items/")) {
          return manifests.items.find((i) => i.id === entryId) ?? null;
        }
        // Recipes
        if (manifestName.startsWith("recipes/")) {
          const recipe = manifests.recipes.find((r) => r.id === entryId);
          return recipe;
        }
        // Gathering
        if (manifestName === "gathering/mining") {
          return manifests.miningRocks.find((r) => r.id === entryId);
        }
        if (manifestName === "gathering/woodcutting") {
          return manifests.trees.find((t) => t.id === entryId);
        }
        if (manifestName === "gathering/fishing") {
          return manifests.fishingSpots.find((f) => f.id === entryId);
        }
        return null;
      }
    }
  }, [manifestName, entryId, manifests]);

  if (!rawData) {
    return (
      <div className="px-3 py-2 bg-bg-tertiary/30 text-[10px] text-text-tertiary italic">
        No data available
      </div>
    );
  }

  return (
    <div className="bg-bg-tertiary/30 border-y border-border-primary/30">
      <pre className="px-3 py-2 text-[9px] text-text-secondary font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto scrollbar-thin">
        {JSON.stringify(rawData, null, 2)}
      </pre>
    </div>
  );
}

/**
 * Collapsible raw JSON viewer for the entire manifest file.
 */
function RawManifestViewer({ manifestName }: { manifestName: string }) {
  const [expanded, setExpanded] = useState(false);
  const { state } = useWorldStudio();

  const rawJson = useMemo(() => {
    // Check rawManifests first
    const raw = state.manifests.rawManifests?.[manifestName];
    if (raw) return raw;
    return null;
  }, [manifestName, state.manifests.rawManifests]);

  if (!rawJson) return null;

  return (
    <div className="border-t border-border-primary">
      <button
        className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Raw JSON
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-[9px] text-text-secondary font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-[50vh] overflow-y-auto scrollbar-thin bg-bg-tertiary/20">
          {typeof rawJson === "string"
            ? rawJson
            : JSON.stringify(rawJson, null, 2)}
        </pre>
      )}
    </div>
  );
}
