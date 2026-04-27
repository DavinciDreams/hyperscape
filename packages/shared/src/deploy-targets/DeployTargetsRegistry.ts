/**
 * Deploy-targets registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `deploy-targets.ts`. Pure logic: target lookup + filtering by
 * environment / provider / enabled state.
 *
 * Editor-only — the runtime game should never read deploy-target
 * secrets. The registry carries *names* only.
 */

import {
  type DeployEnvironment,
  type DeployProvider,
  type DeployTarget,
  type DeployTargetsManifest,
  DeployTargetsManifestSchema,
} from "@hyperforge/manifest-schema";

export class DeployTargetsNotLoadedError extends Error {
  constructor() {
    super("DeployTargetsRegistry used before load()");
    this.name = "DeployTargetsNotLoadedError";
  }
}

export class UnknownDeployTargetError extends Error {
  readonly targetId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `deploy target "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownDeployTargetError";
    this.targetId = id;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type DeployTargetsReloadListener = () => void;

export class DeployTargetsRegistry {
  private _manifest: DeployTargetsManifest | null = null;
  private _byId = new Map<string, DeployTarget>();
  private _reloadListeners = new Set<DeployTargetsReloadListener>();

  constructor(manifest?: DeployTargetsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: DeployTargetsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const t of manifest) this._byId.set(t.id, t);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(DeployTargetsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: DeployTargetsReloadListener): () => void {
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
          "[deployTargetsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): DeployTargetsManifest {
    if (!this._manifest) throw new DeployTargetsNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): DeployTarget {
    const t = this._byId.get(id);
    if (!t) {
      throw new UnknownDeployTargetError(id, Array.from(this._byId.keys()));
    }
    return t;
  }

  forEnvironment(env: DeployEnvironment): DeployTarget[] {
    return this.manifest.filter((t) => t.environment === env);
  }

  forProvider(provider: DeployProvider): DeployTarget[] {
    return this.manifest.filter((t) => t.provider === provider);
  }

  enabled(): DeployTarget[] {
    return this.manifest.filter((t) => t.enabled);
  }
}
