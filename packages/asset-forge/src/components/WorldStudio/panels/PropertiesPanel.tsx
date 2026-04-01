/**
 * PropertiesPanel — Right sidebar showing properties for selected objects
 *
 * Dispatches to per-type property editors based on selection type:
 * - terrain/chunk → TerrainProperties
 * - biome → BiomeProperties
 * - town → TownProperties
 * - npc → NPCProperties
 * - spawnPoint → SpawnPointProperties
 * - teleport → TeleportProperties
 * - mobSpawn → MobSpawnProperties
 * - resource → ResourceProperties
 * - station → StationProperties
 */

import { Info, Settings, Search } from "lucide-react";
import React, { useState, useMemo, createContext, useContext } from "react";

import { useWorldStudio } from "../WorldStudioContext";
import { InfoRow, PropertySection } from "./properties/PropertyControls";
import { TransformSection } from "./properties/TransformSection";
import { TerrainProperties } from "./properties/TerrainProperties";
import { BiomeProperties } from "./properties/BiomeProperties";
import { TownProperties } from "./properties/TownProperties";
import { NPCProperties } from "./properties/NPCProperties";
import { QuestProperties } from "./properties/QuestProperties";
import { SpawnPointProperties } from "./properties/SpawnPointProperties";
import { TeleportProperties } from "./properties/TeleportProperties";
import { MobSpawnProperties } from "./properties/MobSpawnProperties";
import { ResourceProperties } from "./properties/ResourceProperties";
import { StationProperties } from "./properties/StationProperties";
import { RoadProperties } from "./properties/RoadProperties";
import { POIProperties } from "./properties/POIProperties";
import { WaterBodyProperties } from "./properties/WaterBodyProperties";
import { MusicZoneProperties } from "./properties/MusicZoneProperties";
import { AmbientZoneProperties } from "./properties/AmbientZoneProperties";
import { SFXTriggerProperties } from "./properties/SFXTriggerProperties";
import { GameNPCProperties } from "./properties/GameNPCProperties";
import { GameStationProperties } from "./properties/GameStationProperties";
import { GameResourceProperties } from "./properties/GameResourceProperties";
import { GameMobSpawnProperties } from "./properties/GameMobSpawnProperties";

/** Context for property search filtering */
const PropertySearchContext = createContext<string>("");

/** Wrapper that hides children when search doesn't match the label */
function SearchableSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const search = useContext(PropertySearchContext);
  if (search && !label.toLowerCase().includes(search.toLowerCase())) {
    return null;
  }
  return <>{children}</>;
}

