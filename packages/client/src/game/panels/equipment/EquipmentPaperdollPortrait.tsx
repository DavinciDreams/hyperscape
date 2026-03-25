import React, { useEffect, useMemo, useRef, useState } from "react";
import { EventType, THREE, createRenderer } from "@hyperscape/shared";
import type { WebGPURenderer } from "@hyperscape/shared";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { useThemeStore } from "@/ui";
import type { ClientWorld } from "../../../types";

type PortraitMode = "loading" | "live" | "fallback";

interface EquipmentPaperdollPortraitProps {
  world?: ClientWorld;
  className?: string;
  equipmentSignature?: string;
  compact?: boolean;
}

interface AvatarCarrier {
  instance?: {
    raw?: {
      scene?: THREE.Object3D;
    };
  } | null;
}

interface PlayerWithLiveAvatar {
  _avatar?: AvatarCarrier;
  avatar?: AvatarCarrier;
}

type MaterialCarrier = THREE.Object3D & {
  material?: THREE.Material | THREE.Material[];
  frustumCulled?: boolean;
};

function getLiveAvatarScene(world?: ClientWorld): THREE.Object3D | null {
  const player = world?.getPlayer() as PlayerWithLiveAvatar | null;
  if (!player) return null;

  return (
    player._avatar?.instance?.raw?.scene ??
    player.avatar?.instance?.raw?.scene ??
    null
  );
}

function cloneMaterial(
  material: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) {
    return material.map((entry) => entry.clone());
  }

  return material.clone();
}

function disposePortraitClone(root: THREE.Object3D | null): void {
  if (!root) return;

  root.traverse((child) => {
    const materialCarrier = child as MaterialCarrier;
    const material = materialCarrier.material;
    if (!material) return;

    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
      return;
    }

    material.dispose();
  });
}

function buildPortraitClone(sourceScene: THREE.Object3D): THREE.Object3D {
  const clone = SkeletonUtils.clone(sourceScene) as THREE.Object3D;
  const silhouettes: THREE.Object3D[] = [];

  clone.traverse((child) => {
    if (child.name.startsWith("Silhouette_")) {
      silhouettes.push(child);
    }

    child.castShadow = false;
    child.receiveShadow = false;

    const materialCarrier = child as MaterialCarrier;
    if (materialCarrier.material) {
      materialCarrier.material = cloneMaterial(materialCarrier.material);
      materialCarrier.frustumCulled = false;
    }
  });

  silhouettes.forEach((node) => node.parent?.remove(node));

  clone.position.set(0, 0, 0);
  clone.quaternion.identity();
  clone.rotation.set(0, 0, 0);
  clone.updateMatrixWorld(true);

  const initialBox = new THREE.Box3().setFromObject(clone);
  if (initialBox.isEmpty()) {
    return clone;
  }

  const center = initialBox.getCenter(new THREE.Vector3());
  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= initialBox.min.y;
  clone.updateMatrixWorld(true);

  return clone;
}

function framePortraitAvatar(
  avatarRoot: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
) {
  avatarRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(avatarRoot);
  if (box.isEmpty()) {
    camera.position.set(0, 1.25, 2.8);
    camera.lookAt(0, 1.1, 0);
    return;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 1.5);
  const width = Math.max(size.x, 0.8);
  const distance = Math.max(1.9, height * 0.94, width * 1.6);
  const lookY = center.y + height * 0.03;

  camera.position.set(0, lookY, distance);
  camera.lookAt(0, lookY, 0);
  camera.near = 0.1;
  camera.far = Math.max(12, distance + height * 3);
  camera.updateProjectionMatrix();
}

