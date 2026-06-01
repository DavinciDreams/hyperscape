import React, { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  TWO_PI,
  color,
  cos,
  float,
  mix,
  range,
  sin,
  time,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl";

type ConjureGalaxyProps = {
  active: boolean;
};

function safeDisposeMaterial(material: THREE.Material | null): void {
  if (!material) return;
  try {
    material.dispose();
  } catch (error) {
    if (error instanceof TypeError && String(error).includes("usedTimes")) {
      return;
    }
    console.warn("[ConjureGalaxy] Material disposal failed", error);
  }
}

export function ConjureGalaxy({ active }: ConjureGalaxyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return undefined;

    let disposed = false;
    let renderer: THREE.WebGPURenderer | null = null;
    let mesh: THREE.InstancedMesh | null = null;
    let geometry: THREE.PlaneGeometry | null = null;
    let material: THREE.SpriteNodeMaterial | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(2.7, 1.4, 3.7);
    camera.lookAt(0, 0, 0);

    const configureSize = () => {
      if (!renderer || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height, false);
    };

    try {
      material = new THREE.SpriteNodeMaterial({
        depthWrite: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
      });

      const size = uniform(0.055);
      material.scaleNode = range(0, 1).mul(size);

      const radiusRatio = range(0, 1);
      const radius = radiusRatio.pow(1.5).mul(3.2).toVar();
      const branches = 4;
      const branchAngle = range(0, branches).floor().mul(TWO_PI.div(branches));
      const angle = branchAngle.add(time.mul(radiusRatio.oneMinus()).mul(0.7));
      const position = vec3(cos(angle), 0, sin(angle)).mul(radius);
      const randomOffset = range(vec3(-1), vec3(1))
        .pow3()
        .mul(radiusRatio)
        .add(0.14);

      material.positionNode = position.add(randomOffset);

      const colorInside = uniform(color("#ffd49a"));
      const colorOutside = uniform(color("#4c7dff"));
      const colorFinal = mix(
        colorInside,
        colorOutside,
        radiusRatio.oneMinus().pow(2).oneMinus(),
      );
      const alpha = float(0.075).div(uv().sub(0.5).length()).sub(0.22);
      material.colorNode = vec4(colorFinal, alpha);

      geometry = new THREE.PlaneGeometry(1, 1);
      mesh = new THREE.InstancedMesh(geometry, material, 4200);
      mesh.rotation.x = -0.18;
      scene.add(mesh);

      renderer = new THREE.WebGPURenderer({
        antialias: true,
        alpha: true,
        canvas,
      });
      configureSize();

      resizeObserver = new ResizeObserver(configureSize);
      if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

      renderer.setAnimationLoop(() => {
        if (disposed || !renderer || !mesh) return;
        mesh.rotation.y += 0.0015;
        renderer.render(scene, camera);
      });
    } catch (error) {
      console.warn("[ConjureGalaxy] WebGPU galaxy failed to initialize", error);
    }

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      renderer?.setAnimationLoop(null);
      if (mesh) scene.remove(mesh);
      geometry?.dispose();
      safeDisposeMaterial(material);
      renderer?.dispose();
    };
  }, [active]);

  return (
    <div className="conjure-galaxy" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
