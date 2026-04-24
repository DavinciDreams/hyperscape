/**
 * MobSpawn custom sections — migrated from the bespoke MobSpawnProperties
 * component. Each section reads the NPC manifest keyed by `mobId`.
 *
 * Widgets exported:
 *   - MobSpawnIdentitySection    ("MobSpawnIdentity")
 *   - MobSpawnStatsSection       ("MobSpawnStats")
 *   - MobSpawnCombatSection      ("MobSpawnCombat")
 *   - MobSpawnDropsSection       ("MobSpawnDrops")
 *   - MobSpawnManifestMissingSection ("MobSpawnManifestMissing")
 */

import React, { useMemo } from "react";
import type { CustomSectionProps } from "./customSectionRegistry";
import { useWorldStudio } from "../../components/WorldStudio/WorldStudioContext";
import { InfoRow } from "../../components/WorldStudio/panels/properties/PropertyControls";
import { ItemReference } from "../../components/WorldStudio/panels/ItemPicker";

interface MobRawData {
  stats?: {
    level?: number;
    health?: number;
    attack?: number;
    strength?: number;
    defense?: number;
  };
  combat?: {
    aggressive?: boolean;
    aggroRange?: number;
    attackSpeedTicks?: number;
  };
  drops?: {
    always?: Array<{ itemId: string; chance: number }>;
    common?: Array<{ itemId: string; chance: number }>;
    rare?: Array<{ itemId: string; chance: number }>;
  };
}

function useMobManifest(entityData: Record<string, unknown>) {
  const { state } = useWorldStudio();
  const mobId = entityData.mobId as string | undefined;
  const manifestMob = useMemo(
    () =>
      mobId ? state.manifests.npcs.find((n) => n.id === mobId) : undefined,
    [state.manifests.npcs, mobId],
  );
  const rawData = (manifestMob?._raw ?? undefined) as MobRawData | undefined;
  return { mobId, manifestMob, rawData };
}

export function MobSpawnIdentitySection({ entityData }: CustomSectionProps) {
  const { manifestMob } = useMobManifest(entityData);
  if (!manifestMob) {
    return (
      <div className="text-[10px] text-text-tertiary italic">
        No manifest entry for this mob.
      </div>
    );
  }
  return (
    <>
      <InfoRow label="Category" value={manifestMob.category} />
      <InfoRow
        label="Level Range"
        value={`${manifestMob.levelRange[0]}–${manifestMob.levelRange[1]}`}
      />
    </>
  );
}

export function MobSpawnStatsSection({ entityData }: CustomSectionProps) {
  const { rawData } = useMobManifest(entityData);
  const stats = rawData?.stats;
  if (!stats) {
    return (
      <div className="text-[10px] text-text-tertiary italic">
        No stats in manifest.
      </div>
    );
  }
  return (
    <>
      {stats.level != null && <InfoRow label="Level" value={stats.level} />}
      {stats.health != null && <InfoRow label="Health" value={stats.health} />}
      {stats.attack != null && <InfoRow label="Attack" value={stats.attack} />}
      {stats.strength != null && (
        <InfoRow label="Strength" value={stats.strength} />
      )}
      {stats.defense != null && (
        <InfoRow label="Defense" value={stats.defense} />
      )}
    </>
  );
}

export function MobSpawnCombatSection({ entityData }: CustomSectionProps) {
  const { rawData } = useMobManifest(entityData);
  const combat = rawData?.combat;
  if (!combat) {
    return (
      <div className="text-[10px] text-text-tertiary italic">
        No combat info in manifest.
      </div>
    );
  }
  return (
    <>
      {combat.aggressive != null && (
        <InfoRow label="Aggressive" value={combat.aggressive ? "Yes" : "No"} />
      )}
      {combat.aggroRange != null && (
        <InfoRow label="Aggro Range" value={combat.aggroRange} />
      )}
      {combat.attackSpeedTicks != null && (
        <InfoRow
          label="Attack Speed"
          value={`${combat.attackSpeedTicks} ticks`}
        />
      )}
    </>
  );
}

export function MobSpawnDropsSection({ entityData }: CustomSectionProps) {
  const { rawData } = useMobManifest(entityData);
  const drops = rawData?.drops;
  if (!drops) {
    return (
      <div className="text-[10px] text-text-tertiary italic">
        No drops in manifest.
      </div>
    );
  }
  return (
    <>
      {(["always", "common", "rare"] as const).map((rarity) => {
        const items = drops[rarity];
        if (!items || items.length === 0) return null;
        return (
          <div key={rarity} className="mb-1">
            <div className="text-[10px] text-text-tertiary capitalize mb-0.5">
              {rarity} ({items.length})
            </div>
            {items.slice(0, 5).map((drop, idx) => (
              <div key={idx} className="flex items-center gap-1 pl-2 py-0.5">
                <ItemReference itemId={drop.itemId} />
                <span className="text-[10px] text-text-tertiary">
                  {Math.round(drop.chance * 100)}%
                </span>
              </div>
            ))}
            {items.length > 5 && (
              <div className="text-[10px] text-text-tertiary italic pl-2">
                +{items.length - 5} more
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function MobSpawnManifestMissingSection({
  entityData,
}: CustomSectionProps) {
  const { state } = useWorldStudio();
  const { mobId, manifestMob } = useMobManifest(entityData);
  if (manifestMob || !state.manifests.loaded) return null;
  return (
    <div className="text-[10px] text-amber-400/80 italic">
      No manifest entry found for mob &quot;{mobId}&quot;.
    </div>
  );
}
