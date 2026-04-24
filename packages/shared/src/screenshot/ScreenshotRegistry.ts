/**
 * Screenshot registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `screenshot.ts`.
 * Pure logic: share-target lookup, enabled-target filtering, and
 * resolution effective-size computation when the manifest declares
 * a zero (match-viewport) dimension.
 */

import {
  type CaptureRules,
  type PhotoModeRules,
  type ScreenshotManifest,
  type ShareTarget,
  type ShareTargetKind,
  type WatermarkRules,
  ScreenshotManifestSchema,
} from "@hyperforge/manifest-schema";

export class ScreenshotNotLoadedError extends Error {
  constructor() {
    super("ScreenshotRegistry used before load()");
    this.name = "ScreenshotNotLoadedError";
  }
}

export class UnknownShareTargetError extends Error {
  readonly targetId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `share target "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownShareTargetError";
    this.targetId = id;
    this.availableIds = availableIds;
  }
}

export class ScreenshotRegistry {
  private _manifest: ScreenshotManifest | null = null;
  private _targetById = new Map<string, ShareTarget>();

  constructor(manifest?: ScreenshotManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ScreenshotManifest): void {
    this._manifest = manifest;
    this._targetById.clear();
    for (const t of manifest.shareTargets) this._targetById.set(t.id, t);
  }

  loadFromJson(raw: unknown): void {
    this.load(ScreenshotManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): ScreenshotManifest {
    if (!this._manifest) throw new ScreenshotNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  get capture(): CaptureRules {
    return this.manifest.capture;
  }

  get photoMode(): PhotoModeRules {
    return this.manifest.photoMode;
  }

  get watermark(): WatermarkRules {
    return this.manifest.watermark;
  }

  shareTarget(id: string): ShareTarget {
    const t = this._targetById.get(id);
    if (!t) {
      throw new UnknownShareTargetError(
        id,
        Array.from(this._targetById.keys()),
      );
    }
    return t;
  }

  enabledShareTargets(): ShareTarget[] {
    return this.manifest.shareTargets.filter((t) => t.enabled);
  }

  shareTargetsByKind(kind: ShareTargetKind): ShareTarget[] {
    return this.manifest.shareTargets.filter(
      (t) => t.enabled && t.kind === kind,
    );
  }

  /**
   * Effective capture dimensions given a viewport size.
   * Zero in `capture.captureWidthPx` / `captureHeightPx` means
   * "match viewport". `superResolutionMultiplier` is applied last.
   */
  effectiveCaptureSize(
    viewportWidthPx: number,
    viewportHeightPx: number,
  ): { widthPx: number; heightPx: number } {
    const { captureWidthPx, captureHeightPx, superResolutionMultiplier } =
      this.capture;
    const w =
      (captureWidthPx === 0 ? viewportWidthPx : captureWidthPx) *
      superResolutionMultiplier;
    const h =
      (captureHeightPx === 0 ? viewportHeightPx : captureHeightPx) *
      superResolutionMultiplier;
    return { widthPx: w, heightPx: h };
  }
}
