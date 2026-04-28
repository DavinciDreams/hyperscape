/**
 * Minimap Compass — host adapter.
 *
 * Renders the registered `MinimapCompass` widget from the
 * `@hyperforge/hyperscape` meta-plugin (slice 36 of the D6.c
 * widget migration arc). This file is now a thin adapter:
 *   - polls `world.camera` via requestAnimationFrame, computes
 *     yaw, and threads it into the widget's `yawDeg` prop
 *   - threads the active theme into the widget's typed color props
 *   - exposes the same `<MinimapCompass world={...} onClick={...}
 *     isCollapsed={...} size={...} />` surface so call sites stay
 *     unchanged
 *
 * Layout, ring, and "N" indicator all live in the registered
 * widget at
 * `packages/hyperscape-plugin/src/widgets/MinimapCompassWidget.tsx`.
 */

import React, { useEffect, useRef, useState } from "react";
import { THREE } from "@hyperforge/shared";
import { useThemeStore } from "@/ui";
import {
  MinimapCompass as MinimapCompassWidget,
  type CompassSize,
} from "@hyperforge/hyperscape";
import type { ClientWorld } from "../../types";

interface MinimapCompassProps {
  world: ClientWorld;
  onClick: () => void;
  isCollapsed: boolean;
  size?: CompassSize;
}

// Pre-allocated temp vector for RAF loop — avoids GC pressure.
const _tempForward = new THREE.Vector3();

export function MinimapCompass({
  world,
  onClick,
  isCollapsed,
  size = "normal",
}: MinimapCompassProps) {
  const theme = useThemeStore((s) => s.theme);
  const [yawDeg, setYawDeg] = useState<number>(0);
  const prevYawRef = useRef<number>(0);

  useEffect(() => {
    let rafId: number | null = null;
    const loop = () => {
      if (world.camera) {
        world.camera.getWorldDirection(_tempForward);
        _tempForward.y = 0;
        if (_tempForward.lengthSq() > 1e-6) {
          _tempForward.normalize();
          const yaw = Math.atan2(_tempForward.x, -_tempForward.z);
          const newYawDeg = THREE.MathUtils.radToDeg(yaw);
          if (Math.abs(prevYawRef.current - newYawDeg) > 0.1) {
            prevYawRef.current = newYawDeg;
            setYawDeg(newYawDeg);
          }
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [world]);

  return (
    <MinimapCompassWidget
      yawDeg={yawDeg}
      isCollapsed={isCollapsed}
      size={size}
      backgroundColor={theme.colors.background.primary}
      borderColor={theme.colors.border.decorative}
      hoverBorderColor={theme.colors.accent.primary}
      innerRingColor="rgba(255, 255, 255, 0.5)"
      northColor={theme.colors.state.danger}
      onClick={onClick}
    />
  );
}
