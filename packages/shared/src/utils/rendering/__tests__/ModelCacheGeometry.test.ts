import { describe, expect, it } from "vitest";
import THREE, { MeshStandardNodeMaterial } from "../../../extras/three/three";
import { modelCache } from "../ModelCache";

type ModelCacheInternals = {
  setupMaterials: (scene: THREE.Object3D) => void;
  serializeScene: (
    url: string,
    sourceSize: number,
    scene: THREE.Object3D,
    animations: THREE.AnimationClip[],
  ) => unknown;
  deserializeScene: (stored: unknown) => {
    scene: THREE.Object3D;
    animations: THREE.AnimationClip[];
  };
};

describe("ModelCache geometry setup", () => {
  it("computes normals before converting meshes to lit WebGPU materials", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3),
    );

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ vertexColors: true }),
    );
    const scene = new THREE.Scene();
    scene.add(mesh);

    (modelCache as unknown as ModelCacheInternals).setupMaterials(scene);

    expect(mesh.geometry.attributes.normal).toBeDefined();
    expect(mesh.material).toBeInstanceOf(MeshStandardNodeMaterial);
  });

  it("round-trips shared-buffer position attributes without restoring NaN geometry", () => {
    const backing = new Float32Array(12);
    const positions = new Float32Array(
      backing.buffer,
      Float32Array.BYTES_PER_ELEMENT * 3,
      9,
    );
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const scene = new THREE.Scene();
    scene.add(mesh);

    const internals = modelCache as unknown as ModelCacheInternals;
    const serialized = internals.serializeScene(
      "https://example.com/mushroom.glb",
      123,
      scene,
      [],
    );
    const restored = internals.deserializeScene(serialized);
    const restoredMesh = restored.scene.children[0] as THREE.Mesh;
    const restoredPosition = restoredMesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;

    expect(Array.from(restoredPosition.array)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
    ]);
    expect(restoredMesh.geometry.boundingBox?.min.toArray()).toEqual([0, 0, 0]);
    expect(restoredMesh.geometry.boundingBox?.max.toArray()).toEqual([1, 1, 0]);
    expect(
      Number.isFinite(restoredMesh.geometry.boundingSphere?.radius ?? NaN),
    ).toBe(true);
  });

  it("rejects processed geometry payloads that contain non-finite values", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );

    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    const scene = new THREE.Scene();
    scene.add(mesh);

    const internals = modelCache as unknown as ModelCacheInternals;
    const serialized = internals.serializeScene(
      "https://example.com/mushroom.glb",
      123,
      scene,
      [],
    ) as {
      meshes: Array<{
        positions: {
          data: ArrayBuffer;
        };
      }>;
    };

    serialized.meshes[0]!.positions.data = new Float32Array([
      0,
      0,
      0,
      Number.NaN,
      0,
      0,
      0,
      1,
      0,
    ]).buffer;

    expect(() => internals.deserializeScene(serialized)).toThrow(
      /Non-finite position values/,
    );
  });
});
