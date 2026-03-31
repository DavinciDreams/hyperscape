/**
 * MusicZoneProperties — Editor for MusicZone entities
 *
 * Edits: name, trackId, combatTrackId, priority, blendDistance.
 * Polygon is edited via viewport brush, not in properties panel.
 */

import { Music } from "lucide-react";
import React, { useCallback } from "react";

import type { MusicZone } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  NumberInput,
  SliderInput,
  InfoRow,
} from "./PropertyControls";

interface Props {
  musicZone: MusicZone;
}

export function MusicZoneProperties({ musicZone }: Props) {
  const { actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<MusicZone>) => {
      actions.updateMusicZone(musicZone.id, updates);
    },
    [actions, musicZone.id],
  );

  return (
    <>
      <PropertySection title="Music Zone" icon={<Music size={10} />}>
        <TextInput
          label="Name"
          value={musicZone.name}
          onChange={(name) => update({ name })}
        />
        <TextInput
          label="Track ID"
          value={musicZone.trackId}
          onChange={(trackId) => update({ trackId })}
        />
        <TextInput
          label="Combat Track"
          value={musicZone.combatTrackId ?? ""}
          onChange={(combatTrackId) =>
            update({ combatTrackId: combatTrackId || undefined })
          }
        />
      </PropertySection>

      <PropertySection title="Zone Settings">
        <NumberInput
          label="Priority"
          value={musicZone.priority}
          onChange={(priority) => update({ priority })}
          min={0}
          max={100}
          step={1}
        />
        <SliderInput
          label="Blend Distance"
          value={musicZone.blendDistance}
          onChange={(blendDistance) => update({ blendDistance })}
          min={1}
          max={50}
          step={1}
          unit="m"
          hint="Transition distance at zone edges"
        />
      </PropertySection>

      <PropertySection title="Polygon" defaultOpen={false}>
        <InfoRow label="Vertices" value={musicZone.polygon.length} />
        {musicZone.polygon.length === 0 && (
          <div className="text-[10px] text-amber-400/80 italic">
            Use the brush tool to paint this zone&apos;s area.
          </div>
        )}
      </PropertySection>
    </>
  );
}
