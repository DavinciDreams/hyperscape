/**
 * Interaction config registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `interaction.ts`.
 * Surfaces session-type values, per-session-type interaction distances,
 * transaction rate limits, session tick config, and input-limit validators.
 *
 * Scope: distinct from `interaction-prompts` which authors the UI template
 * catalog. This registry governs server-side session + input tuning.
 */

import {
  type InputLimits,
  type InteractionDistance,
  type InteractionManifest,
  InteractionManifestSchema,
  type SessionConfig,
  type SessionTypeValues,
} from "@hyperforge/manifest-schema";

export type SessionKind = "store" | "bank" | "dialogue";

export class InteractionConfigNotLoadedError extends Error {
  constructor() {
    super("InteractionConfigRegistry used before load()");
    this.name = "InteractionConfigNotLoadedError";
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type InteractionConfigReloadListener = () => void;

export class InteractionConfigRegistry {
  private _manifest: InteractionManifest | null = null;
  private _reloadListeners = new Set<InteractionConfigReloadListener>();

  constructor(manifest?: InteractionManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: InteractionManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(InteractionManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: InteractionConfigReloadListener): () => void {
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
          "[interactionConfigRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): InteractionManifest {
    if (!this._manifest) throw new InteractionConfigNotLoadedError();
    return this._manifest;
  }

  get sessionTypes(): SessionTypeValues {
    return this.manifest.sessionTypes;
  }

  get interactionDistance(): InteractionDistance {
    return this.manifest.interactionDistance;
  }

  get transactionRateLimitMs(): number {
    return this.manifest.transactionRateLimitMs;
  }

  get sessionConfig(): SessionConfig {
    return this.manifest.sessionConfig;
  }

  get inputLimits(): InputLimits {
    return this.manifest.inputLimits;
  }

  /** Chebyshev-style max interaction distance for the given session kind. */
  maxDistanceFor(kind: SessionKind): number {
    return this.interactionDistance[kind];
  }

  /** Whether the player is within interaction range (Chebyshev, tile-based-MMORPG-style). */
  isInRange(
    kind: SessionKind,
    player: { x: number; z: number },
    target: { x: number; z: number },
  ): boolean {
    const maxDist = this.maxDistanceFor(kind);
    return (
      Math.max(Math.abs(player.x - target.x), Math.abs(player.z - target.z)) <=
      maxDist
    );
  }

  isValidItemId(itemId: string): boolean {
    const l = this.inputLimits;
    return itemId.length > 0 && itemId.length <= l.maxItemIdLength;
  }

  isValidStoreId(storeId: string): boolean {
    const l = this.inputLimits;
    return storeId.length > 0 && storeId.length <= l.maxStoreIdLength;
  }

  isValidQuantity(qty: number): boolean {
    return (
      Number.isInteger(qty) && qty > 0 && qty <= this.inputLimits.maxQuantity
    );
  }

  isValidInventorySlot(slot: number): boolean {
    return (
      Number.isInteger(slot) &&
      slot >= 0 &&
      slot < this.inputLimits.maxInventorySlots
    );
  }

  /** Whether `requestTimestampMs` is within acceptable age/skew of `now`. */
  isRequestFresh(requestTimestampMs: number, now: number): boolean {
    const { maxRequestAgeMs, maxClockSkewMs } = this.inputLimits;
    const delta = now - requestTimestampMs;
    // Too old
    if (delta > maxRequestAgeMs) return false;
    // Too far in the future (clock skew)
    if (delta < -maxClockSkewMs) return false;
    return true;
  }
}
