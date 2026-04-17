/**
 * GameMobSpawnProperties — Spawn instance config only
 *
 * Shows spawn-specific settings (radius, max count, position).
 * The mob entity itself (stats, combat, drops) is edited via
 * the parent mob node which routes to GameNPCProperties.
 */

import { Target, User } from "lucide-react";
import React, { useCallback, useMemo } from "react";

import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  InfoRow,
  DragNumberInput,
  OverridableField,
} from "./PropertyControls";
import { TransformSection } from "./TransformSection";
import { BehaviorScriptSection } from "./BehaviorScriptSection";

interface Props {
  entityData: Record<string, unknown>;
}

export function GameMobSpawnProperties({ entityData }: Props) {
  const { state, actions } = useWorldStudio();
  const entityId = String(entityData.entityId);

  // Override from state
  const override = state.manifestOverrides.mobSpawnOverrides.get(entityId);

  const isOvr = useCallback(
    (field: string): boolean => {
      return override?.[field as keyof typeof override] !== undefined;
    },
    [override],
  );

  const set = useCallback(
    (field: string, value: unknown) => {
      const existing = override ?? ({ entityId } as Record<string, unknown>);
      actions.setManifestOverride("mobSpawnOverrides", entityId, {
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
        actions.clearManifestOverride("mobSpawnOverrides", entityId);
      } else {
        actions.setManifestOverride("mobSpawnOverrides", entityId, updated);
      }
    },
    [override, entityId, actions],
  );

  const pos = entityData.position as
    | { x: number; y: number; z: number }
    | undefined;
  const baseSpawnRadius = Number(entityData.spawnRadius ?? 10);
  const baseMaxCount = Number(entityData.maxCount ?? 3);

  // Look up linked mob NPC for display info
  const linkedNPC = useMemo(
    () => state.manifests.npcs.find((n) => n.id === entityId),
    [state.manifests.npcs, entityId],
  );
  const npcOverride = state.manifestOverrides.npcOverrides.get(entityId);

  return (
    <>
      {/* Spawn Config */}
      <PropertySection
        title="Spawn Instance"
        icon={<Target size={10} />}
        persistKey="game-mobspawn-config"
      >
        <InfoRow label="Mob ID" value={entityId} />
        <InfoRow
          label="Name"
          value={String(entityData.displayName ?? entityId)}
        />
        <OverridableField
          label="Spawn Radius"
          isOverridden={isOvr("spawnRadius")}
          onReset={() => reset("spawnRadius")}
        >
          <DragNumberInput
            label=""
            value={Number(override?.spawnRadius ?? baseSpawnRadius)}
            onChange={(v) => set("spawnRadius", v)}
            min={1}
            max={100}
            step={1}
            unit="m"
          />
        </OverridableField>
        <OverridableField
          label="Max Count"
          isOverridden={isOvr("maxCount")}
          onReset={() => reset("maxCount")}
        >
          <DragNumberInput
            label=""
            value={Number(override?.maxCount ?? baseMaxCount)}
            onChange={(v) => set("maxCount", v)}
            min={1}
            max={50}
            step={1}
          />
        </OverridableField>
      </PropertySection>

      {/* Linked Mob summary (read-only, edit via parent node) */}
      {linkedNPC && (
        <PropertySection
          title="Linked Mob"
          icon={<User size={10} />}
          persistKey="game-mobspawn-linked"
          defaultOpen={false}
        >
          <InfoRow label="Name" value={linkedNPC.name} />
          <InfoRow label="Category" value={linkedNPC.category} />
          <InfoRow
            label="Level Range"
            value={
              linkedNPC.levelRange
                ? `${linkedNPC.levelRange[0]}–${linkedNPC.levelRange[1]}`
                : undefined
            }
          />
          {npcOverride && (
            <div className="mt-1 px-1">
              <span className="text-[9px] text-primary/60">
                {"\u25CF"} Mob has overrides
              </span>
            </div>
          )}
          <div className="mt-1 px-1">
            <span className="text-[9px] text-text-tertiary italic">
              Select the mob entity to edit stats, combat & drops
            </span>
          </div>
        </PropertySection>
      )}

      {/* Transform */}
      {pos && (
        <PropertySection title="Transform" persistKey="game-mobspawn-transform">
          <TransformSection position={pos} readOnly />
        </PropertySection>
      )}

      {/* Behavior Script */}
      <BehaviorScriptSection
        entityId={entityId}
        stateKey="mobSpawnOverrides"
        stateRoot="manifestOverrides"
        entityData={{
          ...entityData,
          level: (linkedNPC?._raw as { stats?: { level?: number } } | undefined)
            ?.stats?.level,
        }}
        entityCategory="gameMobSpawn"
      />
    </>
  );
}
