/**
 * HierarchyPanel — Left sidebar showing world content tree
 *
 * Displays the hierarchical structure of the world:
 * - Terrain chunks
 * - Biomes
 * - Towns (with buildings, NPCs)
 * - Roads
 * - Layers (NPCs, quests, bosses, events, lore, difficulty zones, custom placements)
 *
 * Click a node to select it in the viewport + properties panel.
 */

import {
  ChevronDown,
  ChevronRight,
  Search,
  TreePine,
  Mountain,
  Building2,
  Route,
  Users,
  Swords,
  ScrollText,
  CalendarDays,
  BookOpen,
  Shield,
  Package,
  Globe,
  MapPin,
  Navigation,
  Skull,
  Gem,
  Flame,
  Compass,
  Droplets,
  Music,
  Volume2,
  Speaker,
  Radio,
} from "lucide-react";
import React, { useState, useCallback } from "react";

import type { HierarchyNode, Selection } from "../../WorldBuilder/types";
import { useWorldStudio } from "../WorldStudioContext";

/** Map hierarchy node types to valid Selection.type values (only selectable types) */
const SELECTABLE_NODE_TYPES: Record<string, Selection["type"] | undefined> = {
  terrain: "terrain",
  chunk: "chunk",
  biome: "biome",
  tile: "tile",
  town: "town",
  building: "building",
  npc: "npc",
  quest: "quest",
  boss: "boss",
  event: "event",
  lore: "lore",
  difficultyZone: "difficultyZone",
  customPlacement: "customPlacement",
  wilderness: "wilderness",
  spawnPoint: "spawnPoint",
  teleport: "teleport",
  mobSpawn: "mobSpawn",
  resource: "resource",
  station: "station",
  road: "road",
  poi: "poi",
  waterBody: "waterBody",
  musicZone: "musicZone",
  ambientZone: "ambientZone",
  sfxTrigger: "sfxTrigger",
};

const TYPE_ICONS: Record<string, typeof Globe> = {
  world: Globe,
  terrain: Mountain,
  biome: TreePine,
  biomes: TreePine,
  town: Building2,
  towns: Building2,
  building: Building2,
  road: Route,
  roads: Route,
  npc: Users,
  npcs: Users,
  quest: ScrollText,
  quests: ScrollText,
  boss: Swords,
  bosses: Swords,
  event: CalendarDays,
  events: CalendarDays,
  lore: BookOpen,
  loreEntries: BookOpen,
  difficultyZone: Shield,
  difficultyZones: Shield,
  customPlacement: Package,
  customPlacements: Package,
  layers: Package,
  chunks: Mountain,
  chunk: Mountain,
  spawnPoint: MapPin,
  spawnPoints: MapPin,
  teleport: Navigation,
  teleports: Navigation,
  mobSpawn: Skull,
  mobSpawns: Skull,
  resource: Gem,
  resources: Gem,
  station: Flame,
  stations: Flame,
  poi: Compass,
  pois: Compass,
  waterBody: Droplets,
  waterBodies: Droplets,
  water: Droplets,
  audio: Radio,
  musicZones: Music,
  musicZone: Music,
  ambientZones: Volume2,
  ambientZone: Volume2,
  sfxTriggers: Speaker,
  sfxTrigger: Speaker,
};

interface TreeNodeProps {
  node: HierarchyNode;
  depth: number;
  expandedNodes: Set<string>;
  selectedId: string | null;
  onToggle: (nodeId: string) => void;
  onSelect: (node: HierarchyNode) => void;
}

function TreeNode({
  node,
  depth,
  expandedNodes,
  selectedId,
  onToggle,
  onSelect,
}: TreeNodeProps) {
  const isExpanded = expandedNodes.has(node.id);
  const isSelected =
    selectedId != null &&
    (selectedId === node.dataId || selectedId === node.id);
  const hasChildren = node.children && node.children.length > 0;
  const Icon = TYPE_ICONS[node.type] ?? Globe;

  return (
    <div>
      <button
        className={`w-full flex items-center gap-1.5 py-1 px-1 rounded-sm text-xs transition-colors ${
          isSelected
            ? "bg-primary/15 text-primary"
            : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
        }`}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={() => {
          if (hasChildren && node.expandable !== false) {
            onToggle(node.id);
          }
          onSelect(node);
        }}
      >
        {/* Expand/collapse chevron */}
        <span className="w-3.5 flex-shrink-0">
          {hasChildren && node.expandable !== false ? (
            isExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )
          ) : null}
        </span>

        <Icon size={12} className="flex-shrink-0 opacity-60" />
        <span className="truncate flex-1 text-left">{node.label}</span>
        {node.badge !== undefined && node.badge > 0 && (
          <span className="text-[10px] text-text-tertiary bg-bg-tertiary px-1 rounded">
            {node.badge}
          </span>
        )}
      </button>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HierarchyPanel() {
  const { state, actions, computed } = useWorldStudio();
  const [searchQuery, setSearchQuery] = useState("");

  const expandedNodes = state.builder.editing.expandedNodes;
  const selection = state.builder.editing.selection;
  const selectedId = selection ? selection.id : null;
  const hierarchyTree = computed.getHierarchyTree();

  const handleToggle = useCallback(
    (nodeId: string) => {
      actions.toggleNodeExpanded(nodeId);
    },
    [actions],
  );

  const handleSelect = useCallback(
    (node: HierarchyNode) => {
      const selectionType = SELECTABLE_NODE_TYPES[node.type];
      if (node.dataId && selectionType) {
        actions.setSelection({
          type: selectionType,
          id: node.dataId,
          path: [{ type: node.type, id: node.dataId, name: node.label }],
        });
      }
    },
    [actions],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Hierarchy
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
            placeholder="Search..."
            className="w-full pl-6 pr-2 py-1 text-xs bg-bg-tertiary rounded-sm border border-border-primary text-text-primary placeholder-text-tertiary focus:outline-none focus:border-primary/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto px-1 py-1 scrollbar-thin">
        {hierarchyTree ? (
          <TreeNode
            node={hierarchyTree}
            depth={0}
            expandedNodes={expandedNodes}
            selectedId={selectedId}
            onToggle={handleToggle}
            onSelect={handleSelect}
          />
        ) : (
          <div className="flex items-center justify-center h-32 text-text-tertiary text-xs">
            No world loaded
          </div>
        )}
      </div>
    </div>
  );
}
