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
  SliderInput,
} from "./PropertyControls";

interface Props {
  townId: string;
  world: WorldData;
}

export const TownProperties = React.memo(function TownProperties({
  townId,
  world,
}: Props) {
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

  // Safe zone defaults by town size
  const SAFE_ZONE_DEFAULTS: Record<string, number> = {
    hamlet: 40,
    village: 60,
    town: 80,
  };
  const defaultSafeZone = SAFE_ZONE_DEFAULTS[town.size] ?? 60;
  const effectiveSafeZone = override?.safeZoneRadiusOverride ?? defaultSafeZone;

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

      <PropertySection title="Safe Zone" defaultOpen>
        <SliderInput
          label="Safe Zone Radius"
          value={effectiveSafeZone}
          onChange={(val) =>
            updateOverride({
              safeZoneRadiusOverride: val === defaultSafeZone ? undefined : val,
            })
          }
          min={10}
          max={200}
          step={5}
          unit="m"
          hint={`Default for ${town.size}: ${defaultSafeZone}m`}
        />
        <InfoRow label="Falloff Distance" value="300m" />
        <InfoRow
          label="Total Influence"
          value={`${effectiveSafeZone + 300}m`}
        />
        {override?.safeZoneRadiusOverride != null && (
          <button
            className="text-[10px] text-primary hover:text-primary/80 mt-1"
            onClick={() =>
              updateOverride({ safeZoneRadiusOverride: undefined })
            }
          >
            Reset to default ({defaultSafeZone}m)
          </button>
        )}
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
                    <div className="flex gap-1">
                      <div className="flex-1">
                        <label className="text-[9px] text-text-tertiary">
                          Offset X
                        </label>
                        <input
                          type="number"
                          step={1}
                          value={mod?.positionOffset?.x ?? 0}
                          onChange={(e) =>
                            updateBuildingMod(building.id, {
                              positionOffset: {
                                x: Number(e.target.value),
                                z: mod?.positionOffset?.z ?? 0,
                              },
                            })
                          }
                          className="w-full px-1 py-0.5 rounded bg-bg-tertiary border border-border-primary text-[10px] text-text-primary focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[9px] text-text-tertiary">
                          Offset Z
                        </label>
                        <input
                          type="number"
                          step={1}
                          value={mod?.positionOffset?.z ?? 0}
                          onChange={(e) =>
                            updateBuildingMod(building.id, {
                              positionOffset: {
                                x: mod?.positionOffset?.x ?? 0,
                                z: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-1 py-0.5 rounded bg-bg-tertiary border border-border-primary text-[10px] text-text-primary focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>
                    <SliderInput
                      label="Rotation"
                      value={Math.round(
                        ((mod?.rotationOverride ?? building.rotation) * 180) /
                          Math.PI,
                      )}
                      onChange={(deg) =>
                        updateBuildingMod(building.id, {
                          rotationOverride: (deg * Math.PI) / 180,
                        })
                      }
                      min={0}
                      max={360}
                      step={15}
                      unit="°"
                    />
                    <InfoRow
                      label="Base Position"
                      value={`(${Math.round(building.position.x)}, ${Math.round(building.position.z)})`}
                    />
                    <InfoRow
                      label="Dimensions"
                      value={`${building.dimensions.width}×${building.dimensions.depth}, ${building.dimensions.floors}F`}
                    />
                    {(mod?.positionOffset || mod?.rotationOverride != null) && (
                      <button
                        className="text-[10px] text-primary hover:text-primary/80 mt-0.5"
                        onClick={() =>
                          updateBuildingMod(building.id, {
                            positionOffset: undefined,
                            rotationOverride: undefined,
                          })
                        }
                      >
                        Reset transform
                      </button>
                    )}
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
});
