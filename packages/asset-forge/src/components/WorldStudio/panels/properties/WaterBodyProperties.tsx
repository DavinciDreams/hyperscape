/**
 * WaterBodyProperties — Editor for selected water body
 *
 * Edits rivers (waypoints, berm width, valley multiplier),
 * lakes (polygon, surface height), and ponds.
 */

import { Droplets } from "lucide-react";
import React, { useCallback } from "react";

import type { PlacedWaterBody, RiverWaypoint } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  SelectInput,
  SliderInput,
  NumberInput,
  InfoRow,
} from "./PropertyControls";

interface Props {
  waterBody: PlacedWaterBody;
}

const BODY_TYPES: Array<{ value: PlacedWaterBody["bodyType"]; label: string }> =
  [
    { value: "river", label: "River" },
    { value: "lake", label: "Lake" },
    { value: "pond", label: "Pond" },
  ];

export function WaterBodyProperties({ waterBody }: Props) {
  const { actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<PlacedWaterBody>) => {
      actions.updateWaterBody(waterBody.id, updates);
    },
    [actions, waterBody.id],
  );

  const updateWaypoint = useCallback(
    (index: number, updates: Partial<RiverWaypoint>) => {
      if (!waterBody.waypoints) return;
      const newWaypoints = [...waterBody.waypoints];
      newWaypoints[index] = { ...newWaypoints[index], ...updates };
      update({ waypoints: newWaypoints });
    },
    [waterBody.waypoints, update],
  );

  // Calculate approximate length for rivers
  let pathLength = 0;
  if (waterBody.waypoints && waterBody.waypoints.length > 1) {
    for (let i = 1; i < waterBody.waypoints.length; i++) {
      const dx = waterBody.waypoints[i].x - waterBody.waypoints[i - 1].x;
      const dz = waterBody.waypoints[i].z - waterBody.waypoints[i - 1].z;
      pathLength += Math.sqrt(dx * dx + dz * dz);
    }
  }

  return (
    <>
      <PropertySection title="Water Body" icon={<Droplets size={10} />}>
        <TextInput
          label="Name"
          value={waterBody.name}
          onChange={(name) => update({ name })}
        />
        <SelectInput
          label="Type"
          value={waterBody.bodyType}
          onChange={(bodyType) =>
            update({ bodyType: bodyType as PlacedWaterBody["bodyType"] })
          }
          options={BODY_TYPES}
        />
        {waterBody.surfaceY != null && (
          <NumberInput
            label="Surface Height"
            value={waterBody.surfaceY}
            onChange={(surfaceY) => update({ surfaceY })}
            step={0.5}
            unit="m"
          />
        )}
      </PropertySection>

      {waterBody.bodyType === "river" && (
        <>
          <PropertySection title="River Config">
            <SliderInput
              label="Berm Width"
              value={waterBody.bermWidth ?? 4}
              onChange={(bermWidth) => update({ bermWidth })}
              min={0}
              max={20}
              step={0.5}
              unit="m"
              hint="Raised bank width outside valley"
            />
            <SliderInput
              label="Valley Multiplier"
              value={waterBody.valleyMultiplier ?? 2.5}
              onChange={(valleyMultiplier) => update({ valleyMultiplier })}
              min={1}
              max={5}
              step={0.1}
              hint="Bank width = halfWidth × (mult − 1)"
            />
            {waterBody.waypoints && (
              <>
                <InfoRow label="Waypoints" value={waterBody.waypoints.length} />
                <InfoRow label="Length" value={`~${Math.round(pathLength)}m`} />
              </>
            )}
          </PropertySection>

          {waterBody.waypoints && waterBody.waypoints.length > 0 && (
            <PropertySection
              title="Waypoints"
              badge={waterBody.waypoints.length}
              defaultOpen={false}
            >
              {waterBody.waypoints.map((wp, i) => (
                <div
                  key={i}
                  className="space-y-0.5 py-1 border-b border-border-primary/20 last:border-0"
                >
                  <div className="text-[10px] font-semibold text-text-tertiary">
                    Point {i + 1}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <NumberInput
                      label="X"
                      value={Math.round(wp.x)}
                      onChange={(x) => updateWaypoint(i, { x })}
                      step={5}
                    />
                    <NumberInput
                      label="Z"
                      value={Math.round(wp.z)}
                      onChange={(z) => updateWaypoint(i, { z })}
                      step={5}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <NumberInput
                      label="Width"
                      value={wp.halfWidth * 2}
                      onChange={(w) => updateWaypoint(i, { halfWidth: w / 2 })}
                      min={2}
                      max={100}
                      step={1}
                      unit="m"
                    />
                    <NumberInput
                      label="Depth"
                      value={wp.depth}
                      onChange={(depth) => updateWaypoint(i, { depth })}
                      min={0.1}
                      max={10}
                      step={0.1}
                      unit="m"
                    />
                  </div>
                </div>
              ))}
            </PropertySection>
          )}
        </>
      )}

      {waterBody.bodyType === "lake" && waterBody.polygon && (
        <PropertySection
          title="Lake Polygon"
          badge={waterBody.polygon.length}
          defaultOpen={false}
        >
          {waterBody.polygon.map((pt, i) => (
            <InfoRow
              key={i}
              label={`Point ${i + 1}`}
              value={`(${Math.round(pt.x)}, ${Math.round(pt.z)})`}
            />
          ))}
        </PropertySection>
      )}
    </>
  );
}
