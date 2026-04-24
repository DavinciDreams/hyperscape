/**
 * Plugin loader.
 *
 * Pure-logic lifecycle driver for `@hyperforge/manifest-schema`'s
 * `PluginManifest`. Pairs a `PluginCatalog` (authored manifests) with
 * a caller-supplied factory registry (implementations) and runs the
 * load → enable → disable pipeline in dependency order.
 *
 * Scope: just lifecycle orchestration. Does NOT resolve semver ranges,
 * import modules, sandbox plugin code, or emit telemetry. Those layers
 * sit above this one in `@hyperforge/gameplay-framework`.
 *
 * Ordering rules (mirroring UE5 / VSCode):
 *   - `loadAll`      → topological order from catalog (deps first)
 *   - `enableAll`    → same topological order (deps enabled first)
 *   - `disableAll`   → REVERSE topological order (dependents first)
 *
 * State machine per plugin:
 *
 *   registered → loaded → enabled ⇄ disabled
 *                  │                     │
 *                  └──────► failed ◄─────┘
 */

import type { PluginManifest } from "@hyperforge/manifest-schema";
import { PluginCatalog } from "./PluginCatalog.js";

/**
 * A loaded plugin instance. All lifecycle hooks are optional so
 * data-only plugins (pure manifest contributions) don't need to
 * implement anything.
 *
 * Generic `TContext` lets callers thread a `PluginContext` handle
 * (world refs, registry handles, schema additions) into each hook.
 * Default is `void` — hooks receive no argument, matching plain
 * no-context usage.
 */
export interface HyperforgePlugin<TContext = void> {
  onLoad?(ctx: TContext): void | Promise<void>;
  onEnable?(ctx: TContext): void | Promise<void>;
  onDisable?(ctx: TContext): void | Promise<void>;
}

/** Factory that produces a plugin instance when invoked. */
export type PluginFactory<TContext = void> = () => HyperforgePlugin<TContext>;

/**
 * Caller-supplied hook producing the per-plugin context. Invoked
 * once per plugin during `loadAll`; the resulting context is cached
 * and reused for `onEnable` / `onDisable`. Useful for building
 * scoped registration handles without PluginLoader knowing their
 * shape.
 */
export type PluginContextProvider<TContext> = (
  manifest: PluginManifest,
) => TContext;

export type PluginLifecycleState =
  | "registered"
  | "loaded"
  | "enabled"
  | "disabled"
  | "failed";

export interface PluginRecord<TContext = unknown> {
  readonly manifest: PluginManifest;
  readonly state: PluginLifecycleState;
  readonly instance: HyperforgePlugin<TContext> | null;
  readonly error: Error | null;
}

export class MissingPluginFactoryError extends Error {
  readonly pluginId: string;
  constructor(pluginId: string) {
    super(`no factory registered for plugin "${pluginId}"`);
    this.name = "MissingPluginFactoryError";
    this.pluginId = pluginId;
  }
}

export class MissingHardDependencyError extends Error {
  readonly pluginId: string;
  readonly missingIds: readonly string[];
  constructor(pluginId: string, missingIds: readonly string[]) {
    super(
      `plugin "${pluginId}" missing hard dependencies: ${missingIds.join(", ")}`,
    );
    this.name = "MissingHardDependencyError";
    this.pluginId = pluginId;
    this.missingIds = missingIds;
  }
}

export class PluginLifecyclePhase {
  static readonly LOAD = "load" as const;
  static readonly ENABLE = "enable" as const;
  static readonly DISABLE = "disable" as const;
}

export type LifecyclePhase = "load" | "enable" | "disable";

export class PluginLifecycleError extends Error {
  readonly pluginId: string;
  readonly phase: LifecyclePhase;
  readonly cause: Error;
  constructor(pluginId: string, phase: LifecyclePhase, cause: Error) {
    super(`plugin "${pluginId}" failed during ${phase}: ${cause.message}`);
    this.name = "PluginLifecycleError";
    this.pluginId = pluginId;
    this.phase = phase;
    this.cause = cause;
  }
}

