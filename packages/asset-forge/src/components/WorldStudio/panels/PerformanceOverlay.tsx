/**
 * PerformanceOverlay — World stats and budget warnings.
 *
 * Expandable button in the top-left of the viewport showing entity counts
 * and budget warnings. Uses explicit white-opacity colors for guaranteed
 * readability against the 3D viewport background.
 */

import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import React, { useMemo, useState } from "react";

import { useWorldStudio } from "../WorldStudioContext";

const BUDGETS = {
  totalEntities: 500,
  npcsPerTown: 20,
  mobSpawnsPerArea: 30,
  resourcesTotal: 200,
  musicZoneCoverage: 0.5,
} as const;

interface StatRow {
  label: string;
  count: number;
  budget?: number;
}

export function PerformanceOverlay() {
  const { state } = useWorldStudio();
  const [expanded, setExpanded] = useState(false);

  const world = state.builder.editing.world;
  const ext = state.extendedLayers;
  const audio = state.audioLayers;
  const gameEntities = state.gameEntities;

  const stats = useMemo((): StatRow[] => {
    if (!world) return [];

    const editorNpcCount = world.layers.npcs.length;
    const questCount = world.layers.quests.length;
    const bossCount = world.layers.bosses.length;
    const eventCount = world.layers.events.length;

    return [
      // Game manifest entities (from world-areas.json)
      ...(gameEntities
        ? [
            { label: "NPCs (Game)", count: gameEntities.npcs.length },
            { label: "Stations (Game)", count: gameEntities.stations.length },
            {
              label: "Resources (Game)",
              count: gameEntities.resources.length,
              budget: BUDGETS.resourcesTotal,
            },
            {
              label: "Mob Spawns (Game)",
              count: gameEntities.mobSpawns.length,
              budget: BUDGETS.mobSpawnsPerArea,
            },
            { label: "Fishing Spots", count: gameEntities.fishingSpots },
          ]
        : []),
      // Editor-placed entities
      ...(editorNpcCount > 0
        ? [{ label: "NPCs (Editor)", count: editorNpcCount }]
        : []),
      { label: "Quests", count: questCount },
      { label: "Bosses", count: bossCount },
      { label: "Events", count: eventCount },
      // Extended editor layers
      { label: "Mob Spawns (Editor)", count: ext.mobSpawns.length },
      { label: "Resources (Editor)", count: ext.resources.length },
      { label: "Stations (Editor)", count: ext.stations.length },
      { label: "Spawn Points", count: ext.spawnPoints.length },
      { label: "Teleports", count: ext.teleports.length },
      { label: "POIs", count: ext.pois.length },
      { label: "Water Bodies", count: ext.waterBodies.length },
      { label: "Music Zones", count: audio.musicZones.length },
      { label: "Ambient Zones", count: audio.ambientZones.length },
      { label: "SFX Triggers", count: audio.sfxTriggers.length },
    ];
  }, [world, ext, audio, gameEntities]);

  const totalEntities = stats.reduce((sum, s) => sum + s.count, 0);
  const overBudget = totalEntities > BUDGETS.totalEntities;

  const warnings = useMemo((): string[] => {
    const warns: string[] = [];
    if (!world) return warns;

    if (totalEntities > BUDGETS.totalEntities) {
      warns.push(
        `Total entities (${totalEntities}) exceeds budget of ${BUDGETS.totalEntities}`,
      );
    }

    for (const town of world.foundation.towns) {
      const townNpcCount = world.layers.npcs.filter(
        (n) =>
          n.parentContext.type === "town" && n.parentContext.townId === town.id,
      ).length;
      if (townNpcCount > BUDGETS.npcsPerTown) {
        warns.push(
          `${town.name}: ${townNpcCount} NPCs (budget: ${BUDGETS.npcsPerTown})`,
        );
      }
    }

    if (ext.spawnPoints.length === 0) {
      warns.push("No spawn points defined");
    }

    if (audio.musicZones.length === 0) {
      warns.push("No music zones \u2014 world will be silent");
    }

    return warns;
  }, [world, ext, audio, totalEntities]);

  if (!world) return null;

  return (
    <div className="absolute top-2 left-2 z-10">
      <button
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors border ${
          overBudget
            ? "bg-[#2a1515] text-red-300 border-red-500/40"
            : warnings.length > 0
              ? "bg-[#2a2215] text-amber-300 border-amber-500/40"
              : "bg-[#1e1e1e] text-white/70 border-[#333] hover:bg-[#2a2a2a]"
        }`}
        onClick={() => setExpanded(!expanded)}
        title="Performance Stats"
      >
        <Activity size={10} />
        {totalEntities} entities
        {warnings.length > 0 && <AlertTriangle size={10} />}
      </button>

      {expanded && (
        <div className="mt-1 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl p-2 min-w-[200px]">
          {/* Stats table */}
          <div className="space-y-0.5 mb-2">
            {stats.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between text-[10px]"
              >
                <span className="text-[#999]">{row.label}</span>
                <span
                  className={
                    row.budget && row.count > row.budget
                      ? "text-red-400 font-medium"
                      : "text-[#ddd]"
                  }
                >
                  {row.count}
                  {row.budget && (
                    <span className="text-[#666]">/{row.budget}</span>
                  )}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between text-[10px] border-t border-[#333] pt-1 mt-1">
              <span className="text-[#ccc] font-medium">Total</span>
              <span
                className={
                  overBudget
                    ? "text-red-400 font-medium"
                    : "text-white font-medium"
                }
              >
                {totalEntities}
                <span className="text-[#666]">/{BUDGETS.totalEntities}</span>
              </span>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 ? (
            <div className="space-y-1 border-t border-[#333] pt-2">
              <div className="text-[10px] font-medium text-amber-400 flex items-center gap-1">
                <AlertTriangle size={10} />
                Warnings ({warnings.length})
              </div>
              {warnings.map((w, i) => (
                <div key={i} className="text-[10px] text-amber-300 pl-3">
                  {w}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[10px] text-green-400 border-t border-[#333] pt-2">
              <CheckCircle2 size={10} />
              All budgets met
            </div>
          )}
        </div>
      )}
    </div>
  );
}
