/**
 * WildernessBoundaryProperties — Editor for the wilderness boundary polyline
 *
 * The wilderness boundary is a single polyline marking where PvP begins.
 * Difficulty increases by distance north of the line.
 */

import { AlertTriangle, Trash2 } from "lucide-react";
import React, { useCallback } from "react";

import type { WildernessBoundary } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import { PropertySection, SliderInput, InfoRow } from "./PropertyControls";

interface Props {
  boundary: WildernessBoundary;
}

export function WildernessBoundaryProperties({ boundary }: Props) {
  const { actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<WildernessBoundary>) => {
      actions.setWildernessBoundary({ ...boundary, ...updates });
    },
    [actions, boundary],
  );

  return (
    <>
      <PropertySection
        title="Wilderness Boundary"
        icon={<AlertTriangle size={10} />}
      >
        <InfoRow label="Points" value={`${boundary.points.length}`} />
        <InfoRow
          label="Span"
          value={
            boundary.points.length >= 2
              ? `${Math.round(
                  Math.abs(
                    boundary.points[boundary.points.length - 1].x -
                      boundary.points[0].x,
                  ),
                )}m east-west`
              : "—"
          }
        />
      </PropertySection>

      <PropertySection title="PvP Rules" defaultOpen>
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
      </PropertySection>

      <PropertySection title="Actions" defaultOpen={false}>
        <button
          className="flex items-center gap-1.5 text-[10px] text-red-400 hover:text-red-300 py-1"
          onClick={() => actions.setWildernessBoundary(null)}
        >
          <Trash2 size={10} />
          Remove Wilderness Boundary
        </button>
      </PropertySection>
    </>
  );
}
