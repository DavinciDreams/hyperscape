/**
 * StationManifestInfoSection — Read-only custom section that surfaces the
 * PlacedStation's matching manifest entry (model + examine text) plus the
 * list of recipes available at this station type.
 *
 * Registered under the widget ID "StationManifestInfo" and referenced from
 * HyperiaModule's `station` entity-type `customSections`.
 */

import { ChefHat } from "lucide-react";
import React, { useMemo } from "react";
import type { CustomSectionProps } from "./customSectionRegistry";
import { useWorldStudio } from "../../components/WorldStudio/WorldStudioContext";
import { InfoRow } from "../../components/WorldStudio/panels/properties/PropertyControls";
import { ItemReference } from "../../components/WorldStudio/panels/ItemPicker";

const STATION_TYPE_TO_SKILLS: Record<string, string[]> = {
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

export function StationManifestInfoSection({ entityData }: CustomSectionProps) {
  const { state } = useWorldStudio();
  const stationType = entityData.stationType as string | undefined;

  const manifestStation = useMemo(
    () =>
      stationType
        ? state.manifests.stations.find((s) => s.type === stationType)
        : undefined,
    [state.manifests.stations, stationType],
  );

  if (!manifestStation) {
    if (state.manifests.loaded) {
      return (
        <div className="text-[10px] text-amber-400/80 italic">
          No manifest entry found for station type &quot;{stationType}&quot;.
        </div>
      );
    }
    return (
      <div className="text-[10px] text-text-tertiary italic">
        Loading manifests…
      </div>
    );
  }

  return (
    <>
      <InfoRow label="Model" value={manifestStation.model} />
      <InfoRow label="Examine" value={manifestStation.examine} />
    </>
  );
}

export function StationRecipesSection({ entityData }: CustomSectionProps) {
  const { state } = useWorldStudio();
  const stationType = entityData.stationType as string | undefined;

  const stationRecipes = useMemo(() => {
    const skills = stationType
      ? (STATION_TYPE_TO_SKILLS[stationType] ?? [])
      : [];
    if (skills.length === 0) return [];
    return state.manifests.recipes.filter((r) => skills.includes(r.skill));
  }, [state.manifests.recipes, stationType]);

  if (stationRecipes.length === 0) {
    return (
      <div className="text-[10px] text-text-tertiary italic">
        No recipes available at this station type.
      </div>
    );
  }

  return (
    <>
      <InfoRow label="Available" value={`${stationRecipes.length} recipes`} />
      <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto scrollbar-thin">
        {stationRecipes.map((recipe) => (
          <div key={recipe.id} className="flex items-center gap-1 pl-2 py-0.5">
            <ItemReference itemId={recipe.output ?? recipe.id} />
            <span className="text-[10px] text-text-tertiary">
              Lv{recipe.level} · {recipe.xp}xp
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

// Re-export icon for registration use (if we want to include icon metadata)
export const StationRecipesIcon = ChefHat;