export function PropertiesPanel() {
  const [searchText, setSearchText] = useState("");
  const { state } = useWorldStudio();
  const selection = state.builder.editing.selection;
  const world = state.builder.editing.world;
  const extendedLayers = state.extendedLayers;
  const audioLayers = state.audioLayers;

  // Resolve the selected entity for per-type editors
  const renderSelectionEditor = () => {
    if (!selection) return null;

    switch (selection.type) {
      case "terrain":
      case "chunk":
        if (world) return <TerrainProperties world={world} />;
        break;

      case "tile": {
        // Tile inspector — show detailed tile data from viewport click
        const td = selection.tileData;
        if (td) {
          return (
            <PropertySection title="Tile Inspector">
              <InfoRow label="Tile" value={`(${td.tileX}, ${td.tileZ})`} />
              <InfoRow label="Chunk" value={`(${td.chunkX}, ${td.chunkZ})`} />
              <InfoRow
                label="World"
                value={`(${td.worldX.toFixed(1)}, ${td.worldZ.toFixed(1)})`}
              />
              <InfoRow label="Height" value={`${td.height.toFixed(1)}m`} />
              <InfoRow label="Biome" value={td.biome} />
              <InfoRow
                label="Slope"
                value={`${(td.slope * 100).toFixed(0)}%`}
              />
              <InfoRow label="Walkable" value={td.walkable ? "Yes" : "No"} />
              <InfoRow
                label="In Town"
                value={td.inTown ? (td.townId ?? "Yes") : "No"}
              />
              <InfoRow
                label="Wilderness"
                value={td.inWilderness ? "Yes" : "No"}
              />
              <InfoRow label="Difficulty" value={`${td.difficultyLevel}`} />
            </PropertySection>
          );
        }
        if (world) return <TerrainProperties world={world} />;
        break;
      }

      case "biome":
        if (world)
          return <BiomeProperties biomeId={selection.id} world={world} />;
        break;

      case "town":
        if (world)
          return <TownProperties townId={selection.id} world={world} />;
        break;

      case "building":
        if (world) {
          const building = world.foundation.buildings.find(
            (b) => b.id === selection.id,
          );
          if (building) {
            return (
              <>
                <PropertySection title="Building">
                  <InfoRow label="Name" value={building.name} />
                  <InfoRow label="Type" value={building.type} />
                  <InfoRow label="Town" value={building.townId} />
                </PropertySection>
                <PropertySection title="Transform">
                  <TransformSection
                    position={{
                      x: building.position.x,
                      y: 0,
                      z: building.position.z,
                    }}
                    readOnly
                  />
                </PropertySection>
              </>
            );
          }
        }
        break;

      case "npc": {
        // Check editor-placed NPCs (extendedLayers) first, then world.layers
        const extNpc = state.extendedLayers.npcs.find(
          (n) => n.id === selection.id,
        );
        if (extNpc) return <NPCProperties npc={extNpc} />;
        if (world) {
          const npc = world.layers.npcs.find((n) => n.id === selection.id);
          if (npc) return <NPCProperties npc={npc} />;
        }
        break;
      }

      case "quest": {
        if (world) {
          const quest = world.layers.quests.find((q) => q.id === selection.id);
          if (quest) return <QuestProperties quest={quest} />;
        }
        break;
      }

      case "boss": {
        if (world) {
          const boss = world.layers.bosses.find((b) => b.id === selection.id);
          if (boss) {
            return (
              <PropertySection title="Boss">
                <InfoRow label="Name" value={boss.name} />
                <InfoRow label="ID" value={boss.id} />
              </PropertySection>
            );
          }
        }
        break;
      }

      case "spawnPoint": {
        const sp = extendedLayers.spawnPoints.find(
          (s) => s.id === selection.id,
        );
        if (sp) return <SpawnPointProperties spawnPoint={sp} />;
        break;
      }

      case "teleport": {
        const tp = extendedLayers.teleports.find((t) => t.id === selection.id);
        if (tp) return <TeleportProperties teleport={tp} />;
        break;
      }

      case "mobSpawn": {
        const ms = extendedLayers.mobSpawns.find((m) => m.id === selection.id);
        if (ms) return <MobSpawnProperties mobSpawn={ms} />;
        break;
      }

      case "resource": {
        const r = extendedLayers.resources.find(
          (res) => res.id === selection.id,
        );
        if (r) return <ResourceProperties resource={r} />;
        break;
      }

      case "station": {
        const s = extendedLayers.stations.find((st) => st.id === selection.id);
        if (s) return <StationProperties station={s} />;
        break;
      }

      case "road": {
        if (world)
          return <RoadProperties roadId={selection.id} world={world} />;
        break;
      }

      case "poi": {
        const poi = extendedLayers.pois.find((p) => p.id === selection.id);
        if (poi) return <POIProperties poi={poi} />;
        break;
      }

      case "waterBody": {
        const wb = extendedLayers.waterBodies.find(
          (w) => w.id === selection.id,
        );
        if (wb) return <WaterBodyProperties waterBody={wb} />;
        break;
      }

      // Phase 7 audio entities
      case "musicZone": {
        const mz = audioLayers.musicZones.find((m) => m.id === selection.id);
        if (mz) return <MusicZoneProperties musicZone={mz} />;
        break;
      }

      case "ambientZone": {
        const az = audioLayers.ambientZones.find((a) => a.id === selection.id);
        if (az) return <AmbientZoneProperties ambientZone={az} />;
        break;
      }

      case "sfxTrigger": {
        const sfx = audioLayers.sfxTriggers.find((s) => s.id === selection.id);
        if (sfx) return <SFXTriggerProperties sfxTrigger={sfx} />;
        break;
      }

      // Vegetation instance (InstancedMesh per-instance selection)
      case "vegetation": {
        const d = selection.entityData;
        if (d) {
          const pos = d.position as
            | { x: number; y: number; z: number }
            | undefined;
          const speciesLabel = String(d.species ?? "unknown")
            .replace(/^tree_/, "")
            .replace(/_/g, " ");
          return (
            <>
              <PropertySection title="Vegetation Instance">
                <InfoRow label="Species" value={speciesLabel} />
                <InfoRow label="Instance" value={`#${d.instanceIndex}`} />
              </PropertySection>
              {pos && (
                <PropertySection title="Transform">
                  <TransformSection position={pos} readOnly />
                </PropertySection>
              )}
            </>
          );
        }
        break;
      }

      // Game world manifest entities (from GameWorldEntitySync)
      case "gameNpc":
        return selection.entityData ? (
          <GameNPCProperties entityData={selection.entityData} />
        ) : null;

      case "gameStation":
        return selection.entityData ? (
          <GameStationProperties entityData={selection.entityData} />
        ) : null;

      case "gameResource":
        return selection.entityData ? (
          <GameResourceProperties entityData={selection.entityData} />
        ) : null;

      case "gameMobSpawn":
        return selection.entityData ? (
          <GameMobSpawnProperties entityData={selection.entityData} />
        ) : null;
    }

    return null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Properties
        </span>
        <button
          className="p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          title="Settings"
        >
          <Settings size={12} />
        </button>
      </div>

      {/* Search filter */}
      {selection && (
        <div className="px-2 py-1.5 border-b border-border-primary">
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              placeholder="Filter properties..."
              className="w-full pl-6 pr-2 py-1 text-xs bg-bg-tertiary rounded-sm border border-border-primary text-text-primary placeholder-text-tertiary focus:outline-none focus:border-primary/50"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <PropertySearchContext.Provider value={searchText}>
          {selection ? (
            <>
              {/* Selection header */}
              <SearchableSection label="Selection Type ID Path">
                <PropertySection title="Selection">
                  <InfoRow label="Type" value={selection.type} />
                  <InfoRow label="ID" value={selection.id} />
                  {selection.path.length > 0 && (
                    <InfoRow
                      label="Path"
                      value={selection.path.map((p) => p.name).join(" > ")}
                    />
                  )}
                </PropertySection>
              </SearchableSection>

              {/* Per-type editor */}
              {renderSelectionEditor()}

              {/* World summary when available */}
              {world && (
                <PropertySection title="World" defaultOpen={false}>
                  <InfoRow label="Name" value={world.name} />
                  <InfoRow label="Seed" value={world.foundation.config.seed} />
                  <InfoRow
                    label="Size"
                    value={`${world.foundation.config.terrain.worldSize}×${world.foundation.config.terrain.worldSize}`}
                  />
                  <InfoRow
                    label="Towns"
                    value={world.foundation.towns.length}
                  />
                  <InfoRow
                    label="Roads"
                    value={world.foundation.roads.length}
                  />
                  <InfoRow label="NPCs" value={world.layers.npcs.length} />
                  <InfoRow
                    label="Spawn Points"
                    value={extendedLayers.spawnPoints.length}
                  />
                  <InfoRow
                    label="Resources"
                    value={extendedLayers.resources.length}
                  />
                  <InfoRow
                    label="Stations"
                    value={extendedLayers.stations.length}
                  />
                  <InfoRow label="POIs" value={extendedLayers.pois.length} />
                  <InfoRow
                    label="Water Bodies"
                    value={extendedLayers.waterBodies.length}
                  />
                </PropertySection>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-text-tertiary text-xs px-4 text-center">
              <Info size={20} className="mb-2 opacity-40" />
              <p>
                Select an object in the viewport or hierarchy to view its
                properties.
              </p>
            </div>
          )}
        </PropertySearchContext.Provider>
      </div>
    </div>
  );
}
