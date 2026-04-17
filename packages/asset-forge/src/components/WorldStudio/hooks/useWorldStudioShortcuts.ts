/**
 * useWorldStudioShortcuts — Keyboard shortcut handler for World Studio
 *
 * Shortcuts:
 * - Ctrl+Z → Undo (command history first, then context)
 * - Ctrl+Shift+Z / Ctrl+Y → Redo
 * - Ctrl+S → Save
 * - Ctrl+C → Copy selected entity/entities to clipboard
 * - Ctrl+V → Paste from clipboard with +2m XZ offset
 * - Ctrl+D → Duplicate selected entity
 * - Ctrl+A → Select all entities
 * - V/P/B/G/M/N → Tool modes
 * - 1/2/3 → Camera modes (orbit, flythrough, player)
 * - Delete/Backspace → Remove selected (single or multi)
 * - Escape → Cancel placement → clear selection → deactivate tool (cascading)
 *
 * Note: W/E/R (transform modes) and F (focus) are handled in ViewportContainer
 * because they need access to sceneRefs and gizmo state.
 */

import { useEffect, useCallback } from "react";

import {
  commandHistory,
  BatchPasteCommand,
  type BatchPasteEntry,
} from "../../../editor/commands";
import type { StudioToolMode } from "../WorldStudioContext";
import { useWorldStudio } from "../WorldStudioContext";
import {
  executeDuplicate,
  executeDelete,
  findEntityData,
} from "../utils/entityActions";
import {
  useClipboardStore,
  type ClipboardEntry,
} from "../../../editor/stores/useClipboardStore";
import { useSelectionStore } from "../../../editor/stores/useSelectionStore";

const TOOL_KEYS: Record<string, StudioToolMode> = {
  v: "select",
  p: "place",
  b: "brush",
  z: "zonePaint",
  g: "procgen",
  n: "path",
};

const CAMERA_KEYS: Record<string, "orbit" | "flythrough" | "player"> = {
  "1": "orbit",
  "2": "flythrough",
  "3": "player",
};

