/**
 * canvasViewStore — view-only state for the UI layout canvas.
 *
 * Separate from `useUILayoutStore` because this is pure UI plumbing
 * (zoom, pan, device preset, ruler/guide visibility) that never
 * touches the persisted manifest. Splitting it out keeps the
 * manifest store clean and prevents view changes from polluting
 * the dirty-tracking used by the Save button.
 */

import type { ViewportKey } from "@hyperforge/ui-framework";
import { VIEWPORT_KEYS } from "@hyperforge/ui-framework";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Author-time variant selector. `"base"` means "edit the authored
 * base layout"; any `ViewportKey` means "author overrides in that
 * viewport variant."
 *
 * Stored on the canvas view store (not the manifest store) because
 * it's pure UI plumbing — toggling it never mutates the persisted
 * manifest and must not pollute dirty-tracking.
 */
export type ActiveVariant = "base" | ViewportKey;

export const ACTIVE_VARIANT_OPTIONS: readonly ActiveVariant[] = [
  "base",
  ...VIEWPORT_KEYS,
];

function isActiveVariant(v: unknown): v is ActiveVariant {
  return (
    v === "base" || (VIEWPORT_KEYS as readonly string[]).includes(v as string)
  );
}

/**
 * Canonical device presets the canvas can target. Widths/heights are
 * in *logical* pixels (the same coordinate space stored in the
 * manifest). Keeping this as a named list rather than free-form
 * width/height inputs keeps author output predictable across the
 * fleet of supported form factors.
 */
export interface DevicePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  /** Short description shown under the label in the picker. */
  hint?: string;
}

export const DEVICE_PRESETS: readonly DevicePreset[] = [
  {
    id: "desktop-1080",
    label: "Desktop 1080p",
    width: 1920,
    height: 1080,
    hint: "1920 × 1080",
  },
  {
    id: "desktop-720",
    label: "Desktop 720p",
    width: 1280,
    height: 720,
    hint: "1280 × 720",
  },
  {
    id: "laptop-1440",
    label: "Laptop 1440",
    width: 1440,
    height: 900,
    hint: "1440 × 900",
  },
  {
    id: "tablet",
    label: "Tablet",
    width: 1024,
    height: 768,
    hint: "1024 × 768",
  },
  {
    id: "mobile-iphone",
    label: "Mobile (iPhone)",
    width: 390,
    height: 844,
    hint: "390 × 844",
  },
  {
    id: "mobile-android",
    label: "Mobile (Android)",
    width: 412,
    height: 915,
    hint: "412 × 915",
  },
] as const;

export const DEFAULT_PRESET_ID = "desktop-720";

export function getPreset(id: string): DevicePreset {
  return (
    DEVICE_PRESETS.find((p) => p.id === id) ??
    DEVICE_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!
  );
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

interface CanvasViewState {
  /** Zoom factor — 1 = 100%. Clamped to [MIN_ZOOM, MAX_ZOOM]. */
  zoom: number;
  /** Pan offset in *screen* pixels (before zoom). */
  pan: { x: number; y: number };
  /** Active device preset id (see DEVICE_PRESETS). */
  presetId: string;
  /** Show the px-ruler overlay along the top/left edges. */
  showRulers: boolean;
  /** Show alignment guide lines while dragging. */
  showGuides: boolean;
  /** Show the manifest grid overlay (if defined). */
  showGrid: boolean;
  /** Show the checkered transparent background outside the viewport. */
  showCheckerboard: boolean;
  /**
   * Which authored variant the editor is currently targeting.
   * `"base"` = the authored base manifest. `"mobile"`/`"tablet"`/
   * `"desktop"` = one of `manifest.variants[...]`. Consumers
   * (inspector, preview) read this to decide whether to write/read
   * variant overrides or base props.
   */
  activeVariant: ActiveVariant;

  setZoom: (zoom: number, anchor?: { x: number; y: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  setPan: (pan: { x: number; y: number }) => void;
  panBy: (dx: number, dy: number) => void;
  setPreset: (id: string) => void;
  toggleRulers: () => void;
  toggleGuides: () => void;
  toggleGrid: () => void;
  toggleCheckerboard: () => void;
  setActiveVariant: (variant: ActiveVariant) => void;
}

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

export const useCanvasViewStore = create<CanvasViewState>()(
  persist(
    (set, get) => ({
      zoom: 1,
      pan: { x: 0, y: 0 },
      presetId: DEFAULT_PRESET_ID,
      showRulers: true,
      showGuides: true,
      showGrid: true,
      showCheckerboard: true,
      activeVariant: "base",

      setZoom: (zoom, anchor) => {
        const prev = get().zoom;
        const next = clampZoom(zoom);
        if (next === prev) return;
        // When an anchor is supplied (zoom-at-cursor), adjust pan so
        // the logical point under the cursor stays under the cursor
        // after the zoom change.
        if (anchor) {
          const { pan } = get();
          const k = next / prev;
          set({
            zoom: next,
            pan: {
              x: anchor.x - k * (anchor.x - pan.x),
              y: anchor.y - k * (anchor.y - pan.y),
            },
          });
        } else {
          set({ zoom: next });
        }
      },

      zoomIn: () => {
        const z = get().zoom;
        get().setZoom(z * 1.2);
      },

      zoomOut: () => {
        const z = get().zoom;
        get().setZoom(z / 1.2);
      },

      resetView: () => set({ zoom: 1, pan: { x: 0, y: 0 } }),

      setPan: (pan) => set({ pan }),
      panBy: (dx, dy) =>
        set((s) => ({ pan: { x: s.pan.x + dx, y: s.pan.y + dy } })),

      setPreset: (id) => {
        const exists = DEVICE_PRESETS.some((p) => p.id === id);
        if (!exists) return;
        set({ presetId: id, zoom: 1, pan: { x: 0, y: 0 } });
      },

      toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),
      toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      toggleCheckerboard: () =>
        set((s) => ({ showCheckerboard: !s.showCheckerboard })),

      setActiveVariant: (variant) => {
        if (!isActiveVariant(variant)) return;
        if (get().activeVariant === variant) return;
        set({ activeVariant: variant });
      },
    }),
    {
      name: "world-studio.ui-layout.canvas-view",
      // Ephemeral — zoom/pan reset per session. Only remember what
      // the user has stable preferences for.
      // `activeVariant` is deliberately omitted — authoring scratch
      // state that should reset to `"base"` each session so the
      // author never lands on a mobile variant they forgot about.
      partialize: (s) => ({
        presetId: s.presetId,
        showRulers: s.showRulers,
        showGuides: s.showGuides,
        showGrid: s.showGrid,
        showCheckerboard: s.showCheckerboard,
      }),
    },
  ),
);
