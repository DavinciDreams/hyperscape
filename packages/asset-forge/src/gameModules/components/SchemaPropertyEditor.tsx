/**
 * SchemaPropertyEditor — Auto-generates a property editor from an EntityTypeSchema.
 *
 * Groups fields by section, handles conditional visibility, and dispatches
 * generic ENTITY_UPDATE actions via the World Studio context.
 */

import { Workflow } from "lucide-react";
import React, { useCallback } from "react";
import type { EntityTypeSchema, FieldSchema } from "../GameModule";
import {
  PropertySection,
  TextInput,
  NumberInput,
  SliderInput,
  SelectInput,
  PositionEditor,
  Toggle,
  InfoRow,
} from "../../components/WorldStudio/panels/properties/PropertyControls";
import { useWorldStudio } from "../../components/WorldStudio/WorldStudioContext";
import { useOpenScriptEditor } from "../../components/WorldStudio/ScriptEditorContext";
import type { ScriptGraph } from "../../scripting/types";

interface SchemaPropertyEditorProps {
  schema: EntityTypeSchema;
  entityId: string;
  entityData: Record<string, unknown>;
}

export function SchemaPropertyEditor({
  schema,
  entityId,
  entityData,
}: SchemaPropertyEditorProps) {
  const { dispatch } = useWorldStudio();
  const openScriptEditor = useOpenScriptEditor();

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      dispatch({
        type: "ENTITY_UPDATE",
        stateKey: schema.storage.stateKey,
        stateRoot: schema.storage.stateRoot,
        id: entityId,
        updates: { [key]: value },
        trackSource: schema.tracksSource,
      });
    },
    [
      dispatch,
      schema.storage.stateKey,
      schema.storage.stateRoot,
      schema.tracksSource,
      entityId,
    ],
  );

  // Group fields by section, filtering by visibility conditions
  const sections = new Map<string, FieldSchema[]>();
  for (const field of schema.fields) {
    if (field.visibleWhen) {
      const gate = entityData[field.visibleWhen.field];
      if (
        field.visibleWhen.equals !== undefined &&
        gate !== field.visibleWhen.equals
      ) {
        continue;
      }
      if (
        field.visibleWhen.notEquals !== undefined &&
        gate === field.visibleWhen.notEquals
      ) {
        continue;
      }
    }
    const arr = sections.get(field.section);
    if (arr) {
      arr.push(field);
    } else {
      sections.set(field.section, [field]);
    }
  }

  return (
    <>
      {Array.from(sections.entries()).map(([sectionName, fields]) => (
        <PropertySection key={sectionName} title={sectionName}>
          {fields.map((field) => (
            <SchemaField
              key={field.key}
              field={field}
              value={entityData[field.key]}
              onChange={(v: unknown) => handleChange(field.key, v)}
              onOpenScriptEditor={
                field.type === "scriptGraph" && openScriptEditor
                  ? (fk, graph) =>
                      openScriptEditor(
                        entityId,
                        schema.storage.stateKey,
                        schema.storage.stateRoot ?? "extendedLayers",
                        schema.tracksSource,
                        fk,
                        graph,
                      )
                  : undefined
              }
            />
          ))}
        </PropertySection>
      ))}
    </>
  );
}

// ============== FIELD RENDERER ==============

interface SchemaFieldProps {
  field: FieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  onOpenScriptEditor?: (
    fieldKey: string,
    graph: ScriptGraph | undefined,
  ) => void;
}

function SchemaField({
  field,
  value,
  onChange,
  onOpenScriptEditor,
}: SchemaFieldProps) {
  if (field.readOnly) {
    return <InfoRow label={field.label} value={String(value ?? "")} />;
  }

  switch (field.type) {
    case "scriptGraph": {
      const graph = value as ScriptGraph | undefined;
      const nodeCount = graph?.nodes?.length ?? 0;
      return (
        <div className="space-y-1">
          <label className="text-[11px] text-text-secondary font-medium">
            {field.label}
          </label>
          <button
            onClick={() => onOpenScriptEditor?.(field.key, graph)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-500/50 transition-colors"
          >
            <Workflow size={14} />
            {nodeCount > 0
              ? `Edit Script (${nodeCount} node${nodeCount !== 1 ? "s" : ""})`
              : "Create Script"}
          </button>
          {field.description && (
            <p className="text-[10px] text-text-tertiary">
              {field.description}
            </p>
          )}
        </div>
      );
    }

    case "string":
    case "entityId":
      return (
        <TextInput
          label={field.label}
          value={String(value ?? "")}
          onChange={onChange as (v: string) => void}
        />
      );

    case "number":
      return (
        <NumberInput
          label={field.label}
          value={Number(value ?? field.default ?? 0)}
          onChange={onChange as (v: number) => void}
          min={field.config?.min}
          max={field.config?.max}
          step={field.config?.step}
          unit={field.config?.unit}
        />
      );

    case "slider":
      return (
        <SliderInput
          label={field.label}
          value={Number(value ?? field.default ?? 0)}
          onChange={onChange as (v: number) => void}
          min={field.config?.min ?? 0}
          max={field.config?.max ?? 100}
          step={field.config?.step ?? 1}
          unit={field.config?.unit}
        />
      );

    case "boolean":
      return (
        <Toggle
          label={field.label}
          value={Boolean(value)}
          onChange={onChange as (v: boolean) => void}
        />
      );

    case "select":
      return (
        <SelectInput
          label={field.label}
          value={String(value ?? "")}
          onChange={onChange as (v: string) => void}
          options={field.config?.options ?? []}
        />
      );

    case "position":
      return (
        <PositionEditor
          label={field.label}
          position={
            (value as { x: number; y: number; z: number }) ?? {
              x: 0,
              y: 0,
              z: 0,
            }
          }
          onChange={
            onChange as (v: { x: number; y: number; z: number }) => void
          }
        />
      );

    case "rotation": {
      const deg = Math.round(((Number(value) || 0) * 180) / Math.PI);
      return (
        <SliderInput
          label={field.label}
          value={deg}
          onChange={(d: number) => onChange((d * Math.PI) / 180)}
          min={0}
          max={360}
          step={15}
          unit="deg"
        />
      );
    }

    case "color":
    case "tags":
    case "json":
    default:
      return <InfoRow label={field.label} value={String(value ?? "")} />;
  }
}
