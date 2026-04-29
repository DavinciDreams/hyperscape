/**
 * `devApi.ts` — runtime pack-loading surface for the live client.
 *
 * Installs `window.hyperforge` with three methods:
 *
 *   loadPack(input)    — accepts a UIPackManifest object or a JSON
 *                        string, validates it, registers it, and
 *                        sets it as active. The existing
 *                        `useActiveUIPack` hook (subscribed via
 *                        `useSyncExternalStore`) re-fires the
 *                        ManifestHud on the next React commit.
 *
 *   clearPack()        — drops the active pack pointer; HUD falls
 *                        back to the default layout.
 *
 *   getActivePack()    — current `LoadedUIPack` or null. Useful to
 *                        confirm a swap landed.
 *
 * What this enables: paste any UIPackManifest JSON into devtools and
 * watch the running HUD swap, without restarting the client. The
 * agent-runner's `examples/live-agent.ts` emits exactly this shape
 * on `result.lastUIPack` — copy that JSON into the console as
 * `window.hyperforge.loadPack(<json>)` and the agent's design
 * renders live.
 *
 * Safety: this is dev/test only. Production builds can omit calling
 * `installRuntimeDevApi` and the surface won't exist. The function
 * is idempotent — multiple calls just rebind.
 */

import type { LoadedUIPack, UIPackManifest } from "@hyperforge/ui-framework";
import { loadUIPackOnClient } from "./uiPackLoader";
import { getActiveUIPack, setActiveUIPack } from "./uiPackRegistry";

export interface RuntimeDevApi {
  /**
   * Validate, register, activate. Accepts a `UIPackManifest`
   * object or a JSON string. Throws on validation failure with
   * the Zod issue list — callers that want non-throwing semantics
   * should wrap in try/catch or use `loadUIPackOnClient` directly.
   */
  loadPack: (input: UIPackManifest | string) => LoadedUIPack;
  /** Drop the active pack pointer; HUD falls back to default layout. */
  clearPack: () => void;
  /** Current active pack, or null. */
  getActivePack: () => LoadedUIPack | null;
}

declare global {
  // eslint-disable-next-line no-var
  var hyperforge: RuntimeDevApi | undefined;
}

export function installRuntimeDevApi(): RuntimeDevApi {
  const api: RuntimeDevApi = {
    loadPack(input) {
      const parsed = typeof input === "string" ? JSON.parse(input) : input;
      const result = loadUIPackOnClient(parsed);
      if (!result.ok) {
        const lines = result.error.issues.map(
          (i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`,
        );
        throw new Error(
          `hyperforge.loadPack: pack invalid — ${result.error.issues.length} issue(s):\n${lines.join("\n")}`,
        );
      }
      return result.loaded;
    },
    clearPack() {
      setActiveUIPack(null);
    },
    getActivePack() {
      return getActiveUIPack();
    },
  };

  if (typeof globalThis !== "undefined") {
    (globalThis as { hyperforge?: RuntimeDevApi }).hyperforge = api;
  }
  return api;
}
