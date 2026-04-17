/**
 * StationProperties — Editor for PlacedStation entities with manifest integration
 *
 * Shows station placement data and links to manifest for model info,
 * examine text, and recipes available at this station.
 */

import { Anvil, ChefHat } from "lucide-react";
import React, { useCallback, useMemo } from "react";

import type { PlacedStation } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import { ItemReference } from "../ItemPicker";
import {
  PropertySection,
  TextInput,
  PositionEditor,
  SliderInput,
  InfoRow,
} from "./PropertyControls";
import { BehaviorScriptSection } from "./BehaviorScriptSection";

interface Props {
  station: PlacedStation;
}

export function StationProperties({ station }: Props) {
  const { actions, state } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<PlacedStation>) => {
      actions.updateStation(station.id, updates);
    },
    [actions, station.id],
  );

  // Look up station in manifest
  const manifestStation = useMemo(
    () => state.manifests.stations.find((s) => s.type === station.stationType),
    [state.manifests.stations, station.stationType],
  );

  // Find recipes usable at this station type
  const stationRecipes = useMemo(() => {
    // Map station type to recipe skill
    const typeToSkill: Record<string, string[]> = {
      anvil: ["smithing"],
      furnace: ["smelting"],
      range: ["cooking"],
      fire: ["cooking", "firemaking"],
      spinning_wheel: ["crafting"],
      pottery_wheel: ["crafting"],
      crafting_table: ["crafting", "fletching"],
      tanning_rack: ["tanning"],
      altar: ["runecrafting"],
    };
    const skills = typeToSkill[station.stationType] ?? [];
    return state.manifests.recipes.filter((r) => skills.includes(r.skill));
  }, [state.manifests.recipes, station.stationType]);

  return (
    <>
      <PropertySection title="Station" icon={<Anvil size={10} />}>
        <TextInput
          label="Name"
          value={station.name}
          onChange={(name) => update({ name })}
        />
        <InfoRow label="Station Type" value={station.stationType} />
        {manifestStation && (
          <>
            <InfoRow label="Model" value={manifestStation.model} />
            <InfoRow label="Examine" value={manifestStation.examine} />
          </>
        )}
        {station.bankId && (
          <TextInput
            label="Bank ID"
            value={station.bankId}
            onChange={(bankId) => update({ bankId })}
          />
        )}
        {station.runeType && (
          <TextInput
            label="Rune Type"
            value={station.runeType}
            onChange={(runeType) => update({ runeType })}
          />
        )}
      </PropertySection>

      <PropertySection title="Transform">
        <PositionEditor
          label="Position"
          position={station.position}
          onChange={(position) => update({ position })}
        />
        <SliderInput
          label="Rotation"
          value={Math.round((station.rotation * 180) / Math.PI)}
          onChange={(deg) => update({ rotation: (deg * Math.PI) / 180 })}
          min={0}
          max={360}
          step={15}
          unit="°"
        />
      </PropertySection>

      {/* Available recipes at this station */}
      {stationRecipes.length > 0 && (
        <PropertySection
          title="Recipes"
          icon={<ChefHat size={10} />}
          defaultOpen={false}
        >
          <InfoRow
            label="Available"
            value={`${stationRecipes.length} recipes`}
          />
          <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto scrollbar-thin">
            {stationRecipes.map((recipe) => (
              <div
                key={recipe.id}
                className="flex items-center gap-1 pl-2 py-0.5"
              >
                <ItemReference itemId={recipe.output ?? recipe.id} />
                <span className="text-[10px] text-text-tertiary">
                  Lv{recipe.level} · {recipe.xp}xp
                </span>
              </div>
            ))}
          </div>
        </PropertySection>
      )}

      {/* Behavior Script */}
      <BehaviorScriptSection
        entityId={station.id}
        stateKey="stations"
        stateRoot="extendedLayers"
        entityData={station as unknown as Record<string, unknown>}
        tracksSource
        entityCategory="station"
      />
    </>
  );
}
