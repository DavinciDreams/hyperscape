/**
 * Wilderness Boundary custom section — migrated from the bespoke
 * WildernessBoundaryProperties component. Wilderness is a world-scoped
 * scalar entity (single polyline, not an array), so this widget bypasses
 * the generic ENTITY_UPDATE dispatch and calls `setWildernessBoundary`
 * directly through the WorldStudio actions API.
 *
 * Widgets exported:
 *   - WildernessBoundaryEditorSection ("WildernessBoundaryEditor")
 */

import { Trash2 } from "lucide-react";
import React, { useCallback } from "react";

import type { CustomSectionProps } from "./customSectionRegistry";
import { useWorldStudio } from "../../components/WorldStudio/WorldStudioContext";
import {
  InfoRow,
  SliderInput,
} from "../../components/WorldStudio/panels/properties/PropertyControls";
import type { WildernessBoundary } from "../../components/WorldStudio/types";

export function WildernessBoundaryEditorSection(_props: CustomSectionProps) {
  const { state, actions } = useWorldStudio();
  const boundary = state.extendedLayers.wildernessBoundary;

  const update = useCallback(
    (updates: Partial<WildernessBoundary>) => {
      if (!boundary) return;
      actions.setWildernessBoundary({ ...boundary, ...updates });
    },
    [actions, boundary],
  );

  if (!boundary) {
    return (
      <div className="text-[10px] text-text-tertiary italic">
        No wilderness boundary placed yet. Use the wilderness tool to draw one.
      </div>
    );
  }

  const span =
    boundary.points.length >= 2
      ? `${Math.round(
          Math.abs(
            boundary.points[boundary.points.length - 1].x -
              boundary.points[0].x,
          ),
        )}m east-west`
      : "—";

  return (
    <>
      <InfoRow label="Points" value={`${boundary.points.length}`} />
      <InfoRow label="Span" value={span} />
      <SliderInput
        label="Level Scale"
        value={boundary.levelScale}
        onChange={(levelScale) => update({ levelScale })}
        min={1}
        max={50}
        step={1}
        unit="m/lvl"
        hint="Meters north of boundary per wilderness level"
      />
      <SliderInput
        label="Max Level"
        value={boundary.maxLevel}
        onChange={(maxLevel) => update({ maxLevel })}
        min={1}
        max={99}
        step={1}
        hint="Maximum wilderness combat level"
      />
      <InfoRow
        label="Max Depth"
        value={`${boundary.maxLevel * boundary.levelScale}m north`}
      />
      <button
        className="flex items-center gap-1.5 text-[10px] text-red-400 hover:text-red-300 py-1 mt-1"
        onClick={() => actions.setWildernessBoundary(null)}
      >
        <Trash2 size={10} />
        Remove Wilderness Boundary
      </button>
    </>
  );
}
