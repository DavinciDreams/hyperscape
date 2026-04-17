/**
 * TeleportProperties — Editor for PlacedTeleport entities
 *
 * Includes connection builder for linking teleport nodes into a network.
 */

import { Link, Unlink, MapPin } from "lucide-react";
import React, { useCallback, useMemo } from "react";

import type { PlacedTeleport } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  NumberInput,
  PositionEditor,
  InfoRow,
} from "./PropertyControls";
import { BehaviorScriptSection } from "./BehaviorScriptSection";

interface Props {
  teleport: PlacedTeleport;
}

export function TeleportProperties({ teleport }: Props) {
  const { state, actions } = useWorldStudio();
  const allTeleports = state.extendedLayers.teleports;

  const update = useCallback(
    (updates: Partial<PlacedTeleport>) => {
      actions.updateTeleport(teleport.id, updates);
    },
    [actions, teleport.id],
  );

  // Available teleports that are not already connected and not this one
  const availableTeleports = useMemo(
    () =>
      allTeleports.filter(
        (t) => t.id !== teleport.id && !teleport.connections.includes(t.id),
      ),
    [allTeleports, teleport.id, teleport.connections],
  );

  // Resolve connected teleport names
  const connectedTeleports = useMemo(
    () =>
      teleport.connections.map((connId) => {
        const found = allTeleports.find((t) => t.id === connId);
        return { id: connId, name: found?.name ?? connId };
      }),
    [teleport.connections, allTeleports],
  );

  const addConnection = useCallback(
    (targetId: string) => {
      // Bidirectional: add connection on both sides
      const newConnections = [...teleport.connections, targetId];
      update({ connections: newConnections });

      // Also add reverse connection on the target
      const target = allTeleports.find((t) => t.id === targetId);
      if (target && !target.connections.includes(teleport.id)) {
        actions.updateTeleport(targetId, {
          connections: [...target.connections, teleport.id],
        });
      }
    },
    [teleport, allTeleports, actions, update],
  );

  const removeConnection = useCallback(
    (targetId: string) => {
      // Bidirectional: remove from both sides
      update({
        connections: teleport.connections.filter((id) => id !== targetId),
      });

      const target = allTeleports.find((t) => t.id === targetId);
      if (target) {
        actions.updateTeleport(targetId, {
          connections: target.connections.filter((id) => id !== teleport.id),
        });
      }
    },
    [teleport, allTeleports, actions, update],
  );

  const selectTeleport = useCallback(
    (id: string) => {
      const t = allTeleports.find((tp) => tp.id === id);
      if (t) {
        actions.setSelection({
          type: "teleport",
          id,
          path: [{ type: "teleport", id, name: t.name }],
        });
      }
    },
    [allTeleports, actions],
  );

  return (
    <>
      <PropertySection title="Teleport">
        <TextInput
          label="Name"
          value={teleport.name}
          onChange={(name) => update({ name })}
        />
        <NumberInput
          label="Cost"
          value={teleport.cost}
          onChange={(cost) => update({ cost })}
          min={0}
          max={10000}
          unit="gp"
        />
      </PropertySection>

      <PropertySection title="Requirements">
        <TextInput
          label="Quest ID"
          value={teleport.requirements.questId ?? ""}
          onChange={(questId) =>
            update({
              requirements: {
                ...teleport.requirements,
                questId: questId || undefined,
              },
            })
          }
          placeholder="Optional quest requirement"
        />
        <NumberInput
          label="Min Level"
          value={teleport.requirements.minLevel ?? 0}
          onChange={(minLevel) =>
            update({
              requirements: {
                ...teleport.requirements,
                minLevel: minLevel || undefined,
              },
            })
          }
          min={0}
          max={99}
        />
        <TextInput
          label="Item ID"
          value={teleport.requirements.itemId ?? ""}
          onChange={(itemId) =>
            update({
              requirements: {
                ...teleport.requirements,
                itemId: itemId || undefined,
              },
            })
          }
          placeholder="Optional item requirement"
        />
      </PropertySection>

      <PropertySection title="Connections" badge={teleport.connections.length}>
        {/* Connected teleports */}
        {connectedTeleports.length > 0 ? (
          <div className="space-y-1">
            {connectedTeleports.map(({ id, name }) => (
              <div key={id} className="flex items-center gap-1.5 group">
                <Link size={10} className="text-violet-400 flex-shrink-0" />
                <button
                  className="flex-1 text-left text-[10px] text-text-secondary hover:text-primary truncate"
                  onClick={() => selectTeleport(id)}
                  title={`Select "${name}"`}
                >
                  {name}
                </button>
                <button
                  className="text-text-tertiary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                  onClick={() => removeConnection(id)}
                  title="Disconnect"
                >
                  <Unlink size={10} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-text-tertiary italic">
            No connections yet.
          </div>
        )}

        {/* Add connection picker */}
        {availableTeleports.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-border-primary">
            <div className="text-[9px] text-text-tertiary uppercase tracking-wider mb-1">
              Link to...
            </div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {availableTeleports.map((t) => (
                <button
                  key={t.id}
                  className="w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                  onClick={() => addConnection(t.id)}
                  title={`Connect to "${t.name}"`}
                >
                  <MapPin size={10} className="text-violet-300 flex-shrink-0" />
                  <span className="truncate">{t.name}</span>
                  <InfoRow
                    label=""
                    value={`(${Math.round(t.position.x)}, ${Math.round(t.position.z)})`}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {allTeleports.length <= 1 && (
          <div className="text-[10px] text-text-tertiary italic mt-1">
            Place more teleport nodes to create a network.
          </div>
        )}
      </PropertySection>

      <PropertySection title="Transform">
        <PositionEditor
          label="Position"
          position={teleport.position}
          onChange={(position) => update({ position })}
        />
      </PropertySection>

      {/* Behavior Script */}
      <BehaviorScriptSection
        entityId={teleport.id}
        stateKey="teleports"
        stateRoot="extendedLayers"
        entityData={teleport as unknown as Record<string, unknown>}
      />
    </>
  );
}
