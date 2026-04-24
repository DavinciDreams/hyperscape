/**
 * Hello reference plugin (I2 reference).
 *
 * Minimal end-to-end demonstration of the Phase I plugin pipeline:
 *   - `PluginCatalog` holds authored `PluginManifest`s
 *   - `PluginLoader<HelloContext>` drives the lifecycle
 *   - A `PluginContextProvider` builds a per-plugin `HelloContext`
 *     that bundles a fresh `PluginContextScope` + registration helpers
 *   - Plugins register disposable work via the context; the scope
 *     cleans up on disable (via a factory wrapper so `onDisable`
 *     auto-calls `scope.dispose()`)
 *
 * This file is intentionally tiny — its job is to be the smallest
 * thing that exercises every seam of the plugin substrate so the
 * integration test can prove the full loop end-to-end.
 */

import type { PluginManifest } from "@hyperforge/manifest-schema";
import { PluginContextScope } from "../PluginContextScope.js";
import type {
  HyperforgePlugin,
  PluginContextProvider,
  PluginFactory,
} from "../PluginLoader.js";

/**
 * Minimal service surface the reference plugin touches. A real
 * `PluginContext` would expose world/registry/widget handles; here
 * we keep it to a single in-memory registry the test can inspect.
 */
export interface HelloService {
  registerGreeting(name: string, text: string): void;
  unregisterGreeting(name: string): void;
  list(): ReadonlyMap<string, string>;
}

export function createHelloService(): HelloService {
  const entries = new Map<string, string>();
  return {
    registerGreeting(name, text) {
      if (entries.has(name)) {
        throw new Error(`greeting "${name}" already registered`);
      }
      entries.set(name, text);
    },
    unregisterGreeting(name) {
      entries.delete(name);
    },
    list() {
      return entries;
    },
  };
}

/** Per-plugin context handed to `HelloReferencePlugin` hooks. */
export interface HelloContext {
  readonly pluginId: string;
  readonly scope: PluginContextScope;
  /** Scope-tracked greeting registration. */
  addGreeting(name: string, text: string): void;
}

/**
 * Build a `PluginContextProvider` that constructs a `HelloContext`
 * per plugin. Disposers are attached to the scope automatically so
 * the factory wrapper only needs to call `scope.dispose()` on
 * disable.
 */
export function buildHelloContextProvider(
  service: HelloService,
): PluginContextProvider<HelloContext> {
  return (manifest: PluginManifest) => {
    const scope = new PluginContextScope(manifest.id);
    return {
      pluginId: manifest.id,
      scope,
      addGreeting(name, text) {
        service.registerGreeting(name, text);
        scope.register(() => service.unregisterGreeting(name));
      },
    };
  };
}

/**
 * Reference plugin that registers a single greeting on enable. The
 * scope auto-undoes it on disable (via the factory wrapper below).
 */
export function helloReferencePlugin(
  name: string,
  text: string,
): HyperforgePlugin<HelloContext> {
  return {
    onEnable(ctx) {
      ctx.addGreeting(name, text);
    },
    // No explicit onDisable — the wrapper calls scope.dispose() for us.
  };
}

/**
 * Wrap an existing factory so its `onDisable` automatically drains
 * the context scope. Lets plugin authors register disposables in
 * `onLoad`/`onEnable` without boilerplate in every `onDisable`.
 */
export function withScopeDispose<
  TContext extends { scope: PluginContextScope },
>(factory: PluginFactory<TContext>): PluginFactory<TContext> {
  return () => {
    const user = factory();
    return {
      onLoad: user.onLoad ? (ctx) => user.onLoad!(ctx) : undefined,
      onEnable: user.onEnable ? (ctx) => user.onEnable!(ctx) : undefined,
      onDisable: async (ctx) => {
        try {
          await user.onDisable?.(ctx);
        } finally {
          await ctx.scope.dispose();
        }
      },
    };
  };
}
