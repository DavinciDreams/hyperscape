import React, { useEffect } from "react";
import * as THREE from "three/webgpu";
import type { ClientWorld } from "../../types";

type WorldPosition = {
  x: number;
  y: number;
  z: number;
};

type ConjureWorldEffectProps = {
  active: boolean;
  position: WorldPosition | null;
  world: ClientWorld;
};

function safeDisposeMaterial(material: THREE.Material): void {
  try {
    material.dispose();
  } catch (error) {
    if (error instanceof TypeError && String(error).includes("usedTimes")) {
      return;
    }
    console.warn("[ConjureWorldEffect] Material disposal failed", error);
  }
}

export function ConjureWorldEffect({
  active,
  position,
  world,
}: ConjureWorldEffectProps) {
  useEffect(() => {
    const scene = world.stage?.scene;
    if (!active || !position || !scene) return undefined;

    let disposed = false;
    let frameId = 0;

    const group = new THREE.Group();
    group.name = "conjure-world-effect";
    group.position.set(position.x, position.y + 0.18, position.z);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: "#8eb3ff",
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const warmRingMaterial = new THREE.MeshBasicMaterial({
      color: "#f2d08a",
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const sparkMaterial = new THREE.MeshBasicMaterial({
      color: "#fff1ba",
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });

    const ringGeometry = new THREE.TorusGeometry(1.05, 0.018, 8, 96);
    const innerRingGeometry = new THREE.TorusGeometry(0.58, 0.012, 8, 72);
    const sparkGeometry = new THREE.SphereGeometry(0.035, 8, 6);

    const outerRing = new THREE.Mesh(ringGeometry, ringMaterial);
    outerRing.rotation.x = Math.PI / 2;
    group.add(outerRing);

    const innerRing = new THREE.Mesh(innerRingGeometry, warmRingMaterial);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.18;
    group.add(innerRing);

    const sparkCount = 56;
    const sparks = new THREE.InstancedMesh(
      sparkGeometry,
      sparkMaterial,
      sparkCount,
    );
    sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(sparks);

    const dummy = new THREE.Object3D();
    const startedAt = performance.now();
    scene.add(group);

    const animate = (now: number) => {
      if (disposed) return;

      const elapsed = (now - startedAt) / 1000;
      outerRing.rotation.z = elapsed * 0.82;
      innerRing.rotation.z = -elapsed * 1.28;
      const pulse = 1 + Math.sin(elapsed * 3.2) * 0.055;
      outerRing.scale.setScalar(pulse);
      innerRing.scale.setScalar(1.05 - (pulse - 1));

      for (let index = 0; index < sparkCount; index += 1) {
        const ratio = index / sparkCount;
        const arm = index % 4;
        const radius = 0.18 + ratio * 1.08;
        const angle = ratio * Math.PI * 7.5 + arm * 1.35 + elapsed * 2.1;
        const lift = 0.12 + Math.sin(elapsed * 2.6 + index * 0.37) * 0.14;
        dummy.position.set(
          Math.cos(angle) * radius,
          lift + ratio * 0.55,
          Math.sin(angle) * radius,
        );
        const sparkScale = 0.55 + (1 - ratio) * 0.85;
        dummy.scale.setScalar(sparkScale);
        dummy.updateMatrix();
        sparks.setMatrixAt(index, dummy.matrix);
      }
      sparks.instanceMatrix.needsUpdate = true;

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      scene.remove(group);
      ringGeometry.dispose();
      innerRingGeometry.dispose();
      sparkGeometry.dispose();
      safeDisposeMaterial(ringMaterial);
      safeDisposeMaterial(warmRingMaterial);
      safeDisposeMaterial(sparkMaterial);
    };
  }, [active, position, world]);

  return null;
}
