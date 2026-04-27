/**
 * Input-actions registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `input-actions.ts`. Pure logic: action lookup, category grouping,
 * and default-binding filtering by scheme (keyboard-mouse/gamepad/touch).
 */

import {
  type InputAction,
  type InputActionsManifest,
  type InputBinding,
  InputActionsManifestSchema,
} from "@hyperforge/manifest-schema";

export class InputActionsNotLoadedError extends Error {
  constructor() {
    super("InputActionsRegistry used before load()");
    this.name = "InputActionsNotLoadedError";
  }
}

export class UnknownInputActionError extends Error {
  readonly actionId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `input action "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownInputActionError";
    this.actionId = id;
    this.availableIds = availableIds;
  }
}

export type InputScheme = "keyboard-mouse" | "gamepad" | "touch";

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type InputActionsReloadListener = () => void;

export class InputActionsRegistry {
  private _manifest: InputActionsManifest | null = null;
  private _byId = new Map<string, InputAction>();
  private _reloadListeners = new Set<InputActionsReloadListener>();

  constructor(manifest?: InputActionsManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: InputActionsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const a of manifest) this._byId.set(a.id, a);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(InputActionsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: InputActionsReloadListener): () => void {
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
          "[inputActionsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): InputActionsManifest {
    if (!this._manifest) throw new InputActionsNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): InputAction {
    const a = this._byId.get(id);
    if (!a) {
      throw new UnknownInputActionError(id, Array.from(this._byId.keys()));
    }
    return a;
  }

  rebindable(): InputAction[] {
    return this.manifest.filter((a) => a.rebindable);
  }

  byCategory(category: string): InputAction[] {
    return this.manifest.filter((a) => a.category === category);
  }

  /** Default bindings for an action filtered by input scheme. */
  defaultsForScheme(actionId: string, scheme: InputScheme): InputBinding[] {
    return this.get(actionId).defaults.filter((b) => b.scheme === scheme);
  }

  /**
   * Does any action already use this (scheme, code, modifiers) combo?
   * Returns the action id, or `undefined` if unbound. Useful for the
   * rebinding UI to surface conflicts.
   */
  actionUsingBinding(
    scheme: InputScheme,
    code: string,
    modifiers: readonly string[] = [],
  ): string | undefined {
    const modKey = [...modifiers].sort().join("|");
    for (const a of this.manifest) {
      for (const b of a.defaults) {
        if (b.scheme !== scheme) continue;
        if (b.code !== code) continue;
        const bModKey = [...b.modifiers].sort().join("|");
        if (bModKey === modKey) return a.id;
      }
    }
    return undefined;
  }
}
