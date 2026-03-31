/**
 * SpawnPointProperties — Editor for PlacedSpawnPoint entities
 */

import React, { useCallback } from "react";

import type { PlacedSpawnPoint } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  SelectInput,
  NumberInput,
  PositionEditor,
  SliderInput,
} from "./PropertyControls";

interface Props {
  spawnPoint: PlacedSpawnPoint;
}

export function SpawnPointProperties({ spawnPoint }: Props) {
  const { actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<PlacedSpawnPoint>) => {
      actions.updateSpawnPoint(spawnPoint.id, updates);
    },
    [actions, spawnPoint.id],
  );

  return (
    <>
      <PropertySection title="Spawn Point">
        <TextInput
          label="Name"
          value={spawnPoint.name}
          onChange={(name) => update({ name })}
        />
        <SelectInput
          label="Spawn Type"
          value={spawnPoint.spawnType}
          onChange={(spawnType) =>
            update({
              spawnType: spawnType as PlacedSpawnPoint["spawnType"],
            })
          }
          options={[
            { value: "initial", label: "Initial Spawn" },
            { value: "death-respawn", label: "Death Respawn" },
            { value: "teleport-arrival", label: "Teleport Arrival" },
          ]}
        />
        <NumberInput
          label="Capacity"
          value={spawnPoint.capacity}
          onChange={(capacity) => update({ capacity })}
          min={1}
          max={50}
        />
      </PropertySection>

      <PropertySection title="Transform">
        <PositionEditor
          label="Position"
          position={spawnPoint.position}
          onChange={(position) => update({ position })}
        />
        <SliderInput
          label="Rotation"
          value={Math.round((spawnPoint.rotation * 180) / Math.PI)}
          onChange={(deg) => update({ rotation: (deg * Math.PI) / 180 })}
          min={0}
          max={360}
          step={15}
          unit="°"
        />
      </PropertySection>

      {spawnPoint.linkedAreaId && (
        <PropertySection title="Links">
          <TextInput
            label="Linked Area ID"
            value={spawnPoint.linkedAreaId}
            onChange={(linkedAreaId) => update({ linkedAreaId })}
          />
        </PropertySection>
      )}
    </>
  );
}