export function useWorldStudioShortcuts() {
  const { actions, computed, state, registry, dispatch } = useWorldStudio();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // ---- Modifier shortcuts ----

      // Ctrl+Alt+Z → Undo terrain only (subsystem undo)
      if (isMod && e.altKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        commandHistory.undoChannel("terrain");
        return;
      }

      // Ctrl+Alt+Shift+Z → Redo terrain only
      if (isMod && e.altKey && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        commandHistory.redoChannel("terrain");
        return;
      }

      // Ctrl+Z → Undo (most recent, any channel)
      if (isMod && e.key === "z" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (commandHistory.canUndo()) commandHistory.undo();
        else if (computed.canUndo) actions.undo();
        return;
      }

      // Ctrl+Shift+Z → Redo
      if (isMod && e.key === "z" && e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (commandHistory.canRedo()) commandHistory.redo();
        else if (computed.canRedo) actions.redo();
        return;
      }

      // Ctrl+Y → Redo (Windows)
      if (isMod && e.key === "y") {
        e.preventDefault();
        if (commandHistory.canRedo()) commandHistory.redo();
        else if (computed.canRedo) actions.redo();
        return;
      }

      // Ctrl+S → Save
      if (isMod && e.key === "s") {
        e.preventDefault();
        if (computed.hasUnsavedChanges && !state.persistence.isSaving) {
          actions.saveStart();
        }
        return;
      }

      // Ctrl+D → Duplicate selected entity
      if (isMod && e.key === "d") {
        e.preventDefault();
        const selection = state.builder.editing.selection;
        if (selection) {
          executeDuplicate(
            state,
            actions,
            selection.type,
            selection.id,
            registry,
            dispatch,
          );
        }
        return;
      }

      // Ctrl+C → Copy selected entity/entities to clipboard
      if (isMod && e.key === "c" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const multiSel = useSelectionStore.getState().multiSelection;
        const singleSel = state.builder.editing.selection;

        const selections: Array<{ type: string; id: string }> =
          multiSel.length > 0
            ? multiSel
            : singleSel
              ? [{ type: singleSel.type, id: singleSel.id }]
              : [];

        if (selections.length === 0) return;

        // Compute centroid for multi-entity offset
        let cx = 0,
          cy = 0,
          cz = 0,
          posCount = 0;
        const collected: Array<{
          type: string;
          data: Record<string, unknown>;
        }> = [];

        for (const sel of selections) {
          const data = findEntityData(state, sel.type, sel.id);
          if (!data) continue;
          collected.push({ type: sel.type, data: structuredClone(data) });
          const pos = data.position as
            | { x?: number; y?: number; z?: number }
            | undefined;
          if (pos && typeof pos.x === "number" && typeof pos.z === "number") {
            cx += pos.x;
            cy += pos.y ?? 0;
            cz += pos.z;
            posCount++;
          }
        }

        if (collected.length === 0) return;

        if (posCount > 0) {
          cx /= posCount;
          cy /= posCount;
          cz /= posCount;
        }

        const entries: ClipboardEntry[] = collected.map((c) => {
          const pos = c.data.position as
            | { x?: number; y?: number; z?: number }
            | undefined;
          return {
            entityType: c.type,
            data: c.data,
            offset: {
              x: pos && typeof pos.x === "number" ? pos.x - cx : 0,
              y: pos && typeof pos.y === "number" ? pos.y - cy : 0,
              z: pos && typeof pos.z === "number" ? pos.z - cz : 0,
            },
          };
        });

        useClipboardStore.getState().copy(entries);
        return;
      }

      // Ctrl+V → Paste from clipboard with +2m XZ offset
      if (isMod && e.key === "v" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const buffer = useClipboardStore.getState().paste();
        if (!buffer || buffer.length === 0) return;

        // Determine paste anchor: use current selection position or centroid origin
        const singleSel = state.builder.editing.selection;
        let anchorX = 0,
          anchorZ = 0;
        if (singleSel) {
          const selData = findEntityData(state, singleSel.type, singleSel.id);
          const selPos = selData?.position as
            | { x?: number; z?: number }
            | undefined;
          if (
            selPos &&
            typeof selPos.x === "number" &&
            typeof selPos.z === "number"
          ) {
            anchorX = selPos.x;
            anchorZ = selPos.z;
          }
        } else if (buffer.length === 1) {
          const pos = buffer[0].data.position as
            | { x?: number; z?: number }
            | undefined;
          if (pos && typeof pos.x === "number" && typeof pos.z === "number") {
            anchorX = pos.x;
            anchorZ = pos.z;
          }
        }

        const pasteEntries: BatchPasteEntry[] = buffer.map((entry) => {
          const newId = `${entry.entityType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const newData = {
            ...structuredClone(entry.data),
            id: newId,
            position: {
              x: anchorX + entry.offset.x + 2,
              y:
                ((entry.data.position as { y?: number })?.y ?? 0) +
                entry.offset.y,
              z: anchorZ + entry.offset.z + 2,
            },
          };

          // Resolve the correct add/remove callbacks
          const schema = registry?.getBySelectionType(entry.entityType);

          const onPlace = (data: Record<string, unknown>) => {
            if (schema) {
              dispatch({
                type: "ENTITY_ADD",
                stateKey: schema.storage.stateKey,
                stateRoot: schema.storage.stateRoot,
                entity: data as { id: string } & Record<string, unknown>,
              });
            } else {
              const actionsObj = actions as unknown as Record<
                string,
                (data: unknown) => void
              >;
              const addName = `add${entry.entityType.charAt(0).toUpperCase()}${entry.entityType.slice(1)}`;
              actionsObj[addName]?.(data);
            }
          };

          const onRemove = (id: string) => {
            if (schema) {
              dispatch({
                type: "ENTITY_REMOVE",
                stateKey: schema.storage.stateKey,
                stateRoot: schema.storage.stateRoot,
                id,
              });
            } else {
              const actionsObj = actions as unknown as Record<
                string,
                (id: string) => void
              >;
              const removeName = `remove${entry.entityType.charAt(0).toUpperCase()}${entry.entityType.slice(1)}`;
              actionsObj[removeName]?.(id);
            }
          };

          return {
            entityId: newId,
            entityType: entry.entityType,
            entityData: newData,
            onPlace,
            onRemove,
          };
        });

        commandHistory.execute(new BatchPasteCommand(pasteEntries));
        return;
      }

      // Ctrl+A → Select all entities
      if (isMod && e.key === "a" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const { addToMultiSelection } = useSelectionStore.getState();
        const ext = state.extendedLayers;
        const audio = state.audioLayers;

        // Collect from extendedLayers arrays
        for (const [key, value] of Object.entries(ext)) {
          if (Array.isArray(value)) {
            for (const entity of value as Array<{ id: string }>) {
              if (entity.id) addToMultiSelection({ type: key, id: entity.id });
            }
          }
        }

        // Collect from audioLayers arrays
        for (const [key, value] of Object.entries(audio)) {
          if (Array.isArray(value)) {
            for (const entity of value as Array<{ id: string }>) {
              if (entity.id) addToMultiSelection({ type: key, id: entity.id });
            }
          }
        }

        // Collect from world layers (npcs, quests, bosses)
        const world = state.builder.editing.world;
        if (world?.layers) {
          for (const npc of world.layers.npcs) {
            addToMultiSelection({
              type: "npc",
              id: (npc as { id: string }).id,
            });
          }
          for (const quest of world.layers.quests) {
            addToMultiSelection({
              type: "quest",
              id: (quest as { id: string }).id,
            });
          }
          for (const boss of world.layers.bosses) {
            addToMultiSelection({
              type: "boss",
              id: (boss as { id: string }).id,
            });
          }
        }
        return;
      }

      // ---- Non-modifier shortcuts ----
      if (!isMod && !e.altKey && !e.shiftKey) {
        // Brush sub-type shortcuts (T/G when brush is active)
        if (state.tools.activeTool === "brush") {
          const key = e.key.toLowerCase();
          if (key === "t") {
            e.preventDefault();
            actions.setBrushSettings({ brushType: "terrain" });
            return;
          }
          if (key === "g") {
            e.preventDefault();
            actions.setBrushSettings({ brushType: "vegetation" });
            return;
          }
        }

        // Tool mode shortcuts
        const tool = TOOL_KEYS[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          actions.setTool(tool);
          return;
        }

        // Camera mode shortcuts
        const camera = CAMERA_KEYS[e.key];
        if (camera) {
          e.preventDefault();
          actions.setCameraMode(camera);
          return;
        }

        // Delete / Backspace → Remove selection
        if (e.key === "Delete" || e.key === "Backspace") {
          const selection = state.builder.editing.selection;
          if (selection) {
            e.preventDefault();
            executeDelete(
              state,
              actions,
              selection.type,
              selection.id,
              registry,
              dispatch,
            );
          }
          return;
        }

        // Escape → cascading: cancel placement → clear selection → switch to select tool
        if (e.key === "Escape") {
          if (state.tools.activePlacement) {
            actions.cancelPlacement();
          } else if (state.builder.editing.selection) {
            actions.setSelection(null);
          } else if (state.tools.activeTool !== "select") {
            actions.setTool("select");
          }
          return;
        }
      }
    },
    [actions, computed, state, registry, dispatch],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
