/**
 * GameStationProperties — Full manifest editor for game world station entities
 *
 * Shows station data from the base manifest with inline editing.
 * Edits create override deltas stored in manifestOverrides.
 */

import { Settings, Package } from "lucide-react";
import React, { useCallback, useMemo } from "react";

import type { StationManifestOverride } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  InfoRow,
  DragNumberInput,
  TextInput,
  Toggle,
  OverridableField,
} from "./PropertyControls";
import { TransformSection } from "./TransformSection";
import { BehaviorScriptSection } from "./BehaviorScriptSection";

interface Props {
  entityData: Record<string, unknown>;
}

export function GameStationProperties({ entityData }: Props) {
  const { state, actions } = useWorldStudio();
  const entityId = String(entityData.stationType ?? entityData.entityId);

  // Base manifest lookup
  const manifestStation = useMemo(
    () => state.manifests.stations.find((s) => s.type === entityId),
    [state.manifests.stations, entityId],
  );

  // Override from state
  const override = state.manifestOverrides.stationOverrides.get(entityId);

  // Helper: get merged value (override wins over manifest)
  const getVal = useCallback(
    <K extends keyof StationManifestOverride>(field: K): unknown => {
      if (override?.[field] !== undefined) return override[field];
      if (!manifestStation) return undefined;
      const map: Record<string, unknown> = {
        name: manifestStation.name,
        examine: manifestStation.examine,
      };
      return map[field as string];
    },
    [override, manifestStation],
  );

  const isOvr = useCallback(
    (field: string): boolean => {
      return override?.[field as keyof StationManifestOverride] !== undefined;
    },
    [override],
  );

  const set = useCallback(
    (field: string, value: unknown) => {
      const existing = override ?? ({ entityId } as Record<string, unknown>);
      actions.setManifestOverride("stationOverrides", entityId, {
        ...existing,
        [field]: value,
      });
    },
    [override, entityId, actions],
  );

  const reset = useCallback(
    (field: string) => {
      if (!override) return;
      const updated = { ...override } as Record<string, unknown>;
      delete updated[field];
      const keys = Object.keys(updated).filter((k) => k !== "entityId");
      if (keys.length === 0) {
        actions.clearManifestOverride("stationOverrides", entityId);
      } else {
        actions.setManifestOverride("stationOverrides", entityId, updated);
      }
    },
    [override, entityId, actions],
  );

  const pos = entityData.position as
    | { x: number; y: number; z: number }
    | undefined;

  if (!manifestStation && !override) {
    return (
      <>
        <PropertySection
          title="Station (Game World)"
          icon={<Settings size={10} />}
        >
          <InfoRow
            label="Name"
            value={String(entityData.displayName ?? entityData.entityId)}
          />
          <InfoRow label="Station Type" value={entityId} />
          <InfoRow label="Entity ID" value={String(entityData.entityId)} />
          {entityData.bankId ? (
            <InfoRow label="Bank ID" value={String(entityData.bankId)} />
          ) : null}
          {entityData.runeType ? (
            <InfoRow label="Rune Type" value={String(entityData.runeType)} />
          ) : null}
        </PropertySection>
        {pos && (
          <PropertySection title="Transform">
            <TransformSection position={pos} readOnly />
          </PropertySection>
        )}
        <BehaviorScriptSection
          entityId={entityId}
          stateKey="stationOverrides"
          stateRoot="manifestOverrides"
          entityData={entityData}
          entityCategory="gameStation"
        />
      </>
    );
  }

  return (
    <>
      {/* Identity */}
      <PropertySection
        title="Station Identity"
        icon={<Settings size={10} />}
        persistKey="game-station-identity"
      >
        <OverridableField
          label="Name"
          isOverridden={isOvr("name")}
          onReset={() => reset("name")}
        >
          <TextInput
            label=""
            value={String(getVal("name") ?? "")}
            onChange={(v) => set("name", v)}
          />
        </OverridableField>
        <InfoRow label="Station Type" value={entityId} />
        <InfoRow label="Entity ID" value={String(entityData.entityId)} />
        <OverridableField
          label="Examine"
          isOverridden={isOvr("examine")}
          onReset={() => reset("examine")}
        >
          <TextInput
            label=""
            value={String(getVal("examine") ?? "")}
            onChange={(v) => set("examine", v)}
          />
        </OverridableField>
      </PropertySection>

      {/* Model */}
      <PropertySection
        title="Model"
        persistKey="game-station-model"
        defaultOpen={false}
      >
        <InfoRow label="Model Path" value={manifestStation?.model ?? "none"} />
        <OverridableField
          label="Scale"
          isOverridden={isOvr("modelScale")}
          onReset={() => reset("modelScale")}
        >
          <DragNumberInput
            label=""
            value={Number(getVal("modelScale") ?? 1)}
            onChange={(v) => set("modelScale", v)}
            min={0.1}
            max={10}
            step={0.1}
          />
        </OverridableField>
        <OverridableField
          label="Y Offset"
          isOverridden={isOvr("modelYOffset")}
          onReset={() => reset("modelYOffset")}
        >
          <DragNumberInput
            label=""
            value={Number(getVal("modelYOffset") ?? 0)}
            onChange={(v) => set("modelYOffset", v)}
            min={-10}
            max={10}
            step={0.05}
            unit="m"
          />
        </OverridableField>
      </PropertySection>

      {/* Ground Flatten */}
      <PropertySection
        title="Ground Flatten"
        persistKey="game-station-flatten"
        defaultOpen={false}
      >
        <OverridableField
          label="Flatten Ground"
          isOverridden={isOvr("flattenGround")}
          onReset={() => reset("flattenGround")}
        >
          <Toggle
            label=""
            value={Boolean(getVal("flattenGround") ?? false)}
            onChange={(v) => set("flattenGround", v)}
          />
        </OverridableField>
        <OverridableField
          label="Padding"
          isOverridden={isOvr("flattenPadding")}
          onReset={() => reset("flattenPadding")}
        >
          <DragNumberInput
            label=""
            value={Number(getVal("flattenPadding") ?? 2)}
            onChange={(v) => set("flattenPadding", v)}
            min={0}
            max={20}
            step={0.5}
            unit="m"
          />
        </OverridableField>
        <OverridableField
          label="Blend Radius"
          isOverridden={isOvr("flattenBlendRadius")}
          onReset={() => reset("flattenBlendRadius")}
        >
          <DragNumberInput
            label=""
            value={Number(getVal("flattenBlendRadius") ?? 4)}
            onChange={(v) => set("flattenBlendRadius", v)}
            min={0}
            max={30}
            step={0.5}
            unit="m"
          />
        </OverridableField>
      </PropertySection>

      {/* Linked info (read-only) */}
      {entityData.bankId != null || entityData.runeType != null ? (
        <PropertySection
          title="Linked"
          icon={<Package size={10} />}
          defaultOpen={false}
        >
          {entityData.bankId != null ? (
            <InfoRow label="Bank ID" value={String(entityData.bankId)} />
          ) : null}
          {entityData.runeType != null ? (
            <InfoRow label="Rune Type" value={String(entityData.runeType)} />
          ) : null}
        </PropertySection>
      ) : null}

      {/* Transform */}
      {pos && (
        <PropertySection title="Transform" persistKey="game-station-transform">
          <TransformSection position={pos} readOnly />
        </PropertySection>
      )}

      {/* Behavior Script */}
      <BehaviorScriptSection
        entityId={entityId}
        stateKey="stationOverrides"
        stateRoot="manifestOverrides"
        entityData={entityData}
        entityCategory="gameStation"
      />
    </>
  );
}
