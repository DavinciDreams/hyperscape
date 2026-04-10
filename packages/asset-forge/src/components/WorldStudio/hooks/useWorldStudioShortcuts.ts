/**
 * useWorldStudioShortcuts — Keyboard shortcut handler for World Studio
 *
 * Shortcuts:
 * - Ctrl+Z → Undo (command history first, then context)
 * - Ctrl+Shift+Z / Ctrl+Y → Redo
 * - Ctrl+S → Save
 * - Ctrl+D → Duplicate selected entity
 * - V/P/B/G/M/N → Tool modes
 * - 1/2/3 → Camera modes (orbit, flythrough, player)
 * - Delete/Backspace → Remove selected (single or multi)
 * - Escape → Cancel placement → clear selection → deactivate tool (cascading)
 * - Ctrl+A → Select all (future)
 *
 * Note: W/E/R (transform modes) and F (focus) are handled in ViewportContainer
 * because they need access to sceneRefs and gizmo state.
 */

import { useEffect, useCallback } from "react";

import { commandHistory } from "../../../editor/commands";
import type { StudioToolMode } from "../WorldStudioContext";
import { useWorldStudio } from "../WorldStudioContext";
import { executeDuplicate, executeDelete } from "../utils/entityActions";

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
  const { actions, computed, state } = useWorldStudio();

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
          executeDuplicate(state, actions, selection.type, selection.id);
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
            executeDelete(state, actions, selection.type, selection.id);
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
    [actions, computed, state],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
