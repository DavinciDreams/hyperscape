/**
 * DangerSourceProperties — Editor for danger source entities
 *
 * Shows editable properties: name, description, radius, intensity, falloff curve.
 * Danger sources are placeable points that increase local difficulty beyond biome
 * defaults (e.g., "Dark Wizard Tower", "Spider Nest").
 */

import { Zap } from "lucide-react";
import React, { useCallback } from "react";

import type { PlacedDangerSource } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  SliderInput,
  InfoRow,
} from "./PropertyControls";

interface Props {
  dangerSource: PlacedDangerSource;
}

export function DangerSourceProperties({ dangerSource }: Props) {
  const { actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<PlacedDangerSource>) => {
      actions.updateDangerSource(dangerSource.id, updates);
    },
    [actions, dangerSource.id],
  );

  return (
    <>
      <PropertySection title="Danger Source" icon={<Zap size={10} />}>
        <TextInput
          label="Name"
          value={dangerSource.name}
          onChange={(name) => update({ name })}
        />
        <TextInput
          label="Description"
          value={dangerSource.description ?? ""}
          onChange={(description) =>
            update({ description: description || undefined })
          }
          placeholder="Optional description"
        />
        <InfoRow
          label="Position"
          value={`(${Math.round(dangerSource.position.x)}, ${Math.round(dangerSource.position.z)})`}
        />
      </PropertySection>

      <PropertySection title="Influence" defaultOpen>
        <SliderInput
          label="Radius"
          value={dangerSource.radius}
          onChange={(radius) => update({ radius })}
          min={10}
          max={500}
          step={5}
          unit="m"
          hint="How far the danger influence extends"
        />
        <SliderInput
          label="Intensity"
          value={dangerSource.intensity}
          onChange={(intensity) => update({ intensity })}
          min={0.1}
          max={3}
          step={0.1}
          hint="Adds to biome difficulty (0-3)"
        />
        <SliderInput
          label="Falloff Curve"
          value={dangerSource.falloffCurve}
          onChange={(falloffCurve) => update({ falloffCurve })}
          min={0.5}
          max={4}
          step={0.1}
          hint="Higher = sharper drop-off at edges"
        />
      </PropertySection>

      <PropertySection title="Preview" defaultOpen={false}>
        <InfoRow
          label="Peak Difficulty"
          value={`+${dangerSource.intensity.toFixed(1)}`}
        />
        <InfoRow
          label="Half-intensity at"
          value={`${Math.round(dangerSource.radius * Math.pow(0.5, 1 / dangerSource.falloffCurve))}m`}
        />
        <InfoRow label="Zero at" value={`${dangerSource.radius}m`} />
      </PropertySection>
    </>
  );
}
