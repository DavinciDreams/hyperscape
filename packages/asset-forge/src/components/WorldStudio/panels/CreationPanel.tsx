/**
 * CreationPanel — World creation controls for World Studio
 *
 * Shown in the left sidebar when in creation mode. Provides:
 * - Preset selector
 * - Seed control with randomize
 * - Basic terrain config (world size, max height, water level)
 * - Town count
 * - Generate and Apply & Lock buttons
 *
 * Full detailed controls (noise layers, biome tuning, road config) are Phase 4 scope.
 */

import { TERRAIN_PRESETS } from "@hyperscape/procgen/terrain";
import {
  Mountain,
  Shuffle,
  Lock,
  Loader2,
  AlertTriangle,
  Sparkles,
  Globe,
} from "lucide-react";
import React, { useCallback, useState } from "react";

import { useWorldStudio } from "../WorldStudioContext";

interface CreationPanelProps {
  onGeneratePreview: () => void;
  onApplyAndLock: () => void;
}

export function CreationPanel({
  onGeneratePreview,
  onApplyAndLock,
}: CreationPanelProps) {
  const { state, actions } = useWorldStudio();
  const {
    config,
    selectedPreset,
    isGenerating,
    hasPreview,
    generationError,
    previewStats,
  } = state.builder.creation;

  const [showConfirm, setShowConfirm] = useState(false);

  const presetOptions = Object.entries(TERRAIN_PRESETS).map(([id, preset]) => ({
    id,
    name: preset.name,
    description: preset.description,
  }));

  const handlePresetChange = useCallback(
    (presetId: string) => {
      actions.setPreset(presetId);
      const preset = TERRAIN_PRESETS[presetId];
      if (preset) {
        const pc = preset.config;
        actions.updateCreationConfig({
          preset: presetId,
          terrain: {
            ...config.terrain,
            tileSize: pc.tileSize ?? config.terrain.tileSize,
            worldSize: pc.worldSize ?? config.terrain.worldSize,
            maxHeight: pc.maxHeight ?? config.terrain.maxHeight,
            waterThreshold: pc.waterThreshold ?? config.terrain.waterThreshold,
          },
        });
        if (pc.island) actions.updateIslandConfig(pc.island);
        if (pc.biomes) actions.updateBiomeConfig(pc.biomes);
      }
    },
    [actions, config.terrain],
  );

  // Load the live game world config (matches server TerrainSystem)
  const handleLoadGameWorld = useCallback(() => {
    actions.updateCreationConfig({
      seed: 0, // Server default seed (or TERRAIN_SEED env var)
      preset: null,
      useGamePipeline: true, // Use exact game terrain algorithm
      terrain: {
        tileSize: 100,
        worldSize: 100, // 100x100 tiles = 10km x 10km
        tileResolution: 64,
        maxHeight: 50, // Game's MAX_HEIGHT
        waterThreshold: 8.0, // Game's WATER_THRESHOLD
      },
    });
  }, [actions]);

  const handleApplyClick = useCallback(() => {
    setShowConfirm(true);
  }, []);

  const handleConfirm = useCallback(() => {
    setShowConfirm(false);
    onApplyAndLock();
  }, [onApplyAndLock]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-primary">
        <Sparkles size={14} className="text-primary" />
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Create World
        </span>
      </div>

      {/* Controls */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 scrollbar-thin">
        {/* Load Game World */}
        <button
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
          onClick={handleLoadGameWorld}
          title="Load the live Hyperscape game world config (seed 0, 100x100 tiles)"
        >
          <Globe size={14} />
          Load Game World
        </button>

        {/* Preset */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            Preset
          </label>
          <select
            className="w-full px-2 py-1.5 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary focus:outline-none focus:border-primary/50"
            value={selectedPreset ?? ""}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            {presetOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Seed */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            Seed
          </label>
          <div className="flex gap-1.5">
            <input
              type="number"
              className="flex-1 px-2 py-1.5 text-xs bg-bg-tertiary border border-border-primary rounded font-mono text-text-primary focus:outline-none focus:border-primary/50"
              value={config.seed}
              onChange={(e) => actions.setSeed(Number(e.target.value))}
            />
            <button
              className="px-2 py-1.5 text-xs bg-bg-tertiary border border-border-primary rounded text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
              onClick={actions.randomizeSeed}
              title="Randomize seed"
            >
              <Shuffle size={12} />
            </button>
          </div>
        </div>

        {/* World Size */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-text-secondary">
              World Size
            </label>
            <span className="text-xs text-text-tertiary font-mono">
              {config.terrain.worldSize}x{config.terrain.worldSize} tiles
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={config.terrain.worldSize}
            onChange={(e) =>
              actions.updateTerrainConfig({
                worldSize: Number(e.target.value),
              })
            }
            className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-primary"
          />
          <p className="text-[10px] text-text-tertiary">
            {config.terrain.worldSize * config.terrain.tileSize}m x{" "}
            {config.terrain.worldSize * config.terrain.tileSize}m
          </p>
        </div>

        {/* Max Height */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-text-secondary">
              Max Height
            </label>
            <span className="text-xs text-text-tertiary font-mono">
              {config.terrain.maxHeight}m
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={200}
            step={5}
            value={config.terrain.maxHeight}
            onChange={(e) =>
              actions.updateTerrainConfig({
                maxHeight: Number(e.target.value),
              })
            }
            className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-primary"
          />
        </div>

        {/* Water Level */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-text-secondary">
              Water Level
            </label>
            <span className="text-xs text-text-tertiary font-mono">
              {config.terrain.waterThreshold}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={20}
            step={0.1}
            value={config.terrain.waterThreshold}
            onChange={(e) =>
              actions.updateTerrainConfig({
                waterThreshold: Number(e.target.value),
              })
            }
            className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-primary"
          />
        </div>

        {/* Town Count */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-text-secondary">
              Towns
            </label>
            <span className="text-xs text-text-tertiary font-mono">
              {config.towns.townCount}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={config.towns.townCount}
            onChange={(e) =>
              actions.updateTownConfig({
                townCount: Number(e.target.value),
              })
            }
            className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-primary"
          />
        </div>

        {/* Error display */}
        {generationError && (
          <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{generationError}</span>
          </div>
        )}

        {/* Preview stats */}
        {previewStats && (
          <div className="p-2 bg-bg-tertiary rounded text-xs space-y-1">
            <div className="font-medium text-text-secondary">
              Preview Generated
            </div>
            <div className="grid grid-cols-2 gap-1 text-text-tertiary">
              <span>Tiles: {previewStats.tiles}</span>
              <span>Biomes: {previewStats.biomes}</span>
              <span>Towns: {previewStats.towns}</span>
              <span>Roads: {previewStats.roads}</span>
            </div>
            <div className="text-text-tertiary">
              Time: {previewStats.generationTime}ms
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-3 py-3 border-t border-border-primary space-y-2">
        <button
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded bg-bg-tertiary border border-border-primary text-text-primary hover:bg-bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onGeneratePreview}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Mountain size={14} />
              {hasPreview ? "New Variation" : "Generate Preview"}
            </>
          )}
        </button>

        {hasPreview && (
          <button
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded bg-primary text-white hover:bg-primary/90 transition-colors"
            onClick={handleApplyClick}
          >
            <Lock size={14} />
            Apply & Lock Foundation
          </button>
        )}
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-bg-secondary border border-border-primary rounded-lg shadow-xl p-4 max-w-sm mx-4 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Lock size={16} className="text-amber-400" />
              Lock World Foundation?
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              This will lock the terrain, biomes, towns, and roads as the
              immutable foundation. You can still add NPCs, quests, bosses,
              events, and other content on top.
            </p>
            <div className="text-xs text-text-tertiary space-y-0.5">
              <div>
                Seed: <span className="font-mono">{config.seed}</span>
              </div>
              <div>
                Size: {config.terrain.worldSize}x{config.terrain.worldSize}{" "}
                tiles
              </div>
              {previewStats && (
                <div>
                  {previewStats.towns} towns, {previewStats.roads} roads
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 px-3 py-1.5 text-xs rounded border border-border-primary text-text-secondary hover:bg-bg-tertiary transition-colors"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-3 py-1.5 text-xs rounded bg-primary text-white hover:bg-primary/90 transition-colors"
                onClick={handleConfirm}
              >
                Lock & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
