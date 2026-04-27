/**
 * DataSourceRegistry — pluggable provider for binding namespaces.
 *
 * The runtime-bindings layer (`bindings.ts`) operates over a flat
 * `DataContext` shape: `{ player: {...}, inventory: {...}, ... }`.
 * Historically the host (the client) hand-rolled this map by calling
 * a per-app `buildXxxDataContext(state)` function. That pattern works
 * but ties the namespace surface to the host bundle: a plugin can't
 * contribute its own namespace without monkey-patching the bridge.
 *
 * `DataSourceRegistry` inverts the dependency. The host owns the
 * registry instance and the source-of-truth state; plugins call
 * `registry.register({ key, build })` to contribute namespaces. At
 * render time the host calls `registry.buildContext(state)` to
 * project the state through every registered source and produce a
 * `DataContext` for the bindings layer.
 *
 * Phase D8 of the AAA-completion plan. Closes the contract gap that
 * makes "ship a different `ui-pack.json` and get a different game's
 * UI" work — third-party UI packs can ship their own data sources
 * without touching the host.
 *
 * Typing model:
 *   - `TState` is the shape the host-provided state takes (e.g.
 *     `PlayerDataSnapshot` for Hyperscape's HUD). All sources
 *     registered against a given registry instance share this type
 *     so the registry can pass `state` to every `build` call.
 *   - Sources project that state into their own value type — the
 *     `DataContext` is `Record<string, unknown>`, so we don't try to
 *     constrain individual namespace shapes here. Bindings already
 *     short-circuit on `undefined`.
 */

import type { DataContext } from "./bindings";

/**
 * A single namespaced data source. `key` becomes the top-level
 * namespace identifier in the resulting `DataContext` — bindings
 * reference it without the `$` prefix used in the source manifest
 * (the prefix is stripped by the bindings parser).
 */
export interface DataSource<TState = unknown, TValue = unknown> {
  /** Namespace identifier (without `$`). Must be unique per registry. */
  readonly key: string;
  /**
   * Project the host-provided state into this namespace's value.
   * Called every time `buildContext` runs; should be cheap (the host
   * typically wraps the resulting `DataContext` in `useMemo`).
   */
  build(state: TState): TValue;
}

/**
 * Pluggable registry of `DataSource`s. Single-host-owned instance —
 * shared between the bindings runtime and plugins.
 */
export class DataSourceRegistry<TState = unknown> {
  private readonly sources = new Map<string, DataSource<TState>>();

  /**
   * Register a data source. Throws if `source.key` is already taken;
   * deliberate, mirrors `WidgetRegistry.bindComponent` so
   * double-registration is a loud error rather than silent
   * shadowing.
   *
   * @returns An unregister callback. Call it on plugin teardown to
   *   remove the source from the registry without leaking.
   */
  register(source: DataSource<TState>): () => void {
    if (this.sources.has(source.key)) {
      throw new Error(
        `DataSourceRegistry: namespace "${source.key}" is already registered. ` +
          `If a plugin needs to extend an existing namespace, the host should ` +
          `re-register a composite source rather than double-registering.`,
      );
    }
    this.sources.set(source.key, source);
    return () => {
      this.sources.delete(source.key);
    };
  }

  /** Look up a source by key. Useful for tests + introspection. */
  get(key: string): DataSource<TState> | undefined {
    return this.sources.get(key);
  }

  /** List registered namespace keys, in registration order. */
  keys(): string[] {
    return Array.from(this.sources.keys());
  }

  /** Number of registered sources. */
  get size(): number {
    return this.sources.size;
  }

  /**
   * Build a `DataContext` by projecting `state` through every
   * registered source. The returned object's keys are the registered
   * source `key` values; iteration order matches registration order.
   */
  buildContext(state: TState): DataContext {
    const ctx: DataContext = {};
    for (const [key, source] of this.sources) {
      ctx[key] = source.build(state);
    }
    return ctx;
  }

  /**
   * Remove every registered source. Mainly useful in test setup to
   * isolate cases.
   */
  clear(): void {
    this.sources.clear();
  }
}
