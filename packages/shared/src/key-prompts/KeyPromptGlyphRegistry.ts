/**
 * Key-prompt glyph registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `key-prompt-icons.ts`. Maps `(deviceKind, inputCode)` pairs to
 * `ResolvedGlyph`s combining the glyph row with its device family's
 * theme + scale multiplier, so a UI layer can render a keyboard/
 * gamepad/touch icon with a single lookup.
 *
 * If a player's active device has no matching glyph, `resolve()`
 * falls back to the manifest's `fallbackDeviceKind` with the SAME
 * inputCode. If that still misses, returns `null` (caller renders
 * `fallbackLabel` as text).
 *
 * Scope: pure logic.
 */

import {
  type DeviceFamily,
  type DeviceKind,
  type InputGlyph,
  type KeyPromptIconsManifest,
  KeyPromptIconsManifestSchema,
} from "@hyperforge/manifest-schema";

export interface ResolvedGlyph {
  deviceKind: DeviceKind;
  inputCode: string;
  iconAssetRef: string;
  fallbackLabel: string;
  /** Family `sheetAssetRef` passed through for atlas lookup. */
  sheetAssetRef: string | null;
  /** Family `themeName` passed through. */
  themeName: string;
  /** `glyph.renderWidthPx * family.scaleMultiplier`, rounded down. */
  renderWidthPx: number;
  renderHeightPx: number;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type KeyPromptGlyphReloadListener = () => void;

export class KeyPromptGlyphRegistry {
  private _manifest: KeyPromptIconsManifest | null = null;
  private _byPair = new Map<string, InputGlyph>();
  private _familyByKind = new Map<DeviceKind, DeviceFamily>();
  private _reloadListeners = new Set<KeyPromptGlyphReloadListener>();

  constructor(manifest?: KeyPromptIconsManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: KeyPromptIconsManifest): void {
    this._manifest = manifest;
    this._byPair.clear();
    this._familyByKind.clear();
    for (const g of manifest.glyphs) {
      this._byPair.set(makeKey(g.deviceKind, g.inputCode), g);
    }
    for (const f of manifest.families) {
      this._familyByKind.set(f.kind, f);
    }
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: KeyPromptGlyphReloadListener): () => void {
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
          "[keyPromptGlyphRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(KeyPromptIconsManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byPair.size;
  }

  get isEnabled(): boolean {
    return this._manifest?.enabled ?? false;
  }

  /**
   * Look up a glyph by exact `(deviceKind, inputCode)`. Returns the
   * raw entry or null if missing.
   */
  getExact(deviceKind: DeviceKind, inputCode: string): InputGlyph | null {
    return this._byPair.get(makeKey(deviceKind, inputCode)) ?? null;
  }

  /**
   * Resolve a glyph for the player's active device. If the exact
   * pair isn't in the manifest, fall back to the manifest's
   * `fallbackDeviceKind` + same inputCode. Returns null on total
   * miss (caller renders inputCode as raw text).
   */
  resolve(deviceKind: DeviceKind, inputCode: string): ResolvedGlyph | null {
    const m = this._manifest;
    if (!m || !m.enabled) return null;

    let glyph = this.getExact(deviceKind, inputCode);
    let usedDevice: DeviceKind = deviceKind;
    if (!glyph && deviceKind !== m.fallbackDeviceKind) {
      glyph = this.getExact(m.fallbackDeviceKind, inputCode);
      if (glyph) usedDevice = m.fallbackDeviceKind;
    }
    if (!glyph) return null;

    const family = this._familyByKind.get(usedDevice) ?? null;
    const scale = family?.scaleMultiplier ?? 1;
    return {
      deviceKind: usedDevice,
      inputCode: glyph.inputCode,
      iconAssetRef: glyph.iconAssetRef,
      fallbackLabel: glyph.fallbackLabel,
      sheetAssetRef: family?.sheetAssetRef ?? null,
      themeName: family?.themeName ?? "",
      renderWidthPx: Math.floor(glyph.renderWidthPx * scale),
      renderHeightPx: Math.floor(glyph.renderHeightPx * scale),
    };
  }
}

function makeKey(deviceKind: DeviceKind, inputCode: string): string {
  return `${deviceKind}|${inputCode}`;
}
