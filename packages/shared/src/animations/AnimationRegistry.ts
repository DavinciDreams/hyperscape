/**
 * Animation registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `animations.ts`.
 * Pure logic: indexes clips + bindings, resolves
 * `(rigId, action) → playable clip` with per-binding speed/loop
 * overrides falling back to clip authoring defaults.
 */

import {
  type AnimationAction,
  type AnimationBinding,
  type AnimationClip,
  type AnimationManifest,
  AnimationManifestSchema,
} from "@hyperforge/manifest-schema";

export interface ResolvedAnimation {
  clipId: string;
  name: string;
  path: string;
  duration: number;
  speed: number;
  loop: boolean;
  blendIn: number;
  blendOut: number;
  tags: readonly string[];
}

export class UnknownAnimationClipError extends Error {
  readonly clipId: string;
  readonly availableIds: readonly string[];
  constructor(clipId: string, availableIds: readonly string[]) {
    super(
      `animation clip "${clipId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownAnimationClipError";
    this.clipId = clipId;
    this.availableIds = availableIds;
  }
}

export class MissingBindingError extends Error {
  readonly rigId: string;
  readonly action: AnimationAction;
  constructor(rigId: string, action: AnimationAction) {
    super(`no binding for rig "${rigId}" action "${action}"`);
    this.name = "MissingBindingError";
    this.rigId = rigId;
    this.action = action;
  }
}

/** Integrity issue reported by `validate()` — wired into editor lints. */
export interface AnimationIntegrityIssue {
  kind: "binding-clip-missing" | "duplicate-binding";
  rigId: string;
  action: AnimationAction;
  clipId?: string;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type AnimationReloadListener = () => void;

export class AnimationRegistry {
  private _clipsById = new Map<string, AnimationClip>();
  private _bindings = new Map<string, AnimationBinding>();
  private _reloadListeners = new Set<AnimationReloadListener>();

  constructor(manifest?: AnimationManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: AnimationManifest): void {
    this._clipsById.clear();
    this._bindings.clear();
    for (const c of manifest.clips) this._clipsById.set(c.id, c);
    for (const b of manifest.bindings) {
      this._bindings.set(bindingKey(b.rigId, b.action), b);
    }
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: AnimationReloadListener): () => void {
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
          "[animationRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(AnimationManifestSchema.parse(raw));
  }

  get clipCount(): number {
    return this._clipsById.size;
  }

  /**
   * Non-throwing check for consumers that want to prefer the registry
   * when an animation manifest has been loaded and fall back to
   * hardcoded animation defaults otherwise. Symmetric with
   * `WorldAreasRegistry.isLoaded()`.
   */
  isLoaded(): boolean {
    return this._clipsById.size > 0;
  }

  get bindingCount(): number {
    return this._bindings.size;
  }

  hasClip(clipId: string): boolean {
    return this._clipsById.has(clipId);
  }

  getClip(clipId: string): AnimationClip {
    const c = this._clipsById.get(clipId);
    if (!c) {
      throw new UnknownAnimationClipError(
        clipId,
        Array.from(this._clipsById.keys()),
      );
    }
    return c;
  }

  clipsForTag(tag: string): AnimationClip[] {
    const out: AnimationClip[] = [];
    for (const c of this._clipsById.values()) {
      if (c.tags.includes(tag)) out.push(c);
    }
    return out;
  }

  /**
   * Resolve a playable animation for a rig's action. Per-binding
   * overrides take precedence over clip-authored defaults.
   */
  resolve(rigId: string, action: AnimationAction): ResolvedAnimation {
    const binding = this._bindings.get(bindingKey(rigId, action));
    if (!binding) {
      throw new MissingBindingError(rigId, action);
    }
    const clip = this.getClip(binding.clipId);
    return {
      clipId: clip.id,
      name: clip.name,
      path: clip.path,
      duration: clip.duration,
      speed: binding.speed ?? clip.speed,
      loop: binding.loop ?? clip.loop,
      blendIn: clip.blendIn,
      blendOut: clip.blendOut,
      tags: clip.tags,
    };
  }

  tryResolve(rigId: string, action: AnimationAction): ResolvedAnimation | null {
    try {
      return this.resolve(rigId, action);
    } catch (e) {
      if (e instanceof MissingBindingError) return null;
      throw e;
    }
  }

  /** Lint: every binding references a clip; no duplicate (rig,action). */
  validate(manifest: AnimationManifest): AnimationIntegrityIssue[] {
    const issues: AnimationIntegrityIssue[] = [];
    const clips = new Set(manifest.clips.map((c) => c.id));
    const seen = new Set<string>();
    for (const b of manifest.bindings) {
      const k = bindingKey(b.rigId, b.action);
      if (seen.has(k)) {
        issues.push({
          kind: "duplicate-binding",
          rigId: b.rigId,
          action: b.action,
          clipId: b.clipId,
        });
      }
      seen.add(k);
      if (!clips.has(b.clipId)) {
        issues.push({
          kind: "binding-clip-missing",
          rigId: b.rigId,
          action: b.action,
          clipId: b.clipId,
        });
      }
    }
    return issues;
  }
}

function bindingKey(rigId: string, action: AnimationAction): string {
  return `${rigId}|${action}`;
}
