/**
 * Player emotes registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `player-emotes.ts`. Lookup of emote asset URLs and the priority
 * list of essential emotes to preload after the avatar loads.
 */

import {
  type PlayerEmotesManifest,
  PlayerEmotesManifestSchema,
} from "@hyperforge/manifest-schema";

export class PlayerEmotesNotLoadedError extends Error {
  constructor() {
    super("PlayerEmotesRegistry used before load()");
    this.name = "PlayerEmotesNotLoadedError";
  }
}

export class UnknownEmoteError extends Error {
  readonly emoteKey: string;
  readonly availableKeys: readonly string[];
  constructor(key: string, availableKeys: readonly string[]) {
    super(
      `emote "${key}" not found. Known keys: ${
        availableKeys.length > 0 ? availableKeys.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownEmoteError";
    this.emoteKey = key;
    this.availableKeys = availableKeys;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type PlayerEmotesReloadListener = () => void;

export class PlayerEmotesRegistry {
  private _manifest: PlayerEmotesManifest | null = null;
  private _reloadListeners = new Set<PlayerEmotesReloadListener>();

  constructor(manifest?: PlayerEmotesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: PlayerEmotesManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(PlayerEmotesManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: PlayerEmotesReloadListener): () => void {
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
          "[playerEmotesRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): PlayerEmotesManifest {
    if (!this._manifest) throw new PlayerEmotesNotLoadedError();
    return this._manifest;
  }

  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest.emotes, key);
  }

  /** Asset URL for `key`. Throws when unknown. */
  url(key: string): string {
    const u = this.manifest.emotes[key];
    if (u === undefined) {
      throw new UnknownEmoteError(key, Object.keys(this.manifest.emotes));
    }
    return u;
  }

  keys(): string[] {
    return Object.keys(this.manifest.emotes);
  }

  /** Emote keys the runtime MUST preload after avatar load, in authored order. */
  essentialKeys(): string[] {
    return [...this.manifest.essentialEmoteKeys];
  }

  /** All (key, url) pairs for essentials, skipping any missing keys. */
  essentialEntries(): Array<{ key: string; url: string }> {
    const out: Array<{ key: string; url: string }> = [];
    for (const k of this.manifest.essentialEmoteKeys) {
      const u = this.manifest.emotes[k];
      if (u !== undefined) out.push({ key: k, url: u });
    }
    return out;
  }
}
