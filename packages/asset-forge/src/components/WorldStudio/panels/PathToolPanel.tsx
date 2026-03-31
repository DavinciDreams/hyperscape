/**
 * PathToolPanel — Left sidebar when path tool is active (C-13: Spline tool)
 *
 * Provides controls for creating and editing paths: roads, rivers, fences,
 * and custom paths. Reads generated roads from the world foundation and
 * manages custom user-authored paths as local panel state (pending full
 * reducer integration).
 */

import { Route, Eye, EyeOff, Info } from "lucide-react";
import React, { useState, useCallback, useMemo } from "react";

import { useWorldStudio } from "../WorldStudioContext";
import { PropertySection, InfoRow } from "./properties/PropertyControls";

// ============== PATH TYPES ==============

interface GeneratedPathEntry {
  id: string;
  name: string;
  points: Array<{ x: number; z: number }>;
  width: number;
}

// ============== COMPONENT ==============

export function PathToolPanel() {
  const { state } = useWorldStudio();

  const [hiddenPaths, setHiddenPaths] = useState<Set<string>>(new Set());
  const [activePathId, setActivePathId] = useState<string | null>(null);

  // Convert generated roads from foundation into read-only entries
  const generatedPaths: GeneratedPathEntry[] = useMemo(() => {
    const foundation = state.builder.editing.world?.foundation;
    if (!foundation?.roads) return [];
    return foundation.roads.map((road) => ({
      id: `gen_road_${road.id}`,
      name: `Road ${road.id.slice(0, 6)}`,
      points: road.path.map((p) => ({ x: p.x, z: p.z })),
      width: road.width,
    }));
  }, [state.builder.editing.world?.foundation]);

  const togglePathVisibility = useCallback((pathId: string) => {
    setHiddenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathId)) {
        next.delete(pathId);
      } else {
        next.add(pathId);
      }
      return next;
    });
  }, []);

  const activePath = useMemo(
    () => generatedPaths.find((p) => p.id === activePathId) ?? null,
    [generatedPaths, activePathId],
  );

  // ---------- Render ----------

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Path / Spline Tool
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Development notice */}
        <div className="mx-2 mt-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded flex items-start gap-2">
          <Info size={12} className="flex-shrink-0 mt-0.5 text-blue-400" />
          <span className="text-[10px] text-blue-300 leading-relaxed">
            Path editing tools are in development. Generated roads are displayed
            below.
          </span>
        </div>

        {/* Generated Roads List */}
        <PropertySection
          title="Generated Roads"
          icon={<Route size={10} />}
          badge={generatedPaths.length}
        >
          {generatedPaths.length === 0 ? (
            <div className="text-[10px] text-text-tertiary italic">
              No generated roads. Generate a world with towns to create roads.
            </div>
          ) : (
            <div className="space-y-0.5 max-h-52 overflow-y-auto scrollbar-thin">
              {generatedPaths.map((path) => {
                const isActive = path.id === activePathId;
                const isHidden = hiddenPaths.has(path.id);
                return (
                  <div
                    key={path.id}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] cursor-pointer transition-colors ${
                      isActive
                        ? "bg-primary/15 border border-primary/30"
                        : "bg-bg-tertiary/30 border border-transparent hover:bg-bg-tertiary/60"
                    }`}
                    onClick={() => setActivePathId(path.id)}
                  >
                    <span className="text-text-tertiary flex-shrink-0">
                      <Route size={10} />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="text-text-primary truncate font-medium">
                        {path.name}
                      </div>
                      <div className="text-text-tertiary">
                        {path.points.length} pts (generated)
                      </div>
                    </div>

                    <button
                      className="text-text-tertiary hover:text-text-secondary transition-colors p-0.5 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePathVisibility(path.id);
                      }}
                      title={isHidden ? "Show path" : "Hide path"}
                    >
                      {isHidden ? <EyeOff size={10} /> : <Eye size={10} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </PropertySection>

        {/* Control Points (read-only for selected generated path) */}
        {activePath && (
          <PropertySection
            title="Control Points"
            badge={activePath.points.length}
            defaultOpen={false}
          >
            <div className="text-[10px] text-amber-400/80 italic mb-1">
              Generated path (read-only)
            </div>
            <div className="space-y-0.5 max-h-40 overflow-y-auto scrollbar-thin">
              {activePath.points.map((pt, index) => (
                <div
                  key={`${activePath.id}-pt-${index}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-tertiary/50 text-[10px]"
                >
                  <span className="text-text-tertiary w-4 text-right font-mono">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-text-secondary font-mono truncate">
                    ({Math.round(pt.x)}, {Math.round(pt.z)})
                  </span>
                </div>
              ))}
            </div>
          </PropertySection>
        )}

        {/* Summary stats */}
        <PropertySection title="Summary" defaultOpen={false}>
          <InfoRow label="Generated roads" value={generatedPaths.length} />
          <InfoRow
            label="Total points"
            value={generatedPaths.reduce((sum, p) => sum + p.points.length, 0)}
          />
        </PropertySection>
      </div>
    </div>
  );
}