/** Internal mutable record; we expose a readonly view via `records`. */
interface MutableRecord<TContext> {
  manifest: PluginManifest;
  state: PluginLifecycleState;
  instance: HyperforgePlugin<TContext> | null;
  error: Error | null;
  context: TContext | undefined;
}

export class PluginLoader<TContext = void> {
  private readonly _catalog: PluginCatalog;
  private readonly _factories = new Map<string, PluginFactory<TContext>>();
  private readonly _records = new Map<string, MutableRecord<TContext>>();
  private readonly _contextProvider:
    | PluginContextProvider<TContext>
    | undefined;

  constructor(
    catalog: PluginCatalog,
    contextProvider?: PluginContextProvider<TContext>,
  ) {
    this._catalog = catalog;
    this._contextProvider = contextProvider;
    for (const p of catalog.plugins()) {
      this._records.set(p.id, {
        manifest: p,
        state: "registered",
        instance: null,
        error: null,
        context: undefined,
      });
    }
  }

  get catalog(): PluginCatalog {
    return this._catalog;
  }

  /** Register (or replace) the factory for a plugin id. */
  registerFactory(pluginId: string, factory: PluginFactory<TContext>): void {
    if (!this._records.has(pluginId)) {
      throw new Error(
        `cannot register factory for "${pluginId}" — not in catalog`,
      );
    }
    this._factories.set(pluginId, factory);
  }

  hasFactory(pluginId: string): boolean {
    return this._factories.has(pluginId);
  }

  /** Readonly snapshot of the record for a plugin. */
  getRecord(pluginId: string): PluginRecord<TContext> {
    const r = this._records.get(pluginId);
    if (!r) {
      throw new Error(
        `plugin "${pluginId}" not in catalog — cannot read record`,
      );
    }
    return {
      manifest: r.manifest,
      state: r.state,
      instance: r.instance,
      error: r.error,
    };
  }

  /** All records in catalog order (unsorted — use loadOrder for topo). */
  get records(): readonly PluginRecord<TContext>[] {
    return Array.from(this._records.values()).map((r) => ({
      manifest: r.manifest,
      state: r.state,
      instance: r.instance,
      error: r.error,
    }));
  }

  /**
   * Instantiate each plugin via its factory and run `onLoad` in
   * dependency order.
   *
   * Pre-flight: every plugin in the catalog must have a registered
   * factory and satisfied hard dependencies. Missing factories throw
   * `MissingPluginFactoryError` before any side effects. Missing hard
   * deps throw `MissingHardDependencyError`.
   *
   * A plugin's `onLoad` throwing promotes its state to `failed` and
   * surfaces a `PluginLifecycleError`; later plugins in the order are
   * NOT loaded (fail-fast — dependents would have observed an
   * inconsistent parent).
   */
  async loadAll(): Promise<void> {
    const order = this._catalog.loadOrder();

    // Pre-flight validation — fail before touching any factory.
    for (const p of order) {
      if (!this._factories.has(p.id)) {
        throw new MissingPluginFactoryError(p.id);
      }
      const missing = this._catalog.missingHardDependencies(p.id);
      if (missing.length > 0) {
        throw new MissingHardDependencyError(p.id, missing);
      }
    }

    for (const p of order) {
      const rec = this._records.get(p.id)!;
      if (rec.state !== "registered") continue; // already loaded
      const factory = this._factories.get(p.id)!;
      let instance: HyperforgePlugin<TContext>;
      try {
        instance = factory();
      } catch (e) {
        rec.state = "failed";
        rec.error = e instanceof Error ? e : new Error(String(e));
        throw new PluginLifecycleError(p.id, "load", rec.error);
      }
      rec.instance = instance;
      rec.context = this._contextProvider
        ? this._contextProvider(rec.manifest)
        : (undefined as TContext);
      if (instance.onLoad) {
        try {
          await instance.onLoad(rec.context as TContext);
        } catch (e) {
          rec.state = "failed";
          rec.error = e instanceof Error ? e : new Error(String(e));
          throw new PluginLifecycleError(p.id, "load", rec.error);
        }
      }
      rec.state = "loaded";
    }
  }

