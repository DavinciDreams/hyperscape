/**
 * ResourceProperties — Editor for PlacedResource entities with manifest integration
 *
 * Shows resource placement data and links to gathering manifest for
 * level requirements, yields, respawn times, and examine text.
 */

import { Pickaxe } from "lucide-react";
import React, { useCallback, useMemo } from "react";

import type { PlacedResource } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  SelectInput,
  NumberInput,
  PositionEditor,
  SliderInput,
  InfoRow,
} from "./PropertyControls";

interface Props {
  resource: PlacedResource;
}

export function ResourceProperties({ resource }: Props) {
  const { actions, state } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<PlacedResource>) => {
      actions.updateResource(resource.id, updates);
    },
    [actions, resource.id],
  );

  // Look up resource in gathering manifests
  const manifestInfo = useMemo(() => {
    switch (resource.resourceType) {
      case "mining":
        return state.manifests.miningRocks.find(
          (r) => r.id === resource.resourceId,
        );
      case "woodcutting":
        return state.manifests.trees.find((t) => t.id === resource.resourceId);
      case "fishing":
        return state.manifests.fishingSpots.find(
          (f) => f.id === resource.resourceId,
        );
      default:
        return null;
    }
  }, [state.manifests, resource.resourceType, resource.resourceId]);

  return (
    <>
      <PropertySection title="Resource" icon={<Pickaxe size={10} />}>
        <TextInput
          label="Name"
          value={resource.name}
          onChange={(name) => update({ name })}
        />
        <InfoRow label="Resource ID" value={resource.resourceId} />
        <SelectInput
          label="Type"
          value={resource.resourceType}
          onChange={(resourceType) =>
            update({
              resourceType: resourceType as PlacedResource["resourceType"],
            })
          }
          options={[
            { value: "mining", label: "Mining" },
            { value: "woodcutting", label: "Woodcutting" },
            { value: "fishing", label: "Fishing" },
            { value: "farming", label: "Farming" },
          ]}
        />
        <NumberInput
          label="Model Variant"
          value={resource.modelVariant}
          onChange={(modelVariant) => update({ modelVariant })}
          min={0}
          max={10}
        />
      </PropertySection>

      {/* Manifest info */}
      {manifestInfo && (
        <PropertySection title="Manifest Data" defaultOpen={false}>
          <InfoRow label="Level Required" value={manifestInfo.levelRequired} />
          {"examine" in manifestInfo && (
            <InfoRow
              label="Examine"
              value={(manifestInfo as { examine: string }).examine}
            />
          )}
          {"type" in manifestInfo && (
            <InfoRow
              label="Sub-type"
              value={(manifestInfo as { type: string }).type}
            />
          )}
          {"modelPath" in manifestInfo && (
            <InfoRow
              label="Model"
              value={(manifestInfo as { modelPath: string }).modelPath}
            />
          )}
          {"modelVariants" in manifestInfo && (
            <InfoRow
              label="Model Variants"
              value={`${(manifestInfo as { modelVariants: string[] }).modelVariants.length} variants`}
            />
          )}
          {"toolRequired" in manifestInfo && (
            <InfoRow
              label="Tool Required"
              value={(manifestInfo as { toolRequired: string }).toolRequired}
            />
          )}
        </PropertySection>
      )}

      {/* No manifest warning */}
      {!manifestInfo && state.manifests.loaded && (
        <PropertySection title="Manifest">
          <div className="text-[10px] text-amber-400/80 italic">
            No manifest entry found for resource &quot;{resource.resourceId}
            &quot; ({resource.resourceType}).
          </div>
        </PropertySection>
      )}

      <PropertySection title="Transform">
        <PositionEditor
          label="Position"
          position={resource.position}
          onChange={(position) => update({ position })}
        />
        <SliderInput
          label="Rotation"
          value={Math.round((resource.rotation * 180) / Math.PI)}
          onChange={(deg) => update({ rotation: (deg * Math.PI) / 180 })}
          min={0}
          max={360}
          step={15}
          unit="°"
        />
      </PropertySection>
    </>
  );
}
