/**
 * ViewportOverlayBar — Floating toolbar for viewport overlay toggles
 *
 * Shows toggle buttons for:
 * - Biome color overlay
 * - Audio zone boundaries
 * - Difficulty zones
 * - Entity density heatmap
 * - Road network
 * - Day/Night slider
 * - Weather preview
 */

import {
  TreePine,
  Volume2,
  Shield,
  Flame,
  Route,
  Sun,
  Moon,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudFog,
  X,
} from "lucide-react";
import React, { useCallback } from "react";

import type { StudioViewportOverlays } from "../WorldStudioContext";
import { useWorldStudio } from "../WorldStudioContext";

interface OverlayToggle {
  key: keyof StudioViewportOverlays;
  icon: typeof TreePine;
  label: string;
  color: string;
}

const OVERLAY_TOGGLES: OverlayToggle[] = [
  {
    key: "biomeOverlay",
    icon: TreePine,
    label: "Biome Colors",
    color: "text-green-400",
  },
  {
    key: "audioZoneOverlay",
    icon: Volume2,
    label: "Audio Zones",
    color: "text-fuchsia-400",
  },
  {
    key: "difficultyOverlay",
    icon: Shield,
    label: "Difficulty Zones",
    color: "text-rose-400",
  },
  {
    key: "densityHeatmap",
    icon: Flame,
    label: "Entity Density",
    color: "text-orange-400",
  },
  {
    key: "roadOverlay",
    icon: Route,
    label: "Road Network",
    color: "text-stone-400",
  },
];

const WEATHER_OPTIONS: Array<{
  value: StudioViewportOverlays["weatherPreview"];
  icon: typeof Cloud;
  label: string;
}> = [
  { value: null, icon: X, label: "No Weather" },
  { value: "clear", icon: Sun, label: "Clear" },
  { value: "rain", icon: CloudRain, label: "Rain" },
  { value: "snow", icon: CloudSnow, label: "Snow" },
  { value: "fog", icon: CloudFog, label: "Fog" },
];

export function ViewportOverlayBar() {
  const { state, actions } = useWorldStudio();
  const overlays = state.overlays;

  const toggleOverlay = useCallback(
    (key: keyof StudioViewportOverlays) => {
      const current = overlays[key];
      if (typeof current === "boolean") {
        actions.setOverlay({ [key]: !current });
      }
    },
    [overlays, actions],
  );

  const setTimeOfDay = useCallback(
    (hours: number | null) => {
      actions.setOverlay({ timeOfDay: hours });
    },
    [actions],
  );

  const setWeather = useCallback(
    (weather: StudioViewportOverlays["weatherPreview"]) => {
      actions.setOverlay({ weatherPreview: weather });
    },
    [actions],
  );

  return (
    <div className="absolute top-12 right-2 z-10 flex flex-col gap-1">
      {/* Overlay toggles */}
      <div className="bg-bg-primary/90 border border-border-primary rounded-lg p-1 flex flex-col gap-0.5">
        {OVERLAY_TOGGLES.map(({ key, icon: Icon, label, color }) => {
          const active = overlays[key] === true;
          return (
            <button
              key={key}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] transition-colors ${
                active
                  ? `${color} bg-white/5`
                  : "text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
              onClick={() => toggleOverlay(key)}
              title={label}
            >
              <Icon size={12} />
              <span className="hidden xl:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Day/Night slider */}
      <div className="bg-bg-primary/90 border border-border-primary rounded-lg p-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-text-tertiary flex items-center gap-1">
            {overlays.timeOfDay != null ? (
              overlays.timeOfDay < 6 || overlays.timeOfDay > 18 ? (
                <Moon size={10} />
              ) : (
                <Sun size={10} />
              )
            ) : (
              <Sun size={10} />
            )}
            {overlays.timeOfDay != null
              ? `${Math.floor(overlays.timeOfDay)}:${String(Math.round((overlays.timeOfDay % 1) * 60)).padStart(2, "0")}`
              : "Default"}
          </span>
          {overlays.timeOfDay != null && (
            <button
              className="text-[9px] text-text-tertiary hover:text-text-primary"
              onClick={() => setTimeOfDay(null)}
            >
              Reset
            </button>
          )}
        </div>
        <input
          type="range"
          min={0}
          max={24}
          step={0.5}
          value={overlays.timeOfDay ?? 12}
          onChange={(e) => setTimeOfDay(parseFloat(e.target.value))}
          className="w-full h-1 accent-primary"
          title="Time of Day"
        />
        <div className="flex justify-between text-[8px] text-text-tertiary mt-0.5">
          <span>0:00</span>
          <span>6:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>

      {/* Weather toggle */}
      <div className="bg-bg-primary/90 border border-border-primary rounded-lg p-1 flex gap-0.5">
        {WEATHER_OPTIONS.map(({ value, icon: Icon, label }) => {
          const active = overlays.weatherPreview === value;
          return (
            <button
              key={label}
              className={`p-1.5 rounded transition-colors ${
                active
                  ? "text-primary bg-primary/10"
                  : "text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
              onClick={() => setWeather(value)}
              title={label}
            >
              <Icon size={12} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
