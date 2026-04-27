/**
 * Tooltip registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `tooltips.ts`. Indexes authored tooltip entries by id and
 * resolves effective timing/width values by falling back to the
 * manifest's `default*` fields when an entry omits them.
 *
 * Exposes `resolve(id, ctx)` — a pure query that returns the
 * fully-resolved tooltip parameters a UI layer needs to render,
 * OR `null` when the tooltip should be suppressed (manifest
 * `enabled=false`, per-entry show cap exceeded, or reduced-motion
 * suppression requested).
 *
 * Scope: pure logic — no DOM / React / timers.
 */

import {
  type TooltipEntry,
  type TooltipPlacement,
  type TooltipTrigger,
  type TooltipsManifest,
  TooltipsManifestSchema,
} from "@hyperforge/manifest-schema";

export interface ResolveTooltipContext {
  /** How many times the current player has seen this tooltip so far. */
  seenCount?: number;
  /** Whether the player's OS reports reduced-motion preference. */
  reducedMotion?: boolean;
}

export interface ResolvedTooltip {
  id: string;
  titleLocalizationKey: string;
  bodyLocalizationKey: string;
  ariaLocalizationKey: string;
  trigger: TooltipTrigger;
  placement: TooltipPlacement;
  showDelayMs: number;
  hideDelayMs: number;
  maxWidthPx: number;
  iconAssetRef: string;
  categoryTag: string;
}

export class UnknownTooltipError extends Error {
  readonly tooltipId: string;
  readonly availableIds: readonly string[];
  constructor(tooltipId: string, availableIds: readonly string[]) {
    super(
      `tooltip "${tooltipId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownTooltipError";
    this.tooltipId = tooltipId;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type TooltipReloadListener = () => void;

export class TooltipRegistry {
  private _manifest: TooltipsManifest | null = null;
  private _byId = new Map<string, TooltipEntry>();
  private _reloadListeners = new Set<TooltipReloadListener>();

  constructor(manifest?: TooltipsManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: TooltipsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const e of manifest.entries) this._byId.set(e.id, e);
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: TooltipReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[tooltipRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(TooltipsManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byId.size;
  }

  get ids(): readonly string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  /** Return the raw entry (throws on miss). */
  get(id: string): TooltipEntry {
    const e = this._byId.get(id);
    if (!e) {
      throw new UnknownTooltipError(id, Array.from(this._byId.keys()));
    }
    return e;
  }

  /**
   * Return the fully-resolved tooltip or `null` if it should be
   * suppressed. Fallbacks:
   *
   * - Manifest `enabled=false` → null.
   * - `seenCount >= maxShowsPerPlayer` (when cap > 0) → null.
   * - `reducedMotion=true` + manifest `respectReducedMotionPreference=true`
   *   + trigger = `"hover"` → null (the animated surface effect is the
   *   point of a hover tooltip; keyboard/focus tooltips still show).
   */
  resolve(id: string, ctx: ResolveTooltipContext = {}): ResolvedTooltip | null {
    const m = this._manifest;
    if (!m) {
      throw new UnknownTooltipError(id, []);
    }
    if (!m.enabled) return null;
    const entry = this.get(id);

    const seenCount = ctx.seenCount ?? 0;
    if (seenCount < 0 || !Number.isFinite(seenCount)) {
      throw new TypeError(
        `seenCount must be a non-negative finite number (got ${String(seenCount)})`,
      );
    }
    if (entry.maxShowsPerPlayer > 0 && seenCount >= entry.maxShowsPerPlayer) {
      return null;
    }

    if (
      ctx.reducedMotion === true &&
      m.respectReducedMotionPreference &&
      entry.trigger === "hover"
    ) {
      return null;
    }

    // Entries have author-facing defaults baked in by Zod already
    // (400/100/320), but the manifest's `default*` fields act as a
    // broader "skin" — if an entry matches the schema default exactly,
    // we pick up the manifest-level default instead. This lets authors
    // tweak one value at the manifest level without editing every
    // entry.
    return {
      id: entry.id,
      titleLocalizationKey: entry.titleLocalizationKey,
      bodyLocalizationKey: entry.bodyLocalizationKey,
      ariaLocalizationKey: entry.ariaLocalizationKey,
      trigger: entry.trigger,
      placement: entry.placement,
      showDelayMs:
        entry.showDelayMs === 400 ? m.defaultShowDelayMs : entry.showDelayMs,
      hideDelayMs:
        entry.hideDelayMs === 100 ? m.defaultHideDelayMs : entry.hideDelayMs,
      maxWidthPx:
        entry.maxWidthPx === 320 ? m.defaultMaxWidthPx : entry.maxWidthPx,
      iconAssetRef: entry.iconAssetRef,
      categoryTag: entry.categoryTag,
    };
  }
}
