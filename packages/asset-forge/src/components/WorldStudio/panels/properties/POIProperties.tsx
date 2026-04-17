/**
 * POIProperties — Editor for selected Point of Interest
 *
 * Edits: name, category, importance, radius, connected roads.
 */

import { Compass } from "lucide-react";
import React, { useCallback } from "react";

import type { PlacedPOI } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  SelectInput,
  SliderInput,
  NumberInput,
  PositionEditor,
  InfoRow,
} from "./PropertyControls";
import { BehaviorScriptSection } from "./BehaviorScriptSection";

interface Props {
  poi: PlacedPOI;
}

const POI_CATEGORIES: Array<{ value: PlacedPOI["category"]; label: string }> = [
  { value: "dungeon", label: "Dungeon" },
  { value: "shrine", label: "Shrine" },
  { value: "landmark", label: "Landmark" },
  { value: "resource_area", label: "Resource Area" },
  { value: "ruin", label: "Ruin" },
  { value: "camp", label: "Camp" },
  { value: "crossing", label: "Crossing" },
  { value: "waystation", label: "Waystation" },
  { value: "fishing_spot", label: "Fishing Spot" },
];

export function POIProperties({ poi }: Props) {
  const { actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<PlacedPOI>) => {
      actions.updatePOI(poi.id, updates);
    },
    [actions, poi.id],
  );

  return (
    <>
      <PropertySection title="Point of Interest" icon={<Compass size={10} />}>
        <TextInput
          label="Name"
          value={poi.name}
          onChange={(name) => update({ name })}
        />
        <SelectInput
          label="Category"
          value={poi.category}
          onChange={(category) =>
            update({ category: category as PlacedPOI["category"] })
          }
          options={POI_CATEGORIES}
        />
        <SliderInput
          label="Importance"
          value={poi.importance}
          onChange={(importance) => update({ importance })}
          min={0}
          max={1}
          step={0.05}
          hint="Higher importance = more road connectivity"
        />
        <NumberInput
          label="Radius"
          value={poi.radius}
          onChange={(radius) => update({ radius })}
          min={5}
          max={100}
          step={5}
          unit="m"
        />
      </PropertySection>

      <PropertySection title="Position">
        <PositionEditor
          label="Position"
          position={poi.position}
          onChange={(position) => update({ position })}
        />
      </PropertySection>

      <PropertySection title="Connections" defaultOpen={false}>
        <InfoRow
          label="Connected Roads"
          value={
            poi.connectedRoads.length > 0
              ? poi.connectedRoads.join(", ")
              : "None"
          }
        />
        {poi.entryPoint && (
          <>
            <InfoRow label="Entry X" value={Math.round(poi.entryPoint.x)} />
            <InfoRow label="Entry Z" value={Math.round(poi.entryPoint.z)} />
            <InfoRow
              label="Entry Angle"
              value={`${Math.round(poi.entryPoint.angle)}°`}
            />
          </>
        )}
      </PropertySection>

      {/* Behavior Script */}
      <BehaviorScriptSection
        entityId={poi.id}
        stateKey="pois"
        stateRoot="extendedLayers"
        entityData={poi as unknown as Record<string, unknown>}
      />
    </>
  );
}
