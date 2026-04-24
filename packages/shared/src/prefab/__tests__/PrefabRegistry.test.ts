import { PrefabManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  PrefabNotLoadedError,
  PrefabRegistry,
  UnknownPrefabError,
  UnknownPrefabInstanceError,
} from "../PrefabRegistry.js";

function manifest() {
  return PrefabManifestSchema.parse({
    prefabs: [
      {
        id: "door.wooden",
        name: "Wooden Door",
        entities: [
          {
            localId: "frame",
            entityType: "mesh",
            transform: { position: { x: 0, y: 0, z: 0 } },
            properties: { color: "#884400", locked: false },
          },
          {
            localId: "frame/handle",
            entityType: "mesh",
            transform: { position: { x: 0, y: 1, z: 0 } },
            properties: { material: "brass" },
          },
        ],
      },
      {
        id: "chest.common",
        name: "Common Chest",
        entities: [
          {
            localId: "root",
            entityType: "mesh",
            transform: { position: { x: 0, y: 0, z: 0 } },
            properties: { capacity: 10 },
          },
        ],
      },
    ],
    instances: [
      {
        id: "inst-1",
        prefabId: "door.wooden",
        transform: { position: { x: 5, y: 0, z: 10 } },
        overrides: [
          { targetLocalId: "frame", propertyName: "locked", value: true },
        ],
      },
      {
        id: "inst-2",
        prefabId: "door.wooden",
        transform: { position: { x: 0, y: 0, z: 0 } },
      },
    ],
  });
}

describe("PrefabRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new PrefabRegistry().manifest).toThrow(PrefabNotLoadedError);
  });

  it("prefab + instance lookups", () => {
    const r = new PrefabRegistry(manifest());
    expect(r.hasPrefab("door.wooden")).toBe(true);
    expect(r.prefab("door.wooden").name).toBe("Wooden Door");
    expect(() => r.prefab("ghost")).toThrow(UnknownPrefabError);
    expect(r.hasInstance("inst-1")).toBe(true);
    expect(() => r.instance("ghost")).toThrow(UnknownPrefabInstanceError);
  });

  it("entity throws on unknown localId", () => {
    const r = new PrefabRegistry(manifest());
    expect(r.entity("door.wooden", "frame").entityType).toBe("mesh");
    expect(() => r.entity("door.wooden", "ghost")).toThrow(/no entity/);
  });

  it("effectiveProperties merges defaults + instance overrides", () => {
    const r = new PrefabRegistry(manifest());
    const eff1 = r.effectiveProperties("inst-1", "frame");
    expect(eff1.color).toBe("#884400");
    expect(eff1.locked).toBe(true); // overridden
    // inst-2 has no overrides
    const eff2 = r.effectiveProperties("inst-2", "frame");
    expect(eff2.locked).toBe(false);
  });

  it("instancesOf filter", () => {
    const r = new PrefabRegistry(manifest());
    expect(
      r
        .instancesOf("door.wooden")
        .map((i) => i.id)
        .sort(),
    ).toEqual(["inst-1", "inst-2"]);
    expect(r.instancesOf("chest.common")).toEqual([]);
  });
});
