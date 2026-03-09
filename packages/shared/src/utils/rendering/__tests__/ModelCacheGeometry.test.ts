import { describe, expect, it } from "vitest";
import THREE, { MeshStandardNodeMaterial } from "../../../extras/three/three";
import { modelCache } from "../ModelCache";

type ModelCacheInternals = {
  setupMaterials: (scene: THREE.Object3D) => void;
};

describe("ModelCache geometry setup", () => {
  it("computes normals before converting meshes to lit WebGPU materials", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          0, 0, 0,
          1, 0, 0,
          0, 1, 0,
        ],
        3,
      ),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(
        [
          1, 0, 0,
          0, 1, 0,
          0, 0, 1,
        ],
        3,
      ),
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
});
