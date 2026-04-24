/**
 * @hyperforge/plugin-hello-reference
 *
 * Minimal external reference plugin. Proves the
 * `@hyperforge/gameplay-framework` author surface is sufficient to
 * build a real plugin package without reaching into
 * `@hyperforge/shared` internals.
 *
 * Shape mirrors the in-tree `HelloReferencePlugin` (shared plugin
 * substrate) but lives in its own package with its own `plugin.json`
 * — the exact deployment shape community plugins will ship in.
 *
 * Lifecycle:
 *   - `onEnable(ctx)` registers a single greeting on the caller-
 *     supplied `HelloService` and attaches the unregister call to
 *     `ctx.scope` so it unwinds automatically on disable.
 *   - No explicit `onDisable` — the host's scope drain handles teardown
 *     provided the factory is wrapped with the host's own
 *     `wrapWithScopeDispose` (or equivalent) behavior.
 */

import type {
  HyperforgePlugin,
  PluginContextBase,
  PluginFactory,
} from "@hyperforge/gameplay-framework";

/** Registry the plugin writes into. Callers supply an implementation. */
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

/** Per-plugin context handed to the hello reference plugin's hooks. */
export interface HelloContext extends PluginContextBase {
  /** Register a greeting and track cleanup on the scope. */
  addGreeting(name: string, text: string): void;
}

/**
 * Factory that creates the hello reference plugin instance.
 *
 * Parameterized by the greeting payload so tests / downstream
 * integrations can produce different instances without rebuilding
 * the package.
 */
export function helloReferencePluginFactory(
  name: string,
  text: string,
): PluginFactory<HelloContext> {
  return () => {
    const plugin: HyperforgePlugin<HelloContext> = {
      onEnable(ctx) {
        ctx.addGreeting(name, text);
      },
    };
    return plugin;
  };
}

export { manifest } from "./manifest.js";

/**
 * Default plugin factory — the shape a host loader expects when it
 * calls `import(manifest.entry)`. Bakes in sensible defaults so the
 * plugin is usable end-to-end without caller configuration.
 *
 * Downstream code that wants to parameterize the greeting can still
 * import the named `helloReferencePluginFactory` directly.
 */
const defaultFactory: PluginFactory<HelloContext> = helloReferencePluginFactory(
  "world",
  "hello, world",
);

export default defaultFactory;
