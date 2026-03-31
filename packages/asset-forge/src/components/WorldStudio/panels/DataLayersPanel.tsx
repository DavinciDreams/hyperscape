/**
 * DataLayersPanel — UE5-style editor visibility layers.
 *
 * Toggle visibility of entire entity categories in the viewport.
 * Useful for decluttering the view when working on specific entity types.
 *
 * Each toggle controls THREE.Object3D.visible on all entities of that category.
 */

import {
  Eye,
  EyeOff,
  Users,
  Box,
  Gem,
  Skull,
  MapPin,
  Navigation,
  Compass,
  Droplets,
  Music,
  Volume2,
  Speaker,
  TreePine,
  Building2,
  Route,
  Tag,
  Map,
} from "lucide-react";
import React, { useState, useCallback } from "react";

// ============== LAYER DEFINITIONS ==============

interface LayerDef {
  id: string;
  label: string;
  icon: typeof Users;
  description: string;
  shortcut?: string;
}

const EDITOR_LAYERS: LayerDef[] = [
  {
    id: "npcs",
    label: "NPCs",
    icon: Users,
    description: "NPC markers and labels",
  },
  {
    id: "stations",
    label: "Stations",
    icon: Box,
    description: "Crafting stations, banks, altars",
  },
  {
    id: "resources",
    label: "Resources",
    icon: Gem,
    description: "Mining rocks, trees, fishing spots",
  },
  {
    id: "mobSpawns",
    label: "Mob Spawns",
    icon: Skull,
    description: "Monster spawn zones",
  },
  {
    id: "spawnPoints",
    label: "Spawn Points",
    icon: MapPin,
    description: "Player spawn locations",
  },
  {
    id: "teleports",
    label: "Teleports",
    icon: Navigation,
    description: "Teleport network nodes",
  },
  {
    id: "pois",
    label: "Points of Interest",
    icon: Compass,
    description: "Dungeons, shrines, landmarks",
  },
  {
    id: "waterBodies",
    label: "Water Bodies",
    icon: Droplets,
    description: "Rivers, lakes, ponds",
  },
  {
    id: "buildings",
    label: "Buildings",
    icon: Building2,
    description: "Town buildings and structures",
  },
  { id: "roads", label: "Roads", icon: Route, description: "Road network" },
  {
    id: "vegetation",
    label: "Vegetation",
    icon: TreePine,
    description: "Trees, grass, flowers",
  },
  {
    id: "boundaries",
    label: "Area Boundaries",
    icon: Map,
    description: "Area boundary outlines",
  },
  {
    id: "labels",
    label: "Labels",
    icon: Tag,
    description: "Floating name labels",
  },
  {
    id: "musicZones",
    label: "Music Zones",
    icon: Music,
    description: "Music playback regions",
  },
  {
    id: "ambientZones",
    label: "Ambient Zones",
    icon: Volume2,
    description: "Ambient sound layers",
  },
  {
    id: "sfxTriggers",
    label: "SFX Triggers",
    icon: Speaker,
    description: "Point-source sound effects",
  },
];

// ============== COMPONENT ==============

export function DataLayersPanel() {
  const [layerVisibility, setLayerVisibility] = useState<
    Record<string, boolean>
  >(() => {
    const initial: Record<string, boolean> = {};
    for (const layer of EDITOR_LAYERS) {
      initial[layer.id] = true;
    }
    return initial;
  });

  const toggleLayer = useCallback((layerId: string) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
    // TODO: Wire to EntityRegistry.setCategoryVisibility and scene object toggling
  }, []);

  const showAll = useCallback(() => {
    setLayerVisibility((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) next[key] = true;
      return next;
    });
  }, []);

  const hideAll = useCallback(() => {
    setLayerVisibility((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) next[key] = false;
      return next;
    });
  }, []);

  const visibleCount = Object.values(layerVisibility).filter(Boolean).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Data Layers
        </span>
        <div className="flex items-center gap-1">
          <button
            className="text-[10px] text-text-tertiary hover:text-primary transition-colors"
            onClick={showAll}
          >
            All
          </button>
          <span className="text-text-tertiary text-[10px]">/</span>
          <button
            className="text-[10px] text-text-tertiary hover:text-primary transition-colors"
            onClick={hideAll}
          >
            None
          </button>
        </div>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto py-1">
        {EDITOR_LAYERS.map((layer) => {
          const visible = layerVisibility[layer.id] !== false;
          const Icon = layer.icon;
          return (
            <button
              key={layer.id}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                visible
                  ? "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                  : "text-text-tertiary/50 hover:text-text-tertiary hover:bg-bg-tertiary"
              }`}
              onClick={() => toggleLayer(layer.id)}
              title={layer.description}
            >
              {/* Visibility icon */}
              {visible ? (
                <Eye size={12} className="flex-shrink-0 text-text-tertiary" />
              ) : (
                <EyeOff
                  size={12}
                  className="flex-shrink-0 text-text-tertiary/40"
                />
              )}

              {/* Category icon */}
              <Icon
                size={12}
                className={`flex-shrink-0 ${visible ? "opacity-60" : "opacity-20"}`}
              />

              {/* Label */}
              <span
                className={`flex-1 text-left ${!visible ? "line-through opacity-50" : ""}`}
              >
                {layer.label}
              </span>

              {/* Shortcut hint */}
              {layer.shortcut && (
                <span className="text-[9px] text-text-tertiary">
                  {layer.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status */}
      <div className="px-3 py-1.5 border-t border-border-primary text-[10px] text-text-tertiary">
        {visibleCount}/{EDITOR_LAYERS.length} layers visible
      </div>
    </div>
  );
}
