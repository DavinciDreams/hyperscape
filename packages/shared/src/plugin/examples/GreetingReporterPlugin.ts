/**
 * Greeting reporter reference plugin (I3 reference).
 *
 * Demonstrates the Phase I **plugin-to-plugin** composition pattern
 * on top of the I2 HelloReferencePlugin:
 *   - declares a hard dependency on a greeting-registering plugin via
 *     `PluginManifest.dependencies`
 *   - reads from the shared `HelloService` during `onEnable`
 *   - records what it saw, proving `PluginCatalog.loadOrder()` ran
 *     the upstream plugin's `onEnable` first
 *
 * Why it matters:
 *   Real gameplay plugins don't live in isolation — a combat-tuning
 *   plugin needs the damage-type registry plugin running first, a
 *   quest plugin needs the dialogue plugin running first, and so on.
 *   This reference plugin is the smallest thing that exercises that
 *   seam end-to-end: declared dependency → load order → runtime
 *   service consumption → scope-tracked teardown.
 *
 * The `HelloContext` stays re-usable across both plugins; callers
 * just plumb the same `buildHelloContextProvider(service)` through.
 */

import type { HelloContext, HelloService } from "./HelloReferencePlugin.js";
import type { HyperforgePlugin } from "../PluginLoader.js";

/**
 * Snapshot of greetings observed at the moment the reporter was
 * enabled. Callers (tests, HUD panels, debug overlays) read this
 * after `enableAll()` to see what the reporter saw.
 */
export interface GreetingReport {
  readonly observedAt: "onEnable";
  readonly greetings: ReadonlyArray<{
    readonly name: string;
    readonly text: string;
  }>;
}

/**
 * In-memory sink the reporter plugin writes into. Caller-owned so
 * test code / editor overlays can inspect it after lifecycle runs.
 * Plain object so it can be stored on a `PluginContextBase`-shaped
 * context without adding new class types.
 */
export interface GreetingReportSink {
  latest: GreetingReport | null;
}

export function createGreetingReportSink(): GreetingReportSink {
  return { latest: null };
}

/**
 * Build a reporter plugin that reads the live greeting list from
 * `service` on enable and writes a snapshot into `sink.latest`.
 *
 * Clears `sink.latest` on disable so the next enable cycle starts
 * clean. Teardown is registered via the shared scope — the
 * `withScopeDispose` wrapper applied by the test harness (or by
 * `PluginHost`) will call `scope.dispose()` automatically.
 */
export function greetingReporterPlugin(
  service: HelloService,
  sink: GreetingReportSink,
): HyperforgePlugin<HelloContext> {
  return {
    onEnable(ctx) {
      const greetings = Array.from(service.list().entries()).map(
        ([name, text]) => ({ name, text }),
      );
      sink.latest = { observedAt: "onEnable", greetings };
      ctx.scope.register(() => {
        sink.latest = null;
      });
    },
  };
}
