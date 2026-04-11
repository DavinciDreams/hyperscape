import { beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { ExternalResourceData } from "../../data/DataManager";
import {
  getExternalResource,
  getExternalResources,
} from "../ExternalAssetUtils";

const WORLD_ASSETS_DIR = fileURLToPath(
  new URL("../../../../server/world/assets", import.meta.url),
);

function assetUriExists(assetUri: string): boolean {
  return existsSync(resolve(WORLD_ASSETS_DIR, assetUri.replace("asset://", "")));
}

describe("ExternalAssetUtils", () => {
  beforeEach(() => {
    delete (
      globalThis as {
        EXTERNAL_RESOURCES?: Map<string, ExternalResourceData>;
      }
    ).EXTERNAL_RESOURCES;
  });

  it("hydrates missing staging tree resources from fallback data", () => {
    const resource = getExternalResource("tree_general");
    expect(resource).not.toBeNull();
    expect(resource?.id).toBe("tree_general");
    expect(resource?.modelVariants?.length).toBeGreaterThan(0);
    expect(getExternalResources().has("tree_general")).toBe(true);
  });

  it("points fallback staging tree resources at packaged models", () => {
    const resourceIds = [
      "tree_banana",
      "tree_pineDead",
      "tree_eucalyptus",
      "tree_general",
      "tree_magic",
      "tree_mahogany",
    ];

    for (const resourceId of resourceIds) {
      const resource = getExternalResource(resourceId);
      expect(resource).not.toBeNull();
      for (const modelVariant of resource?.modelVariants ?? []) {
        expect(assetUriExists(modelVariant)).toBe(true);
      }
      expect(assetUriExists(resource?.depletedModelPath ?? "")).toBe(true);
    }
  });

  it("prefers already-loaded manifest resources over fallback data", () => {
    const resources = getExternalResources();
    resources.set("tree_general", {
      id: "tree_general",
      name: "Loaded Tree",
      type: "tree",
      modelPath: null,
      depletedModelPath: null,
      scale: 2,
      depletedScale: 1,
      harvestSkill: "woodcutting",
      toolRequired: "bronze_hatchet",
      levelRequired: 1,
      baseCycleTicks: 4,
      depleteChance: 0.5,
      respawnTicks: 10,
      harvestYield: [
        {
          itemId: "logs",
          itemName: "Logs",
          quantity: 1,
          chance: 1,
          xpAmount: 1,
          stackable: true,
        },
      ],
    });

    const resource = getExternalResource("tree_general");
    expect(resource?.name).toBe("Loaded Tree");
    expect(resource?.scale).toBe(2);
  });
});
