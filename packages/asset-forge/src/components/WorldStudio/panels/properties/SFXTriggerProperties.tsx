/**
 * SFXTriggerProperties — Editor for SFXTrigger entities
 *
 * Edits: name, soundPath, position, radius, volume, looping, description.
 */

import { Speaker } from "lucide-react";
import React, { useCallback } from "react";

import type { SFXTrigger } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  SliderInput,
  Toggle,
  PositionEditor,
} from "./PropertyControls";

interface Props {
  sfxTrigger: SFXTrigger;
}

export function SFXTriggerProperties({ sfxTrigger }: Props) {
  const { actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<SFXTrigger>) => {
      actions.updateSFXTrigger(sfxTrigger.id, updates);
    },
    [actions, sfxTrigger.id],
  );

  return (
    <>
      <PropertySection title="SFX Trigger" icon={<Speaker size={10} />}>
        <TextInput
          label="Name"
          value={sfxTrigger.name}
          onChange={(name) => update({ name })}
        />
        <TextInput
          label="Sound Path"
          value={sfxTrigger.soundPath}
          onChange={(soundPath) => update({ soundPath })}
        />
        <TextInput
          label="Description"
          value={sfxTrigger.description ?? ""}
          onChange={(description) =>
            update({ description: description || undefined })
          }
        />
      </PropertySection>

      <PropertySection title="Playback">
        <SliderInput
          label="Volume"
          value={sfxTrigger.volume}
          onChange={(volume) => update({ volume })}
          min={0}
          max={1}
          step={0.05}
        />
        <SliderInput
          label="Radius"
          value={sfxTrigger.radius}
          onChange={(radius) => update({ radius })}
          min={1}
          max={100}
          step={1}
          unit="m"
          hint="Audible distance from position"
        />
        <Toggle
          label="Looping"
          value={sfxTrigger.looping}
          onChange={(looping) => update({ looping })}
        />
      </PropertySection>

      <PropertySection title="Transform">
        <PositionEditor
          label="Position"
          position={sfxTrigger.position}
          onChange={(position) => update({ position })}
        />
      </PropertySection>
    </>
  );
}