  /**
   * Invoke `onEnable` on each already-loaded plugin in dependency
   * order. Plugins in `failed` or `enabled` state are skipped.
   * `registered` plugins (not yet loaded) throw — call `loadAll` first.
   */
  async enableAll(): Promise<void> {
    const order = this._catalog.loadOrder();
    for (const p of order) {
      const rec = this._records.get(p.id)!;
      if (rec.state === "failed") continue;
      if (rec.state === "enabled") continue;
      if (rec.state === "registered") {
        throw new Error(
          `plugin "${p.id}" not loaded — call loadAll() before enableAll()`,
        );
      }
      const instance = rec.instance;
      if (instance?.onEnable) {
        try {
          await instance.onEnable(rec.context as TContext);
        } catch (e) {
          rec.state = "failed";
          rec.error = e instanceof Error ? e : new Error(String(e));
          throw new PluginLifecycleError(p.id, "enable", rec.error);
        }
      }
      rec.state = "enabled";
    }
  }

  /**
   * Invoke `onDisable` in REVERSE dependency order. Plugins not
   * currently enabled are skipped. A throwing `onDisable` promotes
   * the plugin to `failed` and surfaces a `PluginLifecycleError`,
   * but remaining plugins are still disabled (best-effort teardown).
   */
  async disableAll(): Promise<void> {
    const order = [...this._catalog.loadOrder()].reverse();
    const errors: PluginLifecycleError[] = [];
    for (const p of order) {
      const rec = this._records.get(p.id)!;
      if (rec.state !== "enabled") continue;
      const instance = rec.instance;
      if (instance?.onDisable) {
        try {
          await instance.onDisable(rec.context as TContext);
        } catch (e) {
          rec.state = "failed";
          rec.error = e instanceof Error ? e : new Error(String(e));
          errors.push(new PluginLifecycleError(p.id, "disable", rec.error));
          continue;
        }
      }
      rec.state = "disabled";
    }
    if (errors.length > 0) {
      // Surface the first error; caller can inspect `records` for others.
      throw errors[0];
    }
  }

  /**
   * Enable a single plugin.
   *
   * State transitions:
   *   - `loaded` | `disabled` → `enabled` (invokes `onEnable`)
   *   - `enabled`             → no-op
   *   - `registered`          → throws (call `loadAll` first)
   *   - `failed`              → throws (reload first to clear)
   *
   * Enforces that every hard dependency is currently `enabled` —
   * otherwise throws `MissingHardDependencyError` listing the deps
   * that are not enabled (including ones that exist but are
   * disabled/failed/etc.).
   *
   * On `onEnable` throwing, the record transitions to `failed` and
   * a `PluginLifecycleError` surfaces.
   */
  async enablePlugin(pluginId: string): Promise<void> {
    const rec = this._mustHaveRecord(pluginId);
    if (rec.state === "enabled") return;
    if (rec.state === "registered") {
      throw new Error(
        `plugin "${pluginId}" not loaded — call loadAll() before enablePlugin()`,
      );
    }
    if (rec.state === "failed") {
      throw new Error(
        `plugin "${pluginId}" is in failed state — reload before enabling`,
      );
    }
    // state ∈ {loaded, disabled}
    const notEnabledDeps = this._catalog
      .hardDependencyIds(pluginId)
      .filter((depId) => {
        const depRec = this._records.get(depId);
        return !depRec || depRec.state !== "enabled";
      });
    if (notEnabledDeps.length > 0) {
      throw new MissingHardDependencyError(pluginId, notEnabledDeps);
    }
    const instance = rec.instance;
    if (instance?.onEnable) {
      try {
        await instance.onEnable(rec.context as TContext);
      } catch (e) {
        rec.state = "failed";
        rec.error = e instanceof Error ? e : new Error(String(e));
        throw new PluginLifecycleError(pluginId, "enable", rec.error);
      }
    }
    rec.state = "enabled";
  }

