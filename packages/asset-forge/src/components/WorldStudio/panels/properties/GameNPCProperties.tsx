/**
 * GameNPCProperties — Full manifest editor for game world NPC entities
 *
 * Shows all NPC data from the base manifest with inline editing.
 * Edits create override deltas stored in manifestOverrides (staging layer).
 * Base manifests remain read-only.
 */

import {
  User,
  Sword,
  Heart,
  Footprints,
  Eye,
  Package,
  MessageSquare,
  Mic,
} from "lucide-react";
import React, { useCallback, useMemo } from "react";

import type { NPCManifestOverride, ManifestItem } from "../../types";
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
import { GameStoreEditor } from "./GameStoreEditor";

interface Props {
  entityData: Record<string, unknown>;
}

/** Deeply get a nested value from an object by dot-separated path */
function deepGet(
  obj: Record<string, unknown> | undefined,
  path: string,
): unknown {
  if (!obj) return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

export function GameNPCProperties({ entityData }: Props) {
  const { state, actions } = useWorldStudio();
  const entityId = String(entityData.entityId ?? entityData.npcType ?? "");

  // Base manifest lookup
  const manifestNPC = useMemo(
    () => state.manifests.npcs.find((n) => n.id === entityId),
    [state.manifests.npcs, entityId],
  );
  const raw = manifestNPC?._raw as Record<string, unknown> | undefined;

  // Override from state
  const override = state.manifestOverrides.npcOverrides.get(entityId);

  // Helper: get merged value (override section.field wins over raw section.field)
  const get = useCallback(
    (section: string, field: string): unknown => {
      const ovrSection = override?.[section as keyof NPCManifestOverride];
      if (ovrSection != null && typeof ovrSection === "object") {
        const val = (ovrSection as Record<string, unknown>)[field];
        if (val !== undefined) return val;
      }
      return deepGet(raw, `${section}.${field}`);
    },
    [override, raw],
  );

  // Helper: check if a field is overridden
  const isOvr = useCallback(
    (section: string, field: string): boolean => {
      const ovrSection = override?.[section as keyof NPCManifestOverride];
      if (ovrSection != null && typeof ovrSection === "object") {
        return (ovrSection as Record<string, unknown>)[field] !== undefined;
      }
      return false;
    },
    [override],
  );

  // Helper: set override field
  const set = useCallback(
    (section: string, field: string, value: unknown) => {
      const existing = override ?? ({ entityId } as Record<string, unknown>);
      const sectionData = {
        ...((existing[section as keyof typeof existing] as Record<
          string,
          unknown
        >) ?? {}),
        [field]: value,
      };
      actions.setManifestOverride("npcOverrides", entityId, {
        ...existing,
        [section]: sectionData,
      });
    },
    [override, entityId, actions],
  );

  // Helper: reset one field
  const reset = useCallback(
    (section: string, field: string) => {
      if (!override) return;
      const sectionData = {
        ...((override[section as keyof NPCManifestOverride] as Record<
          string,
          unknown
        >) ?? {}),
      };
      delete sectionData[field];
      // If section is now empty, remove it
      const hasFields = Object.keys(sectionData).length > 0;
      const updated = { ...override } as Record<string, unknown>;
      if (hasFields) {
        updated[section] = sectionData;
      } else {
        delete updated[section];
      }
      // If entire override is just entityId, clear it
      const keys = Object.keys(updated).filter((k) => k !== "entityId");
      if (keys.length === 0) {
        actions.clearManifestOverride("npcOverrides", entityId);
      } else {
        actions.setManifestOverride("npcOverrides", entityId, updated);
      }
    },
    [override, entityId, actions],
  );

  const pos = entityData.position as
    | { x: number; y: number; z: number }
    | undefined;
  const drops = raw?.drops as Record<string, unknown> | undefined;

  // Get store info
  const storeId = entityData.storeId as string | undefined;

  if (!manifestNPC && !raw) {
    // Fallback: show basic info if no manifest found
    return (
      <>
        <PropertySection title="NPC (Game World)" icon={<User size={10} />}>
          <InfoRow
            label="Name"
            value={String(entityData.displayName ?? entityData.entityId)}
          />
          <InfoRow label="NPC Type" value={entityId} />
          <InfoRow label="Entity ID" value={String(entityData.entityId)} />
        </PropertySection>
        {pos && (
          <PropertySection title="Transform">
            <TransformSection position={pos} readOnly />
          </PropertySection>
        )}
      </>
    );
  }

  return (
    <>
      {/* Identity */}
      <PropertySection
        title="NPC Identity"
        icon={<User size={10} />}
        persistKey="game-npc-identity"
      >
        <OverridableField
          label="Name"
          isOverridden={isOvr("identity", "name")}
          onReset={() => reset("identity", "name")}
        >
          <TextInput
            label=""
            value={String(
              get("identity", "name") ?? raw?.name ?? manifestNPC?.name ?? "",
            )}
            onChange={(v) => set("identity", "name", v)}
          />
        </OverridableField>
        <InfoRow label="ID" value={entityId} />
        <InfoRow
          label="Category"
          value={String(raw?.category ?? manifestNPC?.category ?? "")}
        />
        {raw?.faction != null ? (
          <InfoRow label="Faction" value={String(raw.faction)} />
        ) : null}
        <InfoRow
          label="Level Range"
          value={
            manifestNPC?.levelRange
              ? `${manifestNPC.levelRange[0]}–${manifestNPC.levelRange[1]}`
              : undefined
          }
        />
        {raw?.description != null ? (
          <OverridableField
            label="Description"
            isOverridden={isOvr("identity", "description")}
            onReset={() => reset("identity", "description")}
          >
            <TextInput
              label=""
              value={String(
                get("identity", "description") ?? raw.description ?? "",
              )}
              onChange={(v) => set("identity", "description", v)}
            />
          </OverridableField>
        ) : null}
      </PropertySection>

      {/* Stats */}
      {raw?.stats != null ? (
        <PropertySection
          title="Stats"
          icon={<Heart size={10} />}
          persistKey="game-npc-stats"
        >
          {(
            [
              ["level", "Level", 1, 200],
              ["health", "Health", 1, 10000],
              ["attack", "Attack", 1, 200],
              ["strength", "Strength", 1, 200],
              ["defense", "Defense", 1, 200],
              ["defenseBonus", "Defense Bonus", 0, 200],
              ["ranged", "Ranged", 1, 200],
              ["magic", "Magic", 1, 200],
            ] as const
          ).map(([field, label, min, max]) => {
            const val = get("stats", field);
            if (val == null) return null;
            return (
              <OverridableField
                key={field}
                label={label}
                isOverridden={isOvr("stats", field)}
                onReset={() => reset("stats", field)}
              >
                <DragNumberInput
                  label=""
                  value={Number(val)}
                  onChange={(v) => set("stats", field, v)}
                  min={min}
                  max={max}
                  step={1}
                />
              </OverridableField>
            );
          })}
        </PropertySection>
      ) : null}

      {/* Combat */}
      {raw?.combat != null ? (
        <PropertySection
          title="Combat"
          icon={<Sword size={10} />}
          persistKey="game-npc-combat"
        >
          <OverridableField
            label="Attackable"
            isOverridden={isOvr("combat", "attackable")}
            onReset={() => reset("combat", "attackable")}
          >
            <Toggle
              label=""
              value={Boolean(get("combat", "attackable") ?? false)}
              onChange={(v) => set("combat", "attackable", v)}
            />
          </OverridableField>
          <OverridableField
            label="Aggressive"
            isOverridden={isOvr("combat", "aggressive")}
            onReset={() => reset("combat", "aggressive")}
          >
            <Toggle
              label=""
              value={Boolean(get("combat", "aggressive") ?? false)}
              onChange={(v) => set("combat", "aggressive", v)}
            />
          </OverridableField>
          <OverridableField
            label="Retaliates"
            isOverridden={isOvr("combat", "retaliates")}
            onReset={() => reset("combat", "retaliates")}
          >
            <Toggle
              label=""
              value={Boolean(get("combat", "retaliates") ?? false)}
              onChange={(v) => set("combat", "retaliates", v)}
            />
          </OverridableField>
          {(
            [
              ["aggroRange", "Aggro Range", 0, 50, 1, "tiles"],
              ["combatRange", "Combat Range", 1, 20, 1, "tiles"],
              ["leashRange", "Leash Range", 1, 100, 1, "tiles"],
              ["attackSpeedTicks", "Attack Speed", 1, 20, 1, "ticks"],
              ["respawnTicks", "Respawn Time", 1, 1000, 1, "ticks"],
            ] as const
          ).map(([field, label, min, max, step, unit]) => {
            const val = get("combat", field);
            if (val == null) return null;
            return (
              <OverridableField
                key={field}
                label={label}
                isOverridden={isOvr("combat", field)}
                onReset={() => reset("combat", field)}
              >
                <DragNumberInput
                  label=""
                  value={Number(val)}
                  onChange={(v) => set("combat", field, v)}
                  min={min}
                  max={max}
                  step={step}
                  unit={unit}
                />
              </OverridableField>
            );
          })}
        </PropertySection>
      ) : null}

      {/* Movement */}
      {raw?.movement != null ? (
        <PropertySection
          title="Movement"
          icon={<Footprints size={10} />}
          persistKey="game-npc-movement"
        >
          <InfoRow
            label="Type"
            value={String(deepGet(raw, "movement.type") ?? "none")}
          />
          <OverridableField
            label="Speed"
            isOverridden={isOvr("movement", "speed")}
            onReset={() => reset("movement", "speed")}
          >
            <DragNumberInput
              label=""
              value={Number(get("movement", "speed") ?? 1)}
              onChange={(v) => set("movement", "speed", v)}
              min={0}
              max={20}
              step={0.1}
            />
          </OverridableField>
          <OverridableField
            label="Wander Radius"
            isOverridden={isOvr("movement", "wanderRadius")}
            onReset={() => reset("movement", "wanderRadius")}
          >
            <DragNumberInput
              label=""
              value={Number(get("movement", "wanderRadius") ?? 0)}
              onChange={(v) => set("movement", "wanderRadius", v)}
              min={0}
              max={100}
              step={1}
              unit="tiles"
            />
          </OverridableField>
        </PropertySection>
      ) : null}

      {/* Appearance */}
      <PropertySection
        title="Appearance"
        icon={<Eye size={10} />}
        persistKey="game-npc-appearance"
        defaultOpen={false}
      >
        <InfoRow
          label="Model"
          value={String(
            deepGet(raw, "appearance.modelPath") ??
              manifestNPC?.appearance?.modelPath ??
              "none",
          )}
        />
        <OverridableField
          label="Scale"
          isOverridden={isOvr("appearance", "scale")}
          onReset={() => reset("appearance", "scale")}
        >
          <DragNumberInput
            label=""
            value={Number(
              get("appearance", "scale") ?? manifestNPC?.appearance?.scale ?? 1,
            )}
            onChange={(v) => set("appearance", "scale", v)}
            min={0.1}
            max={10}
            step={0.1}
          />
        </OverridableField>
      </PropertySection>

      {/* Drops with resolved item names */}
      {drops && (
        <DropTableSection drops={drops} items={state.manifests.items} />
      )}

      {/* Linked Store — full editable store editor */}
      {storeId && <GameStoreEditor storeId={storeId} />}

      {/* Transform */}
      {pos && (
        <PropertySection title="Transform" persistKey="game-npc-transform">
          <TransformSection position={pos} readOnly />
        </PropertySection>
      )}

      {/* Actions */}
      <PropertySection
        title="Actions"
        persistKey="game-npc-actions"
        defaultOpen={false}
      >
        <div className="space-y-1">
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-bg-tertiary hover:bg-primary/10 hover:text-primary text-text-secondary rounded-md border border-border-primary transition-colors w-full"
            onClick={() => console.log("[Action] Edit Dialogue for", entityId)}
          >
            <MessageSquare size={12} className="flex-shrink-0" />
            <span>Edit Dialogue</span>
          </button>
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-bg-tertiary hover:bg-primary/10 hover:text-primary text-text-secondary rounded-md border border-border-primary transition-colors w-full"
            onClick={() => console.log("[Action] Generate Voice for", entityId)}
          >
            <Mic size={12} className="flex-shrink-0" />
            <span>Generate Voice</span>
          </button>
        </div>
      </PropertySection>
    </>
  );
}

// ============== Drop Table Section ==============

const TIER_LABELS: Record<string, string> = {
  always: "Always",
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  veryRare: "Very Rare",
};

const TIER_COLORS: Record<string, string> = {
  always: "text-text-secondary",
  common: "text-text-secondary",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  veryRare: "text-purple-400",
};

function DropTableSection({
  drops,
  items,
}: {
  drops: Record<string, unknown>;
  items: ManifestItem[];
}) {
  const resolveItemName = useCallback(
    (itemId: string): string => {
      const item = items.find((i) => i.id === itemId);
      return item?.name ?? itemId.replace(/_/g, " ");
    },
    [items],
  );

  return (
    <PropertySection
      title="Drops"
      icon={<Package size={10} />}
      persistKey="game-npc-drops"
      defaultOpen={false}
    >
      {/* Default drop */}
      {drops.defaultDrop != null &&
        (() => {
          const dd = drops.defaultDrop as Record<string, unknown>;
          const itemId = String(dd.itemId ?? "");
          return (
            <div className="py-1 border-b border-border-primary/30">
              <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider mb-0.5">
                Default
              </div>
              <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                <span>{resolveItemName(itemId)}</span>
                {dd.quantity != null && (
                  <span className="text-text-tertiary">
                    ×{String(dd.quantity)}
                  </span>
                )}
              </div>
            </div>
          );
        })()}

      {/* Tiered drops */}
      {(["always", "common", "uncommon", "rare", "veryRare"] as const).map(
        (tier) => {
          const tierItems = drops[tier] as
            | Array<Record<string, unknown>>
            | undefined;
          if (!tierItems || tierItems.length === 0) return null;
          return (
            <div
              key={tier}
              className="py-1 border-b border-border-primary/30 last:border-0"
            >
              <div
                className={`text-[9px] font-semibold uppercase tracking-wider mb-0.5 ${TIER_COLORS[tier] ?? "text-text-tertiary"}`}
              >
                {TIER_LABELS[tier] ?? tier} ({tierItems.length})
              </div>
              {tierItems.map((drop, idx) => {
                const itemId = String(drop.itemId ?? "");
                const qty = drop.quantity ?? drop.minQuantity;
                const maxQty = drop.maxQuantity;
                const chance = drop.chance as number | undefined;
                return (
                  <div
                    key={`${tier}-${idx}`}
                    className="flex items-center justify-between text-[10px] py-0.5"
                  >
                    <span className="text-text-secondary truncate">
                      {resolveItemName(itemId)}
                    </span>
                    <span className="text-text-tertiary flex-shrink-0 ml-1">
                      {qty != null && maxQty != null && maxQty !== qty
                        ? `${qty}–${maxQty}`
                        : qty != null
                          ? `×${qty}`
                          : ""}
                      {chance != null && (
                        <span className="ml-1">
                          {(chance * 100).toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        },
      )}
    </PropertySection>
  );
}
