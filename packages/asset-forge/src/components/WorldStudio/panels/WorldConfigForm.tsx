/**
 * WorldConfigForm — Reusable procgen config controls
 *
 * Extracted from CreationPanel so both NewWorldDialog and ProcgenPanel
 * can share the same UI for world generation configuration.
 */

import { TERRAIN_PRESETS } from "@hyperscape/procgen/terrain";
import { Shuffle, Globe } from "lucide-react";
import React, { useCallback } from "react";

import type { WorldCreationConfig } from "../../WorldBuilder/types";

interface WorldConfigFormProps {
  config: WorldCreationConfig;
  onConfigChange: (config: Partial<WorldCreationConfig>) => void;
  disabled?: boolean;
}

export function WorldConfigForm({
  config,
  onConfigChange,
  disabled = false,
}: WorldConfigFormProps) {
  const presetOptions = Object.entries(TERRAIN_PRESETS).map(([id, preset]) => ({
    id,
    name: preset.name,
    description: preset.description,
  }));

  const handlePresetChange = useCallback(
    (presetId: string) => {
      const preset = TERRAIN_PRESETS[presetId];
      if (preset) {
        const pc = preset.config;
        onConfigChange({
          preset: presetId,
          terrain: {
            ...config.terrain,
            tileSize: pc.tileSize ?? config.terrain.tileSize,
            worldSize: pc.worldSize ?? config.terrain.worldSize,
            maxHeight: pc.maxHeight ?? config.terrain.maxHeight,
            waterThreshold: pc.waterThreshold ?? config.terrain.waterThreshold,
          },
        });
      }
    },
    [onConfigChange, config.terrain],
  );

  const handleLoadGameWorld = useCallback(() => {
    onConfigChange({
      seed: 0,
      preset: null,
      useGamePipeline: true,
      terrain: {
        tileSize: 100,
        worldSize: 100,
        tileResolution: 64,
        maxHeight: 50,
        waterThreshold: 8.0,
      },
    });
  }, [onConfigChange]);

  const handleRandomizeSeed = useCallback(() => {
    onConfigChange({ seed: Math.floor(Math.random() * 2147483647) });
  }, [onConfigChange]);

  return (
    <div className="space-y-4">
      {/* Load Game World */}
      <button
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleLoadGameWorld}
        disabled={disabled}
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
          className="w-full px-2 py-1.5 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary focus:outline-none focus:border-primary/50 disabled:opacity-50"
          value={config.preset ?? ""}
          onChange={(e) => handlePresetChange(e.target.value)}
          disabled={disabled}
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
        <label className="text-xs font-medium text-text-secondary">Seed</label>
        <div className="flex gap-1.5">
          <input
            type="number"
            className="flex-1 px-2 py-1.5 text-xs bg-bg-tertiary border border-border-primary rounded font-mono text-text-primary focus:outline-none focus:border-primary/50 disabled:opacity-50"
            value={config.seed}
            onChange={(e) => onConfigChange({ seed: Number(e.target.value) })}
            disabled={disabled}
          />
          <button
            className="px-2 py-1.5 text-xs bg-bg-tertiary border border-border-primary rounded text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors disabled:opacity-50"
            onClick={handleRandomizeSeed}
            disabled={disabled}
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
            onConfigChange({
              terrain: {
                ...config.terrain,
                worldSize: Number(e.target.value),
              },
            })
          }
          disabled={disabled}
          className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-primary disabled:opacity-50"
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
            onConfigChange({
              terrain: {
                ...config.terrain,
                maxHeight: Number(e.target.value),
              },
            })
          }
          disabled={disabled}
          className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-primary disabled:opacity-50"
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
            onConfigChange({
              terrain: {
                ...config.terrain,
                waterThreshold: Number(e.target.value),
              },
            })
          }
          disabled={disabled}
          className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-primary disabled:opacity-50"
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
            onConfigChange({
              towns: {
                ...config.towns,
                townCount: Number(e.target.value),
              },
            })
          }
          disabled={disabled}
          className="w-full h-1.5 bg-bg-tertiary rounded appearance-none cursor-pointer accent-primary disabled:opacity-50"
        />
      </div>
    </div>
  );
}