  /**
   * Disable a single plugin.
   *
   * State transitions:
   *   - `enabled` → `disabled` (invokes `onDisable`)
   *   - otherwise → no-op
   *
   * Refuses if any OTHER currently-enabled plugin has this one as a
   * hard dependency, unless `options.force` is `true`. In force
   * mode, dependents are left running in an unsupported state — the
   * UE5 equivalent of "I know what I'm doing". Editors should
   * present `computeDisableImpact` before force-disabling.
   *
   * On `onDisable` throwing, the record transitions to `failed` and
   * a `PluginLifecycleError` surfaces.
   */
  async disablePlugin(
    pluginId: string,
    options: { readonly force?: boolean } = {},
  ): Promise<void> {
    const rec = this._mustHaveRecord(pluginId);
    if (rec.state !== "enabled") return;
    if (!options.force) {
      const enabledDependents: string[] = [];
      for (const other of this._records.values()) {
        if (other.state !== "enabled") continue;
        if (other.manifest.id === pluginId) continue;
        if (
          this._catalog.hardDependencyIds(other.manifest.id).includes(pluginId)
        ) {
          enabledDependents.push(other.manifest.id);
        }
      }
      if (enabledDependents.length > 0) {
        throw new Error(
          `plugin "${pluginId}" cannot be disabled — enabled dependents: ${enabledDependents.join(", ")} (pass force=true to override)`,
        );
      }
    }
    const instance = rec.instance;
    if (instance?.onDisable) {
      try {
        await instance.onDisable(rec.context as TContext);
      } catch (e) {
        rec.state = "failed";
        rec.error = e instanceof Error ? e : new Error(String(e));
        throw new PluginLifecycleError(pluginId, "disable", rec.error);
      }
    }
    rec.state = "disabled";
  }

  /**
   * Reload a single plugin: disable (if enabled), then re-instantiate
   * the factory, re-run `onLoad`, and restore the original state.
   *
   * Post-conditions mirror pre-state:
   *   - was `enabled`  → ends `enabled` (fresh instance)
   *   - was `loaded`   → ends `loaded`
   *   - was `disabled` → ends `disabled`
   *   - was `failed`   → ends `loaded` on success (clears failure)
   *
   * Throws if state is `registered` (never loaded — nothing to
   * reload). Any lifecycle failure during the rebuild leaves the
   * plugin in `failed` and surfaces a `PluginLifecycleError`.
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    const rec = this._mustHaveRecord(pluginId);
    if (rec.state === "registered") {
      throw new Error(
        `plugin "${pluginId}" not loaded — cannot reload (call loadAll first)`,
      );
    }
    const factory = this._factories.get(pluginId);
    if (!factory) throw new MissingPluginFactoryError(pluginId);
    const wasEnabled = rec.state === "enabled";

    if (wasEnabled) {
      // Drain via onDisable (host-wrapped factory also drains scope).
      await this.disablePlugin(pluginId, { force: true });
      // If disablePlugin threw it already promoted to failed; won't reach here.
    }

    // Re-instantiate.
    let instance: HyperforgePlugin<TContext>;
    try {
      instance = factory();
    } catch (e) {
      rec.state = "failed";
      rec.error = e instanceof Error ? e : new Error(String(e));
      throw new PluginLifecycleError(pluginId, "load", rec.error);
    }
    rec.instance = instance;
    rec.error = null;
    rec.context = this._contextProvider
      ? this._contextProvider(rec.manifest)
      : (undefined as TContext);
    if (instance.onLoad) {
      try {
        await instance.onLoad(rec.context as TContext);
      } catch (e) {
        rec.state = "failed";
        rec.error = e instanceof Error ? e : new Error(String(e));
        throw new PluginLifecycleError(pluginId, "load", rec.error);
      }
    }
    rec.state = "loaded";

    if (wasEnabled) {
      await this.enablePlugin(pluginId);
    }
  }

  private _mustHaveRecord(pluginId: string): MutableRecord<TContext> {
    const rec = this._records.get(pluginId);
    if (!rec) {
      throw new Error(
        `plugin "${pluginId}" not in catalog — cannot mutate lifecycle`,
      );
    }
    return rec;
  }
}
