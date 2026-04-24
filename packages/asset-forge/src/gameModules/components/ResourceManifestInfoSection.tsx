/**
 * ResourceManifestInfoSection — Read-only custom section that looks up
 * a PlacedResource's matching entry in the gathering manifest (miningRocks,
 * trees, or fishingSpots) and displays its level requirement, examine text,
 * sub-type, model, and tool-required fields.
 *
 * Registered under the widget ID "ResourceManifestInfo" and referenced from
 * HyperiaModule's `resource` entity-type `customSections`.
 */

import React, { useMemo } from "react";
import type { CustomSectionProps } from "./customSectionRegistry";
import { useWorldStudio } from "../../components/WorldStudio/WorldStudioContext";
import { InfoRow } from "../../components/WorldStudio/panels/properties/PropertyControls";

interface ManifestEntry {
  id?: string;
  levelRequired?: number;
  examine?: string;
  type?: string;
  modelPath?: string;
  modelVariants?: string[];
  toolRequired?: string;
}

export function ResourceManifestInfoSection({
  entityData,
}: CustomSectionProps) {
  const { state } = useWorldStudio();
  const resourceId = entityData.resourceId as string | undefined;
  const resourceType = entityData.resourceType as string | undefined;

  const manifestInfo = useMemo<ManifestEntry | null>(() => {
    if (!resourceId) return null;
    switch (resourceType) {
      case "mining":
        return (
          state.manifests.miningRocks.find(
            (r) => (r as ManifestEntry).id === resourceId,
          ) ?? null
        );
      case "woodcutting":
        return (
          state.manifests.trees.find(
            (t) => (t as ManifestEntry).id === resourceId,
          ) ?? null
        );
      case "fishing":
        return (
          state.manifests.fishingSpots.find(
            (f) => (f as ManifestEntry).id === resourceId,
          ) ?? null
        );
      default:
        return null;
    }
  }, [state.manifests, resourceType, resourceId]);

  if (!manifestInfo) {
    if (state.manifests.loaded) {
      return (
        <div className="text-[10px] text-amber-400/80 italic">
          No manifest entry found for resource &quot;{resourceId}&quot; (
          {resourceType}).
        </div>
      );
    }
    return (
      <div className="text-[10px] text-text-tertiary italic">
        Loading manifests…
      </div>
    );
  }

  return (
    <>
      {manifestInfo.levelRequired !== undefined && (
        <InfoRow label="Level Required" value={manifestInfo.levelRequired} />
      )}
      {manifestInfo.examine !== undefined && (
        <InfoRow label="Examine" value={manifestInfo.examine} />
      )}
      {manifestInfo.type !== undefined && (
        <InfoRow label="Sub-type" value={manifestInfo.type} />
      )}
      {manifestInfo.modelPath !== undefined && (
        <InfoRow label="Model" value={manifestInfo.modelPath} />
      )}
      {manifestInfo.modelVariants !== undefined && (
        <InfoRow
          label="Model Variants"
          value={`${manifestInfo.modelVariants.length} variants`}
        />
      )}
      {manifestInfo.toolRequired !== undefined && (
        <InfoRow label="Tool Required" value={manifestInfo.toolRequired} />
      )}
    </>
  );
}
