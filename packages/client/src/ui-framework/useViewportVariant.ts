/**
 * useViewportVariant — pick a variant key from the current window
 * width and reclassify on resize. Used by `ManifestHud` to fold the
 * matching per-viewport variant onto the base layout before resolving
 * per-player overrides.
 *
 * Returns `null` during SSR / non-browser environments so the caller
 * falls back to the base manifest (`applyLayoutVariant` is a no-op on
 * null).
 */

import { useEffect, useState } from "react";
import { classifyViewport, type ViewportKey } from "@hyperforge/ui-framework";

export function useViewportVariant(): ViewportKey | null {
  const [viewport, setViewport] = useState<ViewportKey | null>(() => {
    if (typeof window === "undefined") return null;
    return classifyViewport(window.innerWidth);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      setViewport(classifyViewport(window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return viewport;
}
