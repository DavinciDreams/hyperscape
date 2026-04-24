/**
 * applyLayoutVariant — fold a per-viewport variant onto a base
 * `UILayoutManifest`, returning a new manifest ready to feed through
 * `resolveLayout`.
 *
 * Pure function. Caller picks the viewport ("mobile" | "tablet" |
 * "desktop") via `useViewportVariant` (client) or passes it explicitly.
 * Instances present in the base manifest that appear in the variant's
 * `overrides` array get their `position`/`visible` tweaked. Overrides
 * with `hidden: true` drop the instance entirely (distinct from
 * `visible: false`, which can be toggled at runtime by visibility
 * rules). The variant may also override the manifest's `grid` geometry
 * and theme (inline or by id) for that viewport.
 *
 * Unknown variants (e.g. a `ViewportKey` the manifest doesn't define)
 * fall through to the base manifest unchanged — the base is always
 * safe to render.
 */

import type {
  LayoutVariant,
  LayoutVariantOverride,
  UILayoutManifest,
  UIOverridePosition,
  WidgetInstance,
  WidgetPosition,
} from "./layout";

export const VIEWPORT_KEYS = ["mobile", "tablet", "desktop"] as const;
export type ViewportKey = (typeof VIEWPORT_KEYS)[number];

export interface ApplyVariantResult {
  /** The manifest with the variant baked in. Safe to feed to resolveLayout. */
  manifest: UILayoutManifest;
  /** True when any variant data actually changed the base manifest. */
  applied: boolean;
  /**
   * Override entries that referenced an instanceId not present in the
   * base manifest. Not an error — caller can surface these for author
   * garbage-collection.
   */
  droppedOverrides: string[];
}

/**
 * Apply a variant onto a base manifest. When `viewport` is null or the
 * manifest declares no matching variant, returns the base untouched.
 */
export function applyLayoutVariant(
  manifest: UILayoutManifest,
  viewport: ViewportKey | null,
): ApplyVariantResult {
  if (!viewport || !manifest.variants) {
    return { manifest, applied: false, droppedOverrides: [] };
  }
  const variant = manifest.variants[viewport];
  if (!variant) {
    return { manifest, applied: false, droppedOverrides: [] };
  }

  const overridesById = new Map<string, LayoutVariantOverride>();
  const droppedOverrides: string[] = [];
  const manifestIds = new Set(manifest.instances.map((i) => i.instanceId));

  for (const override of variant.overrides) {
    if (manifestIds.has(override.instanceId)) {
      overridesById.set(override.instanceId, override);
    } else {
      droppedOverrides.push(override.instanceId);
    }
  }

  let applied = false;

  const instances: WidgetInstance[] = [];
  for (const inst of manifest.instances) {
    const override = overridesById.get(inst.instanceId);
    if (!override) {
      instances.push(inst);
      continue;
    }
    if (override.hidden === true) {
      applied = true;
      continue; // drop this instance for this viewport
    }
    instances.push(applyVariantOverride(inst, override));
    applied = true;
  }

  // Bake variant-level grid/theme tweaks. We only overwrite when the
  // variant explicitly provides a value — unset fields fall through.
  const next: UILayoutManifest = { ...manifest, instances };
  if (variant.grid) {
    next.grid = variant.grid;
    applied = true;
  }
  if (variant.theme) {
    next.theme = variant.theme;
    applied = true;
  }
  if (variant.themeId) {
    next.themeId = variant.themeId;
    applied = true;
  }

  return { manifest: next, applied, droppedOverrides };
}

function applyVariantOverride(
  inst: WidgetInstance,
  override: LayoutVariantOverride,
): WidgetInstance {
  const next: WidgetInstance = { ...inst };
  if (override.visible !== undefined) {
    next.visible = override.visible;
  }
  if (override.position) {
    next.position = applyVariantPositionOverride(
      inst.position,
      override.position,
    );
  }
  return next;
}

function applyVariantPositionOverride(
  position: WidgetPosition,
  override: UIOverridePosition,
): WidgetPosition {
  // Same constraint as runtime overrides — only anchored widgets
  // support partial position overrides today.
  if (position.kind !== "anchored") return position;

  const next = {
    kind: "anchored" as const,
    anchor: override.anchor ?? position.anchor,
    offset: {
      x: override.offsetX ?? position.offset.x,
      y: override.offsetY ?? position.offset.y,
    },
    width: override.width ?? position.width,
    height: override.height ?? position.height,
  };

  if (next.width === undefined) {
    delete (next as { width?: number }).width;
  }
  if (next.height === undefined) {
    delete (next as { height?: number }).height;
  }

  return next;
}

/**
 * Default breakpoint classifier used by the client hook. Exposed so
 * tests and the editor's "Preview as..." simulator can share it.
 */
export const DEFAULT_VIEWPORT_BREAKPOINTS = {
  /** Width <= this → "mobile". */
  mobileMax: 640,
  /** Width <= this → "tablet". (Must be > mobileMax.) */
  tabletMax: 1024,
} as const;

export interface ViewportClassifierOptions {
  mobileMax?: number;
  tabletMax?: number;
}

/** Classify a pixel width into one of the three viewport keys. */
export function classifyViewport(
  widthPx: number,
  options: ViewportClassifierOptions = {},
): ViewportKey {
  const { mobileMax = DEFAULT_VIEWPORT_BREAKPOINTS.mobileMax } = options;
  const { tabletMax = DEFAULT_VIEWPORT_BREAKPOINTS.tabletMax } = options;
  if (widthPx <= mobileMax) return "mobile";
  if (widthPx <= tabletMax) return "tablet";
  return "desktop";
}

// Unused imports placeholder — LayoutVariant reserved for future
// fast-path helpers over the raw variant shape.
export type { LayoutVariant };
