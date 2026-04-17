/**
 * NPCProperties — Editor for selected PlacedNPC with manifest data integration
 *
 * Shows placement data (position, rotation, context) and links to the NPC's
 * manifest entry for stats, drops, dialogue, and appearance data.
 */

import {
  User,
  Sword,
  Package,
  MessageSquare,
  Heart,
  Shield,
  Sparkles,
  Plus,
} from "lucide-react";
import React, { useCallback, useMemo } from "react";

import type { PlacedNPC } from "../../../WorldBuilder/types";
import type { NPCManifestOverride } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import { useAIGeneration } from "../../hooks/useAIGeneration";
import { ItemReference } from "../ItemPicker";
import {
  PropertySection,
  TextInput,
  PositionEditor,
  SliderInput,
  InfoRow,
} from "./PropertyControls";
import { StoreEditor } from "./StoreEditor";
import { BehaviorScriptSection } from "./BehaviorScriptSection";
import { DialogueEditor } from "./DialogueEditor";

interface Props {
  npc: PlacedNPC;
}

export const NPCProperties = React.memo(function NPCProperties({ npc }: Props) {
  const { actions, state } = useWorldStudio();
  const ai = useAIGeneration();

  const update = useCallback(
    (updates: Partial<PlacedNPC>) => {
      actions.updateNPC(npc.id, updates);
    },
    [actions, npc.id],
  );

  // Look up NPC in loaded manifest data
  const manifestNPC = useMemo(
    () => state.manifests.npcs.find((n) => n.id === npc.npcTypeId),
    [state.manifests.npcs, npc.npcTypeId],
  );

  // Override from state (keyed by manifest npcTypeId — shared across all
  // placements of this NPC type; consistent with GameNPCProperties)
  const override = state.manifestOverrides.npcOverrides.get(npc.npcTypeId);

  const setDialogueSection = useCallback(
    (value: NPCManifestOverride["dialogue"]) => {
      const existing =
        override ?? ({ entityId: npc.npcTypeId } as Record<string, unknown>);
      actions.setManifestOverride("npcOverrides", npc.npcTypeId, {
        ...existing,
        dialogue: value,
      });
    },
    [override, npc.npcTypeId, actions],
  );

  const resetDialogueSection = useCallback(() => {
    if (!override) return;
    const updated = { ...override } as Record<string, unknown>;
    delete updated.dialogue;
    const keys = Object.keys(updated).filter((k) => k !== "entityId");
    if (keys.length === 0) {
      actions.clearManifestOverride("npcOverrides", npc.npcTypeId);
    } else {
      actions.setManifestOverride("npcOverrides", npc.npcTypeId, updated);
    }
  }, [override, npc.npcTypeId, actions]);

  // Look up linked store
  const linkedStore = useMemo(
    () =>
      npc.storeId
        ? state.manifests.stores.find((s) => s.id === npc.storeId)
        : null,
    [state.manifests.stores, npc.storeId],
  );

  // Extract raw data for stats/drops if available
  const rawData = manifestNPC?._raw;
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
    | {
        attackable?: boolean;
        aggressive?: boolean;
        aggroRange?: number;
        attackSpeedTicks?: number;
        respawnTicks?: number;
      }
    | undefined;
  const drops = rawData?.drops as
    | {
        always?: Array<{ itemId: string; chance: number }>;
        common?: Array<{ itemId: string; chance: number }>;
        uncommon?: Array<{ itemId: string; chance: number }>;
        rare?: Array<{ itemId: string; chance: number }>;
        veryRare?: Array<{ itemId: string; chance: number }>;
      }
    | undefined;
  // Merged dialogue (override wins over base manifest)
  const mergedDialogue = useMemo(() => {
    if (override?.dialogue) return override.dialogue;
    return rawData?.dialogue as NPCManifestOverride["dialogue"] | undefined;
  }, [override?.dialogue, rawData?.dialogue]);

  return (
    <>
      <PropertySection title="NPC" icon={<User size={10} />}>
        <TextInput
          label="Name"
          value={npc.name}
          onChange={(name) => update({ name })}
        />
        <InfoRow label="Type ID" value={npc.npcTypeId} />
        <InfoRow
          label="Context"
          value={
            npc.parentContext.type === "world"
              ? "World"
              : npc.parentContext.type === "town"
                ? `Town: ${npc.parentContext.townId}`
                : `Building: ${npc.parentContext.buildingId}`
          }
        />
        {manifestNPC && (
          <>
            <InfoRow label="Category" value={manifestNPC.category} />
            <InfoRow
              label="Level Range"
              value={
                manifestNPC.levelRange
                  ? `${manifestNPC.levelRange[0]}–${manifestNPC.levelRange[1]}`
                  : undefined
              }
            />
            {manifestNPC.services?.enabled && (
              <InfoRow
                label="Services"
                value={manifestNPC.services.types.join(", ")}
              />
            )}
          </>
        )}
        {npc.storeId && <InfoRow label="Store ID" value={npc.storeId} />}
        {npc.dialogId && <InfoRow label="Dialog ID" value={npc.dialogId} />}
      </PropertySection>

      <PropertySection title="Transform">
        <PositionEditor
          label="Position"
          position={npc.position}
          onChange={(position) => update({ position })}
        />
        <SliderInput
          label="Rotation"
          value={Math.round((npc.rotation * 180) / Math.PI)}
          onChange={(deg) => update({ rotation: (deg * Math.PI) / 180 })}
          min={0}
          max={360}
          step={15}
          unit="°"
        />
      </PropertySection>

      {/* Manifest: Stats */}
      {stats && (
        <PropertySection
          title="Stats"
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
      {combat?.attackable && (
        <PropertySection
          title="Combat"
          icon={<Sword size={10} />}
          defaultOpen={false}
        >
          <InfoRow label="Attackable" value="Yes" />
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
          {combat.respawnTicks != null && (
            <InfoRow label="Respawn" value={`${combat.respawnTicks} ticks`} />
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
          {(["always", "common", "uncommon", "rare", "veryRare"] as const).map(
            (rarity) => {
              const items = drops[rarity];
              if (!items || items.length === 0) return null;
              return (
                <div key={rarity} className="mb-1">
                  <div className="text-[10px] text-text-tertiary capitalize mb-0.5">
                    {rarity === "veryRare" ? "Very Rare" : rarity} (
                    {items.length})
                  </div>
                  {items.map((drop, idx) => (
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
                </div>
              );
            },
          )}
        </PropertySection>
      )}

      {/* Dialogue — editable (routed through npcOverrides on the manifest type) */}
      {mergedDialogue ? (
        <DialogueEditor
          dialogue={mergedDialogue}
          isOverridden={override?.dialogue !== undefined}
          onUpdate={(d) => setDialogueSection(d)}
          onReset={resetDialogueSection}
          persistKey="npc-dialogue"
        />
      ) : (
        manifestNPC && (
          <PropertySection
            title="Dialogue"
            icon={<MessageSquare size={10} />}
            defaultOpen={false}
          >
            <button
              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] rounded border border-dashed border-border-primary text-text-tertiary hover:text-text-secondary hover:border-text-tertiary transition-colors"
              onClick={() =>
                setDialogueSection({
                  entryNodeId: "greeting",
                  nodes: [
                    {
                      id: "greeting",
                      text: "Hello, adventurer!",
                      responses: [],
                    },
                  ],
                })
              }
            >
              <Plus size={10} /> Create Dialogue
            </button>
          </PropertySection>
        )
      )}

      {/* Manifest: Linked Store (editable) */}
      {linkedStore && <StoreEditor store={linkedStore} />}

      {/* AI Generation */}
      <PropertySection
        title="AI Generation"
        icon={<Sparkles size={10} />}
        defaultOpen={false}
      >
        <div className="space-y-1.5">
          <button
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={ai.isGenerating}
            onClick={() => ai.generateDialogue(npc.npcTypeId)}
          >
            <Sparkles size={10} />
            {state.aiGeneration.status === "generating" &&
            state.aiGeneration.activeEntityId === npc.id
              ? "Generating..."
              : "Generate Dialogue"}
          </button>
          <button
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={ai.isGenerating || !mergedDialogue?.nodes?.length}
            onClick={() => ai.generateVoice(npc.npcTypeId)}
          >
            <Sparkles size={10} />
            Generate Voice Lines
          </button>
          {state.aiGeneration.status === "error" &&
            state.aiGeneration.activeEntityId === npc.id && (
              <div className="text-[10px] text-red-400/80 italic">
                {state.aiGeneration.error}
              </div>
            )}
        </div>
      </PropertySection>

      {/* Behavior Script */}
      <BehaviorScriptSection
        entityId={npc.id}
        stateKey="npcs"
        stateRoot="extendedLayers"
        entityData={{
          ...(npc as unknown as Record<string, unknown>),
          hasDialogueTree: !!(
            mergedDialogue?.nodes && mergedDialogue.nodes.length > 0
          ),
        }}
        entityCategory="npc"
        entityContext={{
          identifier: npc.npcTypeId,
          dialogue: mergedDialogue,
        }}
      />

      {/* No manifest data warning */}
      {!manifestNPC && state.manifests.loaded && (
        <PropertySection title="Manifest" icon={<Shield size={10} />}>
          <div className="text-[10px] text-amber-400/80 italic">
            No manifest entry found for NPC type &quot;{npc.npcTypeId}&quot;.
            This NPC will not have stats, drops, or dialogue in-game.
          </div>
        </PropertySection>
      )}
    </>
  );
});
