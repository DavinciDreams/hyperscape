/**
 * GameResourceProperties — Full manifest editor for game world resource entities
 *
 * Shows resource data (mining rocks, trees, fishing spots) from the base manifest
 * with inline editing. Edits create override deltas.
 */

import { Pickaxe, TreePine, Fish } from "lucide-react";
import React, { useCallback, useMemo } from "react";

import type { ResourceManifestOverride } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  InfoRow,
  DragNumberInput,
  TextInput,
  OverridableField,
} from "./PropertyControls";
import { TransformSection } from "./TransformSection";
import { BehaviorScriptSection } from "./BehaviorScriptSection";

interface Props {
  entityData: Record<string, unknown>;
}

export function GameResourceProperties({ entityData }: Props) {
  const { state, actions } = useWorldStudio();
  const entityId = String(entityData.entityId);
  const entityType = String(entityData.entityType ?? "");
  const isTree = entityType === "tree";
  const isFishing = entityType === "fishing" || entityType === "fishingSpot";
  const resourceType: "woodcutting" | "mining" | "fishing" = isTree
    ? "woodcutting"
    : isFishing
      ? "fishing"
      : "mining";

  // Base manifest lookup
  const manifestRock = useMemo(
    () => state.manifests.miningRocks.find((r) => r.id === entityId),
    [state.manifests.miningRocks, entityId],
  );
  const manifestTree = useMemo(
    () => state.manifests.trees.find((t) => t.id === entityId),
    [state.manifests.trees, entityId],
  );
  const manifestFishing = useMemo(
    () => state.manifests.fishingSpots.find((f) => f.id === entityId),
    [state.manifests.fishingSpots, entityId],
  );

  const baseName =
    manifestTree?.name ??
    manifestRock?.name ??
    manifestFishing?.name ??
    String(entityData.displayName ?? entityId);
  const baseLevelRequired =
    manifestTree?.levelRequired ??
    manifestRock?.levelRequired ??
    manifestFishing?.levelRequired;
  const baseExamine =
    manifestTree?.examine ?? manifestRock?.examine ?? manifestFishing?.examine;
  const baseToolRequired = manifestFishing?.toolRequired;

  // Override from state
  const override = state.manifestOverrides.resourceOverrides.get(entityId);

  const getSection = useCallback(
    (section: string, field: string): unknown => {
      const ovrSection = override?.[section as keyof ResourceManifestOverride];
      if (ovrSection != null && typeof ovrSection === "object") {
        const val = (ovrSection as Record<string, unknown>)[field];
        if (val !== undefined) return val;
      }
      return undefined;
    },
    [override],
  );

  const isOvr = useCallback(
    (section: string, field: string): boolean => {
      const ovrSection = override?.[section as keyof ResourceManifestOverride];
      if (ovrSection != null && typeof ovrSection === "object") {
        return (ovrSection as Record<string, unknown>)[field] !== undefined;
      }
      return false;
    },
    [override],
  );

  const set = useCallback(
    (section: string, field: string, value: unknown) => {
      const existing =
        override ?? ({ entityId, resourceType } as Record<string, unknown>);
      const sectionData = {
        ...((existing[section as keyof typeof existing] as Record<
          string,
          unknown
        >) ?? {}),
        [field]: value,
      };
      actions.setManifestOverride("resourceOverrides", entityId, {
        ...existing,
        resourceType,
        [section]: sectionData,
      });
    },
    [override, entityId, resourceType, actions],
  );

  const reset = useCallback(
    (section: string, field: string) => {
      if (!override) return;
      const sectionData = {
        ...((override[section as keyof ResourceManifestOverride] as Record<
          string,
          unknown
        >) ?? {}),
      };
      delete sectionData[field];
      const hasFields = Object.keys(sectionData).length > 0;
      const updated = { ...override } as Record<string, unknown>;
      if (hasFields) {
        updated[section] = sectionData;
      } else {
        delete updated[section];
      }
      const keys = Object.keys(updated).filter(
        (k) => k !== "entityId" && k !== "resourceType",
      );
      if (keys.length === 0) {
        actions.clearManifestOverride("resourceOverrides", entityId);
      } else {
        actions.setManifestOverride("resourceOverrides", entityId, updated);
      }
    },
    [override, entityId, actions],
  );

  const pos = entityData.position as
    | { x: number; y: number; z: number }
    | undefined;
  const typeIcon = isTree ? TreePine : isFishing ? Fish : Pickaxe;
  const typeLabel = isTree ? "Tree" : isFishing ? "Fishing Spot" : "Ore";

  return (
    <>
      {/* Identity */}
      <PropertySection
        title={`${typeLabel} Identity`}
        icon={React.createElement(typeIcon, { size: 10 })}
        persistKey="game-resource-identity"
      >
        <OverridableField
          label="Name"
          isOverridden={isOvr("identity", "name")}
          onReset={() => reset("identity", "name")}
        >
          <TextInput
            label=""
            value={String(getSection("identity", "name") ?? baseName)}
            onChange={(v) => set("identity", "name", v)}
          />
        </OverridableField>
        <InfoRow label="Resource ID" value={entityId} />
        <InfoRow
          label="Skill"
          value={resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}
        />
        {baseExamine && (
          <OverridableField
            label="Examine"
            isOverridden={isOvr("identity", "examine")}
            onReset={() => reset("identity", "examine")}
          >
            <TextInput
              label=""
              value={String(getSection("identity", "examine") ?? baseExamine)}
              onChange={(v) => set("identity", "examine", v)}
            />
          </OverridableField>
        )}
      </PropertySection>

      {/* Gathering */}
      <PropertySection title="Gathering" persistKey="game-resource-gathering">
        {baseLevelRequired != null && (
          <OverridableField
            label="Level Required"
            isOverridden={isOvr("gathering", "levelRequired")}
            onReset={() => reset("gathering", "levelRequired")}
          >
            <DragNumberInput
              label=""
              value={Number(
                getSection("gathering", "levelRequired") ?? baseLevelRequired,
              )}
              onChange={(v) => set("gathering", "levelRequired", v)}
              min={1}
              max={99}
              step={1}
            />
          </OverridableField>
        )}
        {baseToolRequired && (
          <InfoRow label="Tool Required" value={baseToolRequired} />
        )}
        <OverridableField
          label="Cycle Ticks"
          isOverridden={isOvr("gathering", "baseCycleTicks")}
          onReset={() => reset("gathering", "baseCycleTicks")}
        >
          <DragNumberInput
            label=""
            value={Number(getSection("gathering", "baseCycleTicks") ?? 4)}
            onChange={(v) => set("gathering", "baseCycleTicks", v)}
            min={1}
            max={100}
            step={1}
            unit="ticks"
          />
        </OverridableField>
        <OverridableField
          label="Deplete Chance"
          isOverridden={isOvr("gathering", "depleteChance")}
          onReset={() => reset("gathering", "depleteChance")}
        >
          <DragNumberInput
            label=""
            value={Number(getSection("gathering", "depleteChance") ?? 0.1)}
            onChange={(v) => set("gathering", "depleteChance", v)}
            min={0}
            max={1}
            step={0.01}
          />
        </OverridableField>
        <OverridableField
          label="Respawn Ticks"
          isOverridden={isOvr("gathering", "respawnTicks")}
          onReset={() => reset("gathering", "respawnTicks")}
        >
          <DragNumberInput
            label=""
            value={Number(getSection("gathering", "respawnTicks") ?? 30)}
            onChange={(v) => set("gathering", "respawnTicks", v)}
            min={1}
            max={1000}
            step={1}
            unit="ticks"
          />
        </OverridableField>
      </PropertySection>

      {/* Model */}
      <PropertySection
        title="Model"
        persistKey="game-resource-model"
        defaultOpen={false}
      >
        <InfoRow
          label="Model"
          value={
            manifestRock?.modelPath ??
            manifestTree?.modelVariants?.[0] ??
            "default"
          }
        />
        <OverridableField
          label="Scale"
          isOverridden={isOvr("model", "scale")}
          onReset={() => reset("model", "scale")}
        >
          <DragNumberInput
            label=""
            value={Number(getSection("model", "scale") ?? 1)}
            onChange={(v) => set("model", "scale", v)}
            min={0.1}
            max={10}
            step={0.1}
          />
        </OverridableField>
      </PropertySection>

      {/* Transform */}
      {pos && (
        <PropertySection title="Transform" persistKey="game-resource-transform">
          <TransformSection position={pos} readOnly />
        </PropertySection>
      )}

      {/* Behavior Script */}
      <BehaviorScriptSection
        entityId={entityId}
        stateKey="resourceOverrides"
        stateRoot="manifestOverrides"
        entityData={entityData}
        entityCategory="gameResource"
      />
    </>
  );
}
