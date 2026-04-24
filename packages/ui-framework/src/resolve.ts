/**
 * resolveLayout — merge an authored UILayoutManifest with a per-player
 * UIUserLayout (overrides) into a single, ready-to-render layout.
 *
 * Pure function. No I/O, no logging, no side effects. Every caller —
 * the runtime `ManifestRenderer`, the editor preview when simulating
 * the "Preview as Player" mode, server-side renderers — goes through
 * this same entry point so the merge semantics stay identical across
 * contexts.
 *
 * Semantics:
 *   1. If `userLayout` is null / mismatched / missing, return the
 *      manifest's instances unchanged.
 *   2. For each manifest instance, apply the matching override (if
 *      any) on top. Overrides are **partial** — only the fields the
 *      player actually changed are written.
 *   3. Overrides that reference instance ids not present in the
 *      manifest are reported in `droppedOverrides` so callers can
 *      garbage-collect them on the next save. They are not errors.
 *   4. Overrides that target a non-`anchored` widget position today
 *      are silently ignored for now — see the TODO in `applyOverride`.
 */

import type {
  UILayoutManifest,
  UIOverride,
  UIOverridePosition,
  UIUserLayout,
  WidgetInstance,
  WidgetPosition,
} from "./layout";

export interface ResolvedLayout {
  /** The authored manifest, passed through unchanged. */
  manifest: UILayoutManifest;
  /**
   * The manifest's `instances` array with per-player overrides merged
   * in. Render from this, not from `manifest.instances`.
   */
  instances: WidgetInstance[];
  /**
   * Instance ids the user-layout targeted that no longer exist in the
   * manifest. Callers should persist a cleaned user-layout on the
   * next save to drop them.
   */
  droppedOverrides: string[];
  /**
   * True when any override was applied. Useful for observability
   * ("is this player running default or customized?") without
   * requiring a deep compare.
   */
  hasOverrides: boolean;
}

/**
 * Merge a manifest with an optional user-layout. Never throws — malformed
 * or mismatched inputs produce the manifest's instances unchanged and
 * an empty `droppedOverrides`.
 */
export function resolveLayout(
  manifest: UILayoutManifest,
  userLayout: UIUserLayout | null,
): ResolvedLayout {
  if (!userLayout || userLayout.layoutId !== manifest.id) {
    return {
      manifest,
      instances: manifest.instances,
      droppedOverrides: [],
      hasOverrides: false,
    };
  }

  const manifestIds = new Set(manifest.instances.map((i) => i.instanceId));
  const overridesById = new Map<string, UIOverride>();
  const droppedOverrides: string[] = [];

  for (const override of userLayout.overrides) {
    if (manifestIds.has(override.instanceId)) {
      overridesById.set(override.instanceId, override);
    } else {
      droppedOverrides.push(override.instanceId);
    }
  }

  if (overridesById.size === 0) {
    return {
      manifest,
      instances: manifest.instances,
      droppedOverrides,
      hasOverrides: false,
    };
  }

  const instances = manifest.instances.map((inst) => {
    const override = overridesById.get(inst.instanceId);
    if (!override) return inst;
    return applyOverride(inst, override);
  });

  return { manifest, instances, droppedOverrides, hasOverrides: true };
}

function applyOverride(
  inst: WidgetInstance,
  override: UIOverride,
): WidgetInstance {
  const next: WidgetInstance = { ...inst };

  if (override.visible !== undefined) {
    next.visible = override.visible;
  }

  if (override.position) {
    next.position = applyPositionOverride(inst.position, override.position);
  }

  return next;
}

function applyPositionOverride(
  position: WidgetPosition,
  override: UIOverridePosition,
): WidgetPosition {
  // Only anchored widgets accept runtime overrides today. Grid / flex
  // overrides will land once those modes support runtime edit-mode
  // (Phase U4+). Silently return the authored position for now —
  // defensive, not an error, so a grid-switched widget doesn't crash
  // a player with stale anchored overrides.
  if (position.kind !== "anchored") {
    return position;
  }

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

  // Strip undefined explicit size so the resolved object matches the
  // authored shape when nothing overrode it — keeps `JSON.stringify`
  // output stable for snapshot tests.
  if (next.width === undefined) {
    delete (next as { width?: number }).width;
  }
  if (next.height === undefined) {
    delete (next as { height?: number }).height;
  }

  return next;
}
