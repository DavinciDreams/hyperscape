/**
 * Real-filesystem integration test for `startPluginSessionFromCatalog`.
 *
 * Unlike `session.test.ts`, this test does NOT mock the importer or the
 * manifest loader — it points at the built `@hyperforge/plugin-hello-reference`
 * package on disk, runs the full pipeline through real `fs.readFile` +
 * real dynamic `import()`, and proves:
 *   1. A host can boot a real plugin directory in one call.
 *   2. `contextFactory` can return a plugin-specific shape that extends
 *      `PluginContextBase`.
 *   3. `onEnable` runs inside `startPluginsInOrder` and mutates
 *      host-owned state via the context's author-defined methods.
 *   4. `session.stop()` drains scopes and unwinds that state.
 *
 * If the hello-reference package's `dist/` is missing, this fails loudly
 * — a stale dist IS a real regression the unit tests can't catch.
 *
 * NOTE: We intentionally do NOT take a package dep on
 * `@hyperforge/plugin-hello-reference`. The gameplay-framework package is
 * the base of the plugin architecture; its test suite proves the author
 * surface is sufficient WITHOUT coupling back to reference plugins. The
 * inline types below mirror hello-reference's public context shape.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  startPluginSessionFromCatalog,
  type PluginContextBase,
  type PluginContextScopeHandle,
} from "../index.js";

/**
 * Shape of the context the hello-reference plugin's `onEnable` expects.
 * Mirrored inline — see package note in the file header.
 */
interface HelloContext extends PluginContextBase {
  addGreeting(name: string, text: string): void;
}

const THIS_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
// __tests__/session.integration.test.ts → package root → packages/ parent.
const PACKAGES_DIR = path.resolve(THIS_FILE_DIR, "..", "..", "..");

describe("startPluginSessionFromCatalog — real-fs integration", () => {
  it("boots hello-reference end-to-end + stop() unwinds service state", async () => {
    // Host-owned state: a bare registry the reference plugin will populate.
    const registry = new Map<string, string>();

    // Scope `directoryLister` to just the one package so this test doesn't
    // enumerate every sibling package in the monorepo. Everything else
    // (manifest loader, importer, plugin dispatch) runs unmocked.
    const session = await startPluginSessionFromCatalog<HelloContext>(
      PACKAGES_DIR,
      {
        directoryLister: async () => ["plugin-hello-reference"],
        contextFactory: ({
          pluginId,
          scope,
        }: {
          pluginId: string;
          scope: PluginContextScopeHandle;
        }): HelloContext => ({
          pluginId,
          scope,
          addGreeting(name, text) {
            registry.set(name, text);
            scope.register(() => {
              registry.delete(name);
            });
          },
        }),
      },
    );

    // Pipeline success: exactly one plugin loaded, no failures.
    expect(session.failedPackages).toEqual([]);
    expect(session.unresolvable).toEqual([]);
    expect(session.records).toHaveLength(1);
    expect(session.records[0]!.manifest.id).toBe(
      "com.hyperforge.plugin-hello-reference",
    );

    // The plugin's default factory is `helloReferencePluginFactory("world",
    // "hello, world")` — its `onEnable` registers that greeting through
    // the ctx-bound `addGreeting` we supplied.
    expect(registry.size).toBe(1);
    expect(registry.get("world")).toBe("hello, world");

    // Graceful shutdown drains the scope — registry entry removed.
    await session.stop();
    expect(registry.size).toBe(0);
  });
});
