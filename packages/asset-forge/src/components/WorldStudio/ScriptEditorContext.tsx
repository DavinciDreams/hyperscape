/**
 * ScriptEditorContext — Provides a callback to open the ScriptEditorPanel
 * from anywhere in the WorldStudio component tree (e.g. SchemaPropertyEditor).
 */

import React, { createContext, useContext } from "react";
import type { ScriptGraph } from "../../scripting/types";

export type ScriptEditorStateRoot =
  | "extendedLayers"
  | "audioLayers"
  | "manifestOverrides";

/**
 * Supplementary context for the script editor to render domain-aware UIs
 * (e.g. dropdowns populated from an NPC's dialogue tree).
 */
export interface ScriptEditorEntityContext {
  /** Human-friendly identifier for the entity (e.g. NPC type id). Surfaces in UIs. */
  identifier?: string;
  /**
   * The NPC dialogue tree attached to this entity's type, if any.
   * Used to populate Response ID autocomplete on `trigger/onDialogueResponse`.
   */
  dialogue?: {
    entryNodeId: string;
    nodes: Array<{
      id: string;
      text: string;
      responses?: Array<{ text: string; nextNodeId?: string }>;
    }>;
  };
}

export type OpenScriptEditorFn = (
  entityId: string,
  stateKey: string,
  stateRoot: ScriptEditorStateRoot,
  tracksSource: boolean | undefined,
  fieldKey: string,
  graph: ScriptGraph | undefined,
  entityContext?: ScriptEditorEntityContext,
) => void;

const ScriptEditorCtx = createContext<OpenScriptEditorFn | null>(null);

export function ScriptEditorProvider({
  onOpen,
  children,
}: {
  onOpen: OpenScriptEditorFn;
  children: React.ReactNode;
}) {
  return (
    <ScriptEditorCtx.Provider value={onOpen}>
      {children}
    </ScriptEditorCtx.Provider>
  );
}

export function useOpenScriptEditor(): OpenScriptEditorFn | null {
  return useContext(ScriptEditorCtx);
}