function PortraitFallback({
  compact,
  mode,
}: {
  compact: boolean;
  mode: PortraitMode;
}) {
  const theme = useThemeStore((s) => s.theme);

  return (
    <div
      data-portrait-fallback="true"
      className="absolute inset-0 flex items-center justify-center"
      style={{
        opacity: mode === "loading" ? 0.7 : 1,
        transition: "opacity 160ms ease",
      }}
    >
      <div
        className="relative flex items-center justify-center"
        style={{
          width: compact ? "86%" : "82%",
          height: compact ? "92%" : "94%",
          borderRadius: compact ? 16 : 20,
          background:
            "radial-gradient(circle at 50% 18%, rgba(223, 186, 112, 0.16), rgba(22, 18, 17, 0.02) 52%, rgba(0, 0, 0, 0) 74%)",
        }}
      >
        <div
          className="absolute inset-x-[12%] bottom-[10%] top-[7%]"
          style={{
            borderRadius: compact ? 16 : 22,
            border: `1px solid ${theme.colors.border.default}55`,
            background:
              "linear-gradient(180deg, rgba(34, 28, 26, 0.14) 0%, rgba(14, 11, 10, 0.04) 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -16px 24px rgba(0,0,0,0.18)",
          }}
        />

        <div
          className="absolute rounded-full"
          style={{
            width: compact ? 34 : 42,
            height: compact ? 34 : 42,
            top: compact ? "10%" : "8%",
            background:
              "linear-gradient(180deg, rgba(224, 197, 143, 0.95), rgba(154, 118, 71, 0.95))",
            boxShadow: "0 10px 18px rgba(0,0,0,0.22)",
          }}
        />

        <div
          className="absolute rounded-[24px]"
          style={{
            width: compact ? 46 : 56,
            height: compact ? 78 : 98,
            top: compact ? "24%" : "22%",
            background:
              "linear-gradient(180deg, rgba(72, 105, 63, 0.95), rgba(44, 68, 42, 0.98))",
            boxShadow: "0 12px 20px rgba(0,0,0,0.22)",
          }}
        />

        <div
          className="absolute rounded-[14px]"
          style={{
            width: compact ? 82 : 102,
            height: compact ? 16 : 18,
            top: compact ? "39%" : "38%",
            background:
              "linear-gradient(90deg, rgba(213, 171, 97, 0) 0%, rgba(213, 171, 97, 0.75) 24%, rgba(213, 171, 97, 0.75) 76%, rgba(213, 171, 97, 0) 100%)",
            opacity: 0.32,
          }}
        />

        <div
          className="absolute rounded-full"
          style={{
            width: compact ? 14 : 18,
            height: compact ? 62 : 78,
            left: compact ? "26%" : "24%",
            top: compact ? "28%" : "27%",
            transform: "rotate(10deg)",
            background:
              "linear-gradient(180deg, rgba(210, 171, 130, 0.9), rgba(154, 112, 83, 0.96))",
          }}
        />

        <div
          className="absolute rounded-full"
          style={{
            width: compact ? 14 : 18,
            height: compact ? 62 : 78,
            right: compact ? "26%" : "24%",
            top: compact ? "28%" : "27%",
            transform: "rotate(-10deg)",
            background:
              "linear-gradient(180deg, rgba(210, 171, 130, 0.9), rgba(154, 112, 83, 0.96))",
          }}
        />

        <div
          className="absolute rounded-full"
          style={{
            width: compact ? 16 : 20,
            height: compact ? 90 : 112,
            left: compact ? "41%" : "40%",
            bottom: compact ? "8%" : "6%",
            background:
              "linear-gradient(180deg, rgba(44, 59, 85, 0.95), rgba(24, 34, 52, 0.98))",
          }}
        />

        <div
          className="absolute rounded-full"
          style={{
            width: compact ? 16 : 20,
            height: compact ? 90 : 112,
            right: compact ? "41%" : "40%",
            bottom: compact ? "8%" : "6%",
            background:
              "linear-gradient(180deg, rgba(44, 59, 85, 0.95), rgba(24, 34, 52, 0.98))",
          }}
        />

        <div
          className="absolute"
          style={{
            inset: 0,
            borderRadius: compact ? 18 : 26,
            background:
              "radial-gradient(circle at 50% 12%, rgba(255,255,255,0.16), rgba(255,255,255,0) 34%)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

export const EquipmentPaperdollPortrait = React.memo(
  function EquipmentPaperdollPortrait({
    world,
    className = "",
    equipmentSignature = "",
    compact = false,
  }: EquipmentPaperdollPortraitProps) {
    const theme = useThemeStore((s) => s.theme);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<WebGPURenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const avatarRootRef = useRef<THREE.Object3D | null>(null);
    const frameRef = useRef<number>(0);
    const [rendererReady, setRendererReady] = useState(false);
    const [mode, setMode] = useState<PortraitMode>("fallback");
    const [refreshNonce, setRefreshNonce] = useState(0);

    const signature = useMemo(
      () => `${equipmentSignature}|${compact ? "compact" : "full"}`,
      [compact, equipmentSignature],
    );

    useEffect(() => {
      if (!world) {
        setMode("fallback");
        return;
      }

      setMode("loading");
      const triggerRefresh = () => setRefreshNonce((current) => current + 1);
      triggerRefresh();

      const timers = [120, 420, 1100].map((delay) =>
        window.setTimeout(triggerRefresh, delay),
      );

      const handleAvatarReady = () => triggerRefresh();

      world.on(EventType.AVATAR_LOAD_COMPLETE, handleAvatarReady, undefined);

      return () => {
        timers.forEach((timerId) => window.clearTimeout(timerId));
        world.off(
          EventType.AVATAR_LOAD_COMPLETE,
          handleAvatarReady,
          undefined,
          undefined,
        );
      };
    }, [signature, world]);

    useEffect(() => {
      if (!world || !canvasRef.current || !containerRef.current) {
        return;
      }

      let cancelled = false;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
      cameraRef.current = camera;

      const ambient = new THREE.AmbientLight(0xf5e8cf, 1.35);
      const key = new THREE.DirectionalLight(0xfff2d1, 1.45);
      key.position.set(1.3, 2.2, 3.2);
      const fill = new THREE.DirectionalLight(0x9ab7ff, 0.35);
      fill.position.set(-1.8, 1.4, 2.4);
      const rim = new THREE.DirectionalLight(0xf0c98b, 0.6);
      rim.position.set(0.5, 2.6, -1.8);

      scene.add(ambient, key, fill, rim);

      const resize = () => {
        if (
          !containerRef.current ||
          !rendererRef.current ||
          !cameraRef.current
        ) {
          return;
        }

        const bounds = containerRef.current.getBoundingClientRect();
        const width = Math.max(1, Math.floor(bounds.width));
        const height = Math.max(1, Math.floor(bounds.height));

        rendererRef.current.setSize(width, height);
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
      };

      const renderFrame = () => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current) {
          return;
        }

        rendererRef.current.render(sceneRef.current, cameraRef.current);
        frameRef.current = window.requestAnimationFrame(renderFrame);
      };

      createRenderer({
        canvas: canvasRef.current,
        alpha: true,
        antialias: true,
      })
        .then((renderer) => {
          if (cancelled) {
            renderer.dispose();
            return;
          }

          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
          rendererRef.current = renderer;
          setRendererReady(true);
          resize();
          frameRef.current = window.requestAnimationFrame(renderFrame);
        })
        .catch((error) => {
          console.error(
            "[EquipmentPaperdollPortrait] Failed to create renderer:",
            error,
          );
          if (!cancelled) {
            setRendererReady(false);
            setMode("fallback");
          }
        });

      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(containerRef.current);
      } else {
        window.addEventListener("resize", resize);
      }

      return () => {
        cancelled = true;
        if (frameRef.current) {
          window.cancelAnimationFrame(frameRef.current);
        }
        resizeObserver?.disconnect();
        window.removeEventListener("resize", resize);
        disposePortraitClone(avatarRootRef.current);
        avatarRootRef.current?.parent?.remove(avatarRootRef.current);
        avatarRootRef.current = null;
        rendererRef.current?.dispose();
        rendererRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
        setRendererReady(false);
      };
    }, [world]);

    useEffect(() => {
      if (!rendererReady || !sceneRef.current || !cameraRef.current) {
        return;
      }

      setMode("loading");
      disposePortraitClone(avatarRootRef.current);
      avatarRootRef.current?.parent?.remove(avatarRootRef.current);
      avatarRootRef.current = null;

      const sourceScene = getLiveAvatarScene(world);
      if (!sourceScene) {
        setMode("fallback");
        return;
      }

      try {
        const portraitClone = buildPortraitClone(sourceScene);
        sceneRef.current.add(portraitClone);
        avatarRootRef.current = portraitClone;
        framePortraitAvatar(portraitClone, cameraRef.current);
        setMode("live");
      } catch (error) {
        console.error(
          "[EquipmentPaperdollPortrait] Failed to build portrait clone:",
          error,
        );
        setMode("fallback");
      }
    }, [refreshNonce, rendererReady, signature, world]);

    return (
      <div
        ref={containerRef}
        data-equipment-portrait="true"
        data-portrait-mode={mode}
        className={`relative overflow-hidden ${className}`}
        style={{
          borderRadius: compact ? 14 : 18,
          border: `1px solid ${theme.colors.border.default}66`,
          background: `radial-gradient(circle at 50% 10%, ${theme.colors.accent.primary}18 0%, rgba(24, 18, 15, 0.08) 38%, rgba(10, 9, 10, 0.16) 100%)`,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -14px 20px rgba(0,0,0,0.16)",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 24%, rgba(0,0,0,0.1) 100%)",
          }}
        />

        <canvas
          ref={canvasRef}
          data-equipment-portrait-canvas="true"
          className="absolute inset-0 h-full w-full"
          style={{
            display: mode === "live" ? "block" : "none",
          }}
        />

        {mode !== "live" && <PortraitFallback compact={compact} mode={mode} />}
      </div>
    );
  },
);
