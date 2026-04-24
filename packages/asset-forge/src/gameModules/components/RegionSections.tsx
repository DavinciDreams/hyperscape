/**
 * Region custom section — wraps the bespoke RegionProperties component
 * to adapt it to the CustomSectionProps interface. This lets the region
 * entity route through SchemaPropertyEditor without rewriting the
 * procgen/spawn-rule/mob-table UI into individual field widgets.
 *
 * Widgets exported:
 *   - RegionFullEditorSection ("RegionFullEditor")
 */

import React from "react";

import type { CustomSectionProps } from "./customSectionRegistry";
import { useWorldStudio } from "../../components/WorldStudio/WorldStudioContext";
import { RegionProperties } from "../../components/WorldStudio/panels/properties/RegionProperties";

export function RegionFullEditorSection({ entityId }: CustomSectionProps) {
  const { state } = useWorldStudio();
  const region = state.extendedLayers.regions.find((r) => r.id === entityId);
  if (!region) {
    return (
      <div className="text-[10px] text-text-tertiary italic">
        Region {entityId} not found.
      </div>
    );
  }
  return <RegionProperties region={region} />;
}
