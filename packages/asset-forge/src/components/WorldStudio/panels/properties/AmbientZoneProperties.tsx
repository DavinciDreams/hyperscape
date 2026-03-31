/**
 * AmbientZoneProperties — Editor for AmbientZone entities
 *
 * Edits: name, ambientType, tracks, volume, falloffDistance.
 * Polygon is edited via viewport brush, not in properties panel.
 */

import { Volume2 } from "lucide-react";
import React, { useCallback } from "react";

import type { AmbientZone } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  SelectInput,
  SliderInput,
  InfoRow,
} from "./PropertyControls";

interface Props {
  ambientZone: AmbientZone;
}

const AMBIENT_TYPES: Array<{
  value: AmbientZone["ambientType"];
  label: string;
}> = [
  { value: "forest", label: "Forest" },
  { value: "cave", label: "Cave" },
  { value: "ocean", label: "Ocean" },
  { value: "town", label: "Town" },
  { value: "desert", label: "Desert" },
  { value: "mountain", label: "Mountain" },
  { value: "swamp", label: "Swamp" },
  { value: "custom", label: "Custom" },
];

export function AmbientZoneProperties({ ambientZone }: Props) {
  const { actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<AmbientZone>) => {
      actions.updateAmbientZone(ambientZone.id, updates);
    },
    [actions, ambientZone.id],
  );

  return (
    <>
      <PropertySection title="Ambient Zone" icon={<Volume2 size={10} />}>
        <TextInput
          label="Name"
          value={ambientZone.name}
          onChange={(name) => update({ name })}
        />
        <SelectInput
          label="Type"
          value={ambientZone.ambientType}
          onChange={(ambientType) =>
            update({ ambientType: ambientType as AmbientZone["ambientType"] })
          }
          options={AMBIENT_TYPES}
        />
      </PropertySection>

      <PropertySection title="Sound Settings">
        <SliderInput
          label="Volume"
          value={ambientZone.volume}
          onChange={(volume) => update({ volume })}
          min={0}
          max={1}
          step={0.05}
          hint="Playback volume (0 = silent, 1 = full)"
        />
        <SliderInput
          label="Falloff Distance"
          value={ambientZone.falloffDistance}
          onChange={(falloffDistance) => update({ falloffDistance })}
          min={1}
          max={50}
          step={1}
          unit="m"
          hint="Edge fade distance"
        />
      </PropertySection>

      <PropertySection title="Tracks">
        {ambientZone.tracks.length > 0 ? (
          ambientZone.tracks.map((track, idx) => (
            <InfoRow key={idx} label={`Track ${idx + 1}`} value={track} />
          ))
        ) : (
          <div className="text-[10px] text-text-tertiary italic">
            No tracks assigned.
          </div>
        )}
      </PropertySection>

      <PropertySection title="Polygon" defaultOpen={false}>
        <InfoRow label="Vertices" value={ambientZone.polygon.length} />
        {ambientZone.polygon.length === 0 && (
          <div className="text-[10px] text-amber-400/80 italic">
            Use the brush tool to paint this zone&apos;s area.
          </div>
        )}
      </PropertySection>
    </>
  );
}
