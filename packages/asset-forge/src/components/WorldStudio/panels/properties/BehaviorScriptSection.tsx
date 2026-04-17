/**
 * BehaviorScriptSection — Reusable behavior script button for any entity property panel.
 *
 * Renders a "Create Script" / "Edit Script (N nodes)" button inside a PropertySection.
 * Uses ScriptEditorContext to open the visual scripting editor.
 */

import { Workflow } from "lucide-react";
import React, { useMemo } from "react";

import {
  useOpenScriptEditor,
  type ScriptEditorEntityContext,
  type ScriptEditorStateRoot,
} from "../../ScriptEditorContext";
import type { ScriptGraph } from "../../../../scripting/types";
import {
  generateDefaultGraph,
  type EntityCategory,
} from "../../../../scripting/defaultGraphs";
import { PropertySection } from "./PropertyControls";

interface BehaviorScriptSectionProps {
  /** Entity ID */
  entityId: string;
  /** State key for dispatching updates (e.g. "mobSpawns", "npcs", "mobSpawnOverrides") */
  stateKey: string;
  /** State root: "extendedLayers", "audioLayers", or "manifestOverrides" */
  stateRoot: ScriptEditorStateRoot;
  /** Whether this entity tracks source */
  tracksSource?: boolean;
  /** Field key where the graph is stored on the entity */
  fieldKey?: string;
  /** The entity's data object (used to read existing graph) */
  entityData: Record<string, unknown>;
  /** Entity category for auto-generating a default graph when none exists */
  entityCategory?: EntityCategory;
  /** Description text below button */
  description?: string;
  /** Whether section is open by default */
  defaultOpen?: boolean;
  /** Domain context forwarded to the script editor (e.g. dialogue tree for autocomplete). */
  entityContext?: ScriptEditorEntityContext;
}

export function BehaviorScriptSection({
  entityId,
  stateKey,
  stateRoot,
  tracksSource,
  fieldKey = "behaviorGraph",
  entityData,
  entityCategory,
  description = "Visual event graph for entity behavior triggers",
  defaultOpen = false,
  entityContext,
}: BehaviorScriptSectionProps) {
  const openScriptEditor = useOpenScriptEditor();

  const existingGraph = entityData[fieldKey] as ScriptGraph | undefined;

  // Auto-generate a default graph from entity data when none exists
  const defaultGraph = useMemo(() => {
    if (existingGraph || !entityCategory) return undefined;
    return generateDefaultGraph(entityCategory, entityData);
  }, [existingGraph, entityCategory, entityData]);

  const graph = existingGraph ?? defaultGraph;
  const nodeCount = graph?.nodes?.length ?? 0;
  const isDefault = !existingGraph && !!defaultGraph;

  return (
    <PropertySection
      title="Behavior Script"
      icon={<Workflow size={10} />}
      defaultOpen={defaultOpen}
    >
      <button
        onClick={() =>
          openScriptEditor?.(
            entityId,
            stateKey,
            stateRoot,
            tracksSource,
            fieldKey,
            graph,
            entityContext,
          )
        }
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          background: "rgba(99, 102, 241, 0.15)",
          border: "1px solid rgba(99, 102, 241, 0.3)",
          color: "#a5b4fc",
          cursor: "pointer",
          transition: "all 150ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(99, 102, 241, 0.25)";
          e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(99, 102, 241, 0.15)";
          e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.3)";
        }}
      >
        <Workflow size={14} />
        {nodeCount > 0
          ? isDefault
            ? `Edit Default Script (${nodeCount} nodes)`
            : `Edit Script (${nodeCount} node${nodeCount !== 1 ? "s" : ""})`
          : "Create Script"}
      </button>
      <p style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
        {description}
      </p>
    </PropertySection>
  );
}
