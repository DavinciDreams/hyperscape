/**
 * MinimapPanel — Top-down world overview minimap
 *
 * Renders a small canvas showing:
 * - Biome color overlay
 * - Town markers
 * - Road network
 * - Entity density indicators
 * - Camera viewport frustum
 * - Click to teleport camera
 */

import { Maximize2, Minimize2 } from "lucide-react";
import React, { useRef, useEffect, useState, useCallback } from "react";

import { useWorldStudio } from "../WorldStudioContext";

/** Biome type → minimap color */
const BIOME_COLORS: Record<string, string> = {
  forest: "#2d5a27",
  plains: "#7ab648",
  desert: "#c4a35a",
  mountain: "#8b7d6b",
  swamp: "#4a5a3a",
  tundra: "#c8d4d8",
  volcanic: "#5a2a1a",
  coastal: "#6aafe0",
  caves: "#3a3a4a",
};

const ENTITY_COLORS: Record<string, string> = {
  npc: "#00ccff",
  mobSpawn: "#ff4444",
  resource: "#44ff44",
  station: "#ffaa44",
  spawnPoint: "#44ffaa",
  teleport: "#aa44ff",
  poi: "#ff44aa",
};

interface MinimapPanelProps {
  /** Minimap size in pixels */
  size?: number;
}

export function MinimapPanel({ size = 200 }: MinimapPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, actions } = useWorldStudio();
  const [expanded, setExpanded] = useState(false);

  const world = state.builder.editing.world;
  const extendedLayers = state.extendedLayers;
  const displaySize = expanded ? 320 : size;

  // Render the minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const worldSize = world.foundation.config.terrain.worldSize;
    const tileSize = world.foundation.config.terrain.tileSize;
    const worldExtent = worldSize * tileSize;
    const scale = displaySize / worldExtent;

    canvas.width = displaySize;
    canvas.height = displaySize;

    // Clear
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, displaySize, displaySize);

    // Draw biome tiles
    for (const biome of world.foundation.biomes) {
      const color = BIOME_COLORS[biome.type] ?? "#3a3a3a";
      ctx.fillStyle = color;

      for (const key of biome.tileKeys) {
        const [xStr, zStr] = key.split(",");
        const tx = parseInt(xStr) * tileSize * scale;
        const tz = parseInt(zStr) * tileSize * scale;
        const ts = Math.max(1, tileSize * scale);
        ctx.fillRect(tx, tz, ts, ts);
      }
    }

    // Draw roads
    ctx.strokeStyle = "#8a7a6a";
    ctx.lineWidth = Math.max(1, 2 * scale);
    for (const road of world.foundation.roads) {
      if (road.path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(road.path[0].x * scale, road.path[0].z * scale);
      for (let i = 1; i < road.path.length; i++) {
        ctx.lineTo(road.path[i].x * scale, road.path[i].z * scale);
      }
      ctx.stroke();
    }

    // Draw towns
    for (const town of world.foundation.towns) {
      const tx = town.position.x * scale;
      const tz = town.position.z * scale;
      const townRadius =
        town.size === "town" ? 6 : town.size === "village" ? 4 : 3;

      ctx.fillStyle = "#ffa500";
      ctx.beginPath();
      ctx.arc(tx, tz, townRadius, 0, Math.PI * 2);
      ctx.fill();

      // Town name
      if (displaySize >= 200) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(town.name, tx, tz - townRadius - 2);
      }
    }

    // Draw entities as dots
    const drawEntityDot = (x: number, z: number, color: string, radius = 2) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x * scale, z * scale, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const npc of world.layers.npcs) {
      drawEntityDot(npc.position.x, npc.position.z, ENTITY_COLORS.npc);
    }
    for (const ms of extendedLayers.mobSpawns) {
      drawEntityDot(ms.position.x, ms.position.z, ENTITY_COLORS.mobSpawn);
    }
    for (const r of extendedLayers.resources) {
      drawEntityDot(r.position.x, r.position.z, ENTITY_COLORS.resource);
    }
    for (const s of extendedLayers.stations) {
      drawEntityDot(s.position.x, s.position.z, ENTITY_COLORS.station);
    }
    for (const sp of extendedLayers.spawnPoints) {
      drawEntityDot(sp.position.x, sp.position.z, ENTITY_COLORS.spawnPoint, 3);
    }
    for (const tp of extendedLayers.teleports) {
      drawEntityDot(tp.position.x, tp.position.z, ENTITY_COLORS.teleport, 3);
    }
    for (const poi of extendedLayers.pois) {
      drawEntityDot(poi.position.x, poi.position.z, ENTITY_COLORS.poi, 3);
    }

    // Draw selection highlight
    const selection = state.builder.editing.selection;
    if (selection) {
      // Find selected entity position
      let selPos: { x: number; z: number } | null = null;
      if (selection.type === "npc") {
        const npc = world.layers.npcs.find((n) => n.id === selection.id);
        if (npc) selPos = npc.position;
      } else if (selection.type === "mobSpawn") {
        const ms = extendedLayers.mobSpawns.find((m) => m.id === selection.id);
        if (ms) selPos = ms.position;
      } else if (selection.type === "resource") {
        const r = extendedLayers.resources.find(
          (res) => res.id === selection.id,
        );
        if (r) selPos = r.position;
      } else if (selection.type === "town") {
        const t = world.foundation.towns.find((tw) => tw.id === selection.id);
        if (t) selPos = t.position;
      }

      if (selPos) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(selPos.x * scale, selPos.z * scale, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [world, extendedLayers, state.builder.editing.selection, displaySize]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!world) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const worldSize = world.foundation.config.terrain.worldSize;
      const tileSize = world.foundation.config.terrain.tileSize;
      const worldExtent = worldSize * tileSize;
      const scale = displaySize / worldExtent;

      const worldX = (e.clientX - rect.left) / scale;
      const worldZ = (e.clientY - rect.top) / scale;

      actions.cameraTeleport({ x: worldX, y: 50, z: worldZ });
    },
    [world, displaySize, actions],
  );

  if (!world) return null;

  return (
    <div
      className="absolute bottom-8 right-2 z-10 bg-bg-primary/90 border border-border-primary rounded-lg overflow-hidden shadow-lg"
      style={{ width: displaySize, height: displaySize + 24 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-bg-secondary/80">
        <span className="text-[10px] text-text-tertiary font-medium">
          Minimap
        </span>
        <button
          className="p-0.5 rounded text-text-tertiary hover:text-text-primary transition-colors"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={displaySize}
        height={displaySize}
        className="cursor-crosshair"
        onClick={handleClick}
      />
    </div>
  );
}
