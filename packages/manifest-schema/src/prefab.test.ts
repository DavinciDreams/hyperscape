/**
 * Faithfulness + defensiveness tests for `PrefabManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { PrefabManifestSchema, type PrefabManifest } from "./prefab.js";

const reference: PrefabManifest = {
  prefabs: [
    {
      id: "building.cottage",
      name: "Cottage",
      description: "Small 2-room wooden cottage.",
      tags: ["building", "residential"],
      entities: [
        {
          localId: "root",
          entityType: "mesh",
          transform: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
          properties: { modelId: "cottage_base" },
          nestedPrefabId: "",
        },
        {
          localId: "door",
          entityType: "mesh",
          transform: {
            position: { x: 0, y: 0, z: 1.5 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
          properties: { modelId: "cottage_door", opensInward: true },
          nestedPrefabId: "",
        },
      ],
    },
    {
      id: "village.smallCluster",
      name: "Small Cluster",
      description: "Two cottages forming a village cluster.",
      tags: ["village"],
      entities: [
        {
          localId: "cottage-a",
          entityType: "prefab-instance",
          transform: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
          properties: {},
          nestedPrefabId: "building.cottage",
        },
        {
          localId: "cottage-b",
          entityType: "prefab-instance",
          transform: {
            position: { x: 10, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
          properties: {},
          nestedPrefabId: "building.cottage",
        },
      ],
    },
  ],
  instances: [
    {
      id: "inst-1",
      prefabId: "building.cottage",
      transform: {
        position: { x: 100, y: 0, z: 50 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      overrides: [
        {
          targetLocalId: "door",
          propertyName: "opensInward",
          value: false,
        },
      ],
    },
  ],
};

describe("PrefabManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = PrefabManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies transform defaults", () => {
    const parsed = PrefabManifestSchema.parse({
      prefabs: [
        {
          id: "x",
          name: "X",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
      ],
    });
    expect(parsed.prefabs[0].entities[0].transform.rotation).toEqual({
      x: 0,
      y: 0,
      z: 0,
      w: 1,
    });
    expect(parsed.prefabs[0].entities[0].transform.scale).toEqual({
      x: 1,
      y: 1,
      z: 1,
    });
    expect(parsed.prefabs[0].entities[0].properties).toEqual({});
    expect(parsed.instances).toEqual([]);
  });

  it("rejects prefab with empty entities array", () => {
    const bad = { prefabs: [{ id: "x", name: "X", entities: [] }] };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate entity localIds within a prefab", () => {
    const bad = {
      prefabs: [
        {
          id: "x",
          name: "X",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 1, y: 0, z: 0 } },
            },
          ],
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate prefab ids", () => {
    const bad = {
      prefabs: [
        {
          id: "p",
          name: "P",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
        {
          id: "p",
          name: "P2",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects instance referencing unknown prefab id", () => {
    const bad = {
      prefabs: [
        {
          id: "p",
          name: "P",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
      ],
      instances: [
        {
          id: "i",
          prefabId: "ghost",
          transform: { position: { x: 0, y: 0, z: 0 } },
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects override targeting unknown localId", () => {
    const bad = {
      prefabs: [
        {
          id: "p",
          name: "P",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
      ],
      instances: [
        {
          id: "i",
          prefabId: "p",
          transform: { position: { x: 0, y: 0, z: 0 } },
          overrides: [{ targetLocalId: "b", propertyName: "x", value: 1 }],
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate overrides on same (localId, propertyName)", () => {
    const bad = {
      prefabs: [
        {
          id: "p",
          name: "P",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
      ],
      instances: [
        {
          id: "i",
          prefabId: "p",
          transform: { position: { x: 0, y: 0, z: 0 } },
          overrides: [
            { targetLocalId: "a", propertyName: "color", value: "red" },
            { targetLocalId: "a", propertyName: "color", value: "blue" },
          ],
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects nestedPrefabId without entityType 'prefab-instance'", () => {
    const bad = {
      prefabs: [
        {
          id: "p",
          name: "P",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
              nestedPrefabId: "q",
            },
          ],
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cyclic nested-prefab graph", () => {
    const bad = {
      prefabs: [
        {
          id: "a",
          name: "A",
          entities: [
            {
              localId: "n",
              entityType: "prefab-instance",
              transform: { position: { x: 0, y: 0, z: 0 } },
              nestedPrefabId: "b",
            },
          ],
        },
        {
          id: "b",
          name: "B",
          entities: [
            {
              localId: "n",
              entityType: "prefab-instance",
              transform: { position: { x: 0, y: 0, z: 0 } },
              nestedPrefabId: "a",
            },
          ],
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid prefab id format", () => {
    const bad = {
      prefabs: [
        {
          id: "Building Cottage",
          name: "X",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid entity localId format", () => {
    const bad = {
      prefabs: [
        {
          id: "p",
          name: "P",
          entities: [
            {
              localId: "Has Spaces",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects override property name not in lowerCamelCase", () => {
    const bad = {
      prefabs: [
        {
          id: "p",
          name: "P",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
      ],
      instances: [
        {
          id: "i",
          prefabId: "p",
          transform: { position: { x: 0, y: 0, z: 0 } },
          overrides: [
            { targetLocalId: "a", propertyName: "Color", value: "red" },
          ],
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate instance ids", () => {
    const bad = {
      prefabs: [
        {
          id: "p",
          name: "P",
          entities: [
            {
              localId: "a",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
      ],
      instances: [
        {
          id: "dup",
          prefabId: "p",
          transform: { position: { x: 0, y: 0, z: 0 } },
        },
        {
          id: "dup",
          prefabId: "p",
          transform: { position: { x: 10, y: 0, z: 0 } },
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts nested prefab composition (acyclic)", () => {
    const ok = {
      prefabs: [
        {
          id: "a",
          name: "A",
          entities: [
            {
              localId: "root",
              entityType: "mesh",
              transform: { position: { x: 0, y: 0, z: 0 } },
            },
          ],
        },
        {
          id: "b",
          name: "B",
          entities: [
            {
              localId: "nested",
              entityType: "prefab-instance",
              transform: { position: { x: 0, y: 0, z: 0 } },
              nestedPrefabId: "a",
            },
          ],
        },
      ],
    };
    expect(PrefabManifestSchema.safeParse(ok).success).toBe(true);
  });
});
