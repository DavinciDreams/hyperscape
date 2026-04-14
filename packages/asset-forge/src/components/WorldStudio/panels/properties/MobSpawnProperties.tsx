/**
 * MobSpawnProperties — Editor for PlacedMobSpawn entities with manifest integration
 *
 * Shows spawn zone settings and links to the mob's NPC manifest entry
 * for stats, drops, and combat information.
 */

import { Skull, Heart, Package, Sword } from "lucide-react";
import React, { useCallback, useMemo } from "react";

import type { PlacedMobSpawn } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import { ItemReference } from "../ItemPicker";
import {
  PropertySection,
  TextInput,
  NumberInput,
  PositionEditor,
  SliderInput,
  InfoRow,
} from "./PropertyControls";

interface Props {
  mobSpawn: PlacedMobSpawn;
}

export const MobSpawnProperties = React.memo(function MobSpawnProperties({
  mobSpawn,
}: Props) {
  const { actions, state } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<PlacedMobSpawn>) => {
      actions.updateMobSpawn(mobSpawn.id, updates);
    },
    [actions, mobSpawn.id],
  );

  // Look up mob in NPC manifest
  const manifestMob = useMemo(
    () => state.manifests.npcs.find((n) => n.id === mobSpawn.mobId),
    [state.manifests.npcs, mobSpawn.mobId],
  );

  const rawData = manifestMob?._raw;
  const stats = rawData?.stats as
    | {
        level?: number;
        health?: number;
        attack?: number;
        strength?: number;
        defense?: number;
      }
    | undefined;
  const combat = rawData?.combat as
    | { aggressive?: boolean; aggroRange?: number; attackSpeedTicks?: number }
    | undefined;
  const drops = rawData?.drops as
    | {
        always?: Array<{ itemId: string; chance: number }>;
        common?: Array<{ itemId: string; chance: number }>;
        rare?: Array<{ itemId: string; chance: number }>;
      }
    | undefined;

  return (
    <>
      <PropertySection title="Mob Spawn" icon={<Skull size={10} />}>
        <TextInput
          label="Name"
          value={mobSpawn.name}
          onChange={(name) => update({ name })}
        />
        <InfoRow label="Mob ID" value={mobSpawn.mobId} />
        {manifestMob && (
          <>
            <InfoRow label="Category" value={manifestMob.category} />
            <InfoRow
              label="Level Range"
              value={`${manifestMob.levelRange[0]}–${manifestMob.levelRange[1]}`}
            />
          </>
        )}
      </PropertySection>

      <PropertySection title="Spawn Settings">
        <SliderInput
          label="Spawn Radius"
          value={mobSpawn.spawnRadius}
          onChange={(spawnRadius) => update({ spawnRadius })}
          min={1}
          max={30}
          step={1}
          unit="m"
          hint="Radius from center where mobs can spawn"
        />
        <NumberInput
          label="Max Count"
          value={mobSpawn.maxCount}
          onChange={(maxCount) => update({ maxCount })}
          min={1}
          max={20}
        />
        <NumberInput
          label="Respawn Ticks"
          value={mobSpawn.respawnTicks}
          onChange={(respawnTicks) => update({ respawnTicks })}
          min={10}
          max={1000}
          step={10}
        />
      </PropertySection>

      <PropertySection title="Transform">
        <PositionEditor
          label="Position"
          position={mobSpawn.position}
          onChange={(position) => update({ position })}
        />
      </PropertySection>

      {/* Manifest: Stats */}
      {stats && (
        <PropertySection
          title="Mob Stats"
          icon={<Heart size={10} />}
          defaultOpen={false}
        >
          {stats.level != null && <InfoRow label="Level" value={stats.level} />}
          {stats.health != null && (
            <InfoRow label="Health" value={stats.health} />
          )}
          {stats.attack != null && (
            <InfoRow label="Attack" value={stats.attack} />
          )}
          {stats.strength != null && (
            <InfoRow label="Strength" value={stats.strength} />
          )}
          {stats.defense != null && (
            <InfoRow label="Defense" value={stats.defense} />
          )}
        </PropertySection>
      )}

      {/* Manifest: Combat */}
      {combat && (
        <PropertySection
          title="Combat"
          icon={<Sword size={10} />}
          defaultOpen={false}
        >
          {combat.aggressive != null && (
            <InfoRow
              label="Aggressive"
              value={combat.aggressive ? "Yes" : "No"}
            />
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
        </PropertySection>
      )}

      {/* Manifest: Drops */}
      {drops && (
        <PropertySection
          title="Drops"
          icon={<Package size={10} />}
          defaultOpen={false}
        >
          {(["always", "common", "rare"] as const).map((rarity) => {
            const items = drops[rarity];
            if (!items || items.length === 0) return null;
            return (
              <div key={rarity} className="mb-1">
                <div className="text-[10px] text-text-tertiary capitalize mb-0.5">
                  {rarity} ({items.length})
                </div>
                {items.slice(0, 5).map((drop, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1 pl-2 py-0.5"
                  >
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
        </PropertySection>
      )}

      {/* No manifest warning */}
      {!manifestMob && state.manifests.loaded && (
        <PropertySection title="Manifest">
          <div className="text-[10px] text-amber-400/80 italic">
            No manifest entry found for mob &quot;{mobSpawn.mobId}&quot;.
          </div>
        </PropertySection>
      )}
    </>
  );
});
