/**
 * TownProperties — Editor for selected town
 *
 * Shows town information from foundation and allows non-destructive overrides
 * (name, building modifications) via TownOverride layer. Buildings can be
 * renamed, type-changed, or disabled through BuildingModification entries.
 */

import { Building2, Eye, EyeOff, Pencil } from "lucide-react";
import React, { useCallback, useState } from "react";

import type {
  WorldData,
  TownOverride,
  BuildingModification,
} from "../../../WorldBuilder/types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  InfoRow,
  Toggle,
} from "./PropertyControls";

interface Props {
  townId: string;
  world: WorldData;
}

export function TownProperties({ townId, world }: Props) {
  const { actions } = useWorldStudio();
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(
    null,
  );

  const town = world.foundation.towns.find((t) => t.id === townId);
  const override = world.layers.townOverrides.get(townId);
  const buildings = world.foundation.buildings.filter(
    (b) => b.townId === townId,
  );
  const townNpcs = world.layers.npcs.filter(
    (npc) =>
      npc.parentContext.type === "town" && npc.parentContext.townId === townId,
  );

  const updateOverride = useCallback(
    (updates: Partial<TownOverride>) => {
      if (override) {
        actions.updateTownOverride(townId, updates);
      } else {
        actions.addTownOverride({
          townId,
          ...updates,
        } as TownOverride);
      }
    },
    [actions, townId, override],
  );

  const getBuildingMod = useCallback(
    (buildingId: string): BuildingModification | undefined => {
      return override?.buildingModifications?.find(
        (m) => m.buildingId === buildingId,
      );
    },
    [override],
  );

  const updateBuildingMod = useCallback(
    (buildingId: string, updates: Partial<BuildingModification>) => {
      const currentMods = override?.buildingModifications ?? [];
      const existingIdx = currentMods.findIndex(
        (m) => m.buildingId === buildingId,
      );

      let newMods: BuildingModification[];
      if (existingIdx >= 0) {
        newMods = [...currentMods];
        newMods[existingIdx] = { ...newMods[existingIdx], ...updates };
      } else {
        newMods = [...currentMods, { buildingId, ...updates }];
      }

      updateOverride({ buildingModifications: newMods });
    },
    [override, updateOverride],
  );

  if (!town) {
    return (
      <PropertySection title="Town">
        <InfoRow label="Status" value="Not found" />
      </PropertySection>
    );
  }

  const displayName = override?.nameOverride || town.name;

  return (
    <>
      <PropertySection title="Town" icon={<Building2 size={10} />}>
        <TextInput
          label="Name"
          value={displayName}
          onChange={(nameOverride) => updateOverride({ nameOverride })}
        />
        <InfoRow label="Original Name" value={town.name} />
        <InfoRow label="Size" value={town.size} />
        <InfoRow label="Layout" value={town.layoutType} />
        <InfoRow
          label="Position"
          value={`(${Math.round(town.position.x)}, ${Math.round(town.position.z)})`}
        />
        {town.biomeId && <InfoRow label="Biome" value={town.biomeId} />}
      </PropertySection>

      <PropertySection
        title="Buildings"
        badge={buildings.length}
        defaultOpen={false}
      >
        {buildings.length === 0 ? (
          <div className="text-[10px] text-text-tertiary italic">
            No buildings in this town.
          </div>
        ) : (
          buildings.map((building) => {
            const mod = getBuildingMod(building.id);
            const isDisabled = mod?.disabled ?? false;
            const isEditing = editingBuildingId === building.id;
            const displayBuildingName = mod?.nameOverride || building.name;

            return (
              <div
                key={building.id}
                className={`space-y-1 py-1.5 border-b border-border-primary/20 last:border-0 ${
                  isDisabled ? "opacity-40" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs ${isDisabled ? "line-through text-text-tertiary" : "text-text-secondary"}`}
                  >
                    {displayBuildingName}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      className="p-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary"
                      onClick={() =>
                        setEditingBuildingId(isEditing ? null : building.id)
                      }
                      title="Edit building"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      className={`p-0.5 rounded hover:bg-bg-tertiary ${
                        isDisabled
                          ? "text-red-400/60 hover:text-red-400"
                          : "text-text-tertiary hover:text-text-primary"
                      }`}
                      onClick={() =>
                        updateBuildingMod(building.id, {
                          disabled: !isDisabled,
                        })
                      }
                      title={
                        isDisabled ? "Enable building" : "Disable building"
                      }
                    >
                      {isDisabled ? <EyeOff size={10} /> : <Eye size={10} />}
                    </button>
                  </div>
                </div>
                <InfoRow
                  label="Type"
                  value={mod?.typeOverride || building.type}
                />
                {isEditing && (
                  <div className="space-y-1 pl-2 border-l-2 border-primary/30">
                    <TextInput
                      label="Name Override"
                      value={mod?.nameOverride ?? ""}
                      onChange={(nameOverride) =>
                        updateBuildingMod(building.id, {
                          nameOverride: nameOverride || undefined,
                        })
                      }
                      placeholder={building.name}
                    />
                    <TextInput
                      label="Type Override"
                      value={mod?.typeOverride ?? ""}
                      onChange={(typeOverride) =>
                        updateBuildingMod(building.id, {
                          typeOverride: typeOverride || undefined,
                        })
                      }
                      placeholder={building.type}
                    />
                    <InfoRow
                      label="Position"
                      value={`(${Math.round(building.position.x)}, ${Math.round(building.position.z)})`}
                    />
                    <InfoRow
                      label="Dimensions"
                      value={`${building.dimensions.width}×${building.dimensions.depth}, ${building.dimensions.floors}F`}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </PropertySection>

      {town.entryPoints && town.entryPoints.length > 0 && (
        <PropertySection
          title="Entry Points"
          badge={town.entryPoints.length}
          defaultOpen={false}
        >
          {town.entryPoints.map((ep, i) => (
            <div
              key={i}
              className="py-1 border-b border-border-primary/20 last:border-0"
            >
              <InfoRow label="Direction" value={ep.direction} />
              <InfoRow
                label="Position"
                value={`(${Math.round(ep.position.x)}, ${Math.round(ep.position.z)})`}
              />
              {ep.connectedRoadId && (
                <InfoRow label="Road" value={ep.connectedRoadId} />
              )}
            </div>
          ))}
        </PropertySection>
      )}

      <PropertySection title="NPCs" badge={townNpcs.length} defaultOpen={false}>
        {townNpcs.length === 0 ? (
          <div className="text-[10px] text-text-tertiary italic">
            No NPCs placed in this town.
          </div>
        ) : (
          townNpcs.map((npc) => (
            <InfoRow key={npc.id} label={npc.name} value={npc.npcTypeId} />
          ))
        )}
      </PropertySection>
    </>
  );
}
