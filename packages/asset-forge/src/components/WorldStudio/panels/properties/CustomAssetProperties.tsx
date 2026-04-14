/**
 * CustomAssetProperties — Editor for imported/generated custom assets
 *
 * Edits name, scale, rotation, and displays asset info.
 * Phase 9.1 of WORLD_STUDIO_MASTER_PLAN
 */

import { Package } from "lucide-react";
import React, { useCallback } from "react";

import type { PlacedCustomAsset } from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  PropertySection,
  TextInput,
  NumberInput,
  SliderInput,
  InfoRow,
} from "./PropertyControls";

interface Props {
  asset: PlacedCustomAsset;
}

export function CustomAssetProperties({ asset }: Props) {
  const { actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<PlacedCustomAsset>) => {
      actions.updateCustomAsset(asset.id, updates);
    },
    [actions, asset.id],
  );

  return (
    <>
      <PropertySection title="Custom Asset" icon={<Package size={10} />}>
        <TextInput
          label="Name"
          value={asset.name}
          onChange={(name) => update({ name })}
        />
        <InfoRow label="Asset ID" value={asset.assetId} />
        {asset.modelPath && (
          <InfoRow
            label="Model"
            value={asset.modelPath.split("/").pop() ?? ""}
          />
        )}
      </PropertySection>

      <PropertySection title="Transform">
        <NumberInput
          label="X"
          value={Math.round(asset.position.x * 10) / 10}
          onChange={(x) => update({ position: { ...asset.position, x } })}
          step={0.5}
        />
        <NumberInput
          label="Y"
          value={Math.round(asset.position.y * 10) / 10}
          onChange={(y) => update({ position: { ...asset.position, y } })}
          step={0.5}
        />
        <NumberInput
          label="Z"
          value={Math.round(asset.position.z * 10) / 10}
          onChange={(z) => update({ position: { ...asset.position, z } })}
          step={0.5}
        />
        <SliderInput
          label="Rotation"
          value={Math.round((asset.rotation * 180) / Math.PI)}
          onChange={(deg) => update({ rotation: (deg * Math.PI) / 180 })}
          min={0}
          max={360}
          step={5}
          unit="°"
        />
        <SliderInput
          label="Scale"
          value={asset.scale}
          onChange={(scale) => update({ scale })}
          min={0.1}
          max={10}
          step={0.1}
        />
      </PropertySection>
    </>
  );
}
