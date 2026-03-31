/**
 * RoadProperties — Editor for selected road
 *
 * Shows road information from foundation. Roads are immutable foundation data
 * so editing is read-only; road config can be changed via creation mode
 * regeneration.
 */

import { Route } from "lucide-react";
import React from "react";

import type { WorldData } from "../../../WorldBuilder/types";
import { PropertySection, InfoRow } from "./PropertyControls";

interface Props {
  roadId: string;
  world: WorldData;
}

export function RoadProperties({ roadId, world }: Props) {
  const road = world.foundation.roads.find((r) => r.id === roadId);

  if (!road) {
    return (
      <PropertySection title="Road">
        <InfoRow label="Status" value="Not found" />
      </PropertySection>
    );
  }

  // Resolve town names for display
  const fromTown = world.foundation.towns.find(
    (t) => t.id === road.connectedTowns[0],
  );
  const toTown = world.foundation.towns.find(
    (t) => t.id === road.connectedTowns[1],
  );

  // Calculate approximate length from path waypoints
  let pathLength = 0;
  for (let i = 1; i < road.path.length; i++) {
    const dx = road.path[i].x - road.path[i - 1].x;
    const dz = road.path[i].z - road.path[i - 1].z;
    pathLength += Math.sqrt(dx * dx + dz * dz);
  }

  return (
    <>
      <PropertySection title="Road" icon={<Route size={10} />}>
        <InfoRow label="ID" value={road.id} />
        <InfoRow
          label="From"
          value={fromTown ? fromTown.name : road.connectedTowns[0]}
        />
        <InfoRow
          label="To"
          value={toTown ? toTown.name : road.connectedTowns[1]}
        />
        <InfoRow label="Main Road" value={road.isMainRoad ? "Yes" : "No"} />
        <InfoRow label="Width" value={`${road.width}m`} />
        <InfoRow label="Waypoints" value={road.path.length} />
        <InfoRow label="Length" value={`~${Math.round(pathLength)}m`} />
      </PropertySection>

      <PropertySection title="Path Info" defaultOpen={false}>
        {road.path.length > 0 && (
          <>
            <InfoRow
              label="Start"
              value={`(${Math.round(road.path[0].x)}, ${Math.round(road.path[0].z)})`}
            />
            <InfoRow
              label="End"
              value={`(${Math.round(road.path[road.path.length - 1].x)}, ${Math.round(road.path[road.path.length - 1].z)})`}
            />
          </>
        )}
        <div className="text-[10px] text-text-tertiary italic pt-1">
          Roads are generated from foundation config. Modify road settings in
          Creation Mode to regenerate.
        </div>
      </PropertySection>

      {world.foundation.config.roads && (
        <PropertySection title="Road Config" defaultOpen={false}>
          <InfoRow
            label="Road Width"
            value={`${world.foundation.config.roads.roadWidth}m`}
          />
          <InfoRow
            label="Smoothing"
            value={`${world.foundation.config.roads.smoothingIterations} passes`}
          />
          <InfoRow
            label="Extra Connections"
            value={`${Math.round(world.foundation.config.roads.extraConnectionsRatio * 100)}%`}
          />
          <InfoRow
            label="Slope Cost"
            value={`${world.foundation.config.roads.costSlopeMultiplier}×`}
          />
          <InfoRow
            label="Water Penalty"
            value={world.foundation.config.roads.costWaterPenalty}
          />
        </PropertySection>
      )}
    </>
  );
}
