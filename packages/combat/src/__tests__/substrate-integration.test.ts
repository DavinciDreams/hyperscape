/**
 * Substrate integration test.
 *
 * Drives `validatePluginDirectory` from `@hyperforge/gameplay-framework`
 * against the real on-disk package. This is the CI gate that proves
 * the combat plugin's `plugin.json` survives the same validation path
 * the editor's Plugin Browser, the `hyperforge-plugin validate` CLI,
 * and the host's `loadPluginPackage` boot sequence all use.
 *
 * Distinct from `plugin.test.ts`, which exercises the lifecycle hooks
 * in isolation. This file proves the FILE on disk is loadable —
 * complementary, not redundant.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validatePluginDirectory } from "@hyperforge/gameplay-framework";

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__ → src → package root
const PACKAGE_ROOT = resolve(HERE, "..", "..");

describe("@hyperforge/combat — substrate integration", () => {
  it("validatePluginDirectory accepts the on-disk plugin.json", async () => {
    const result = await validatePluginDirectory(PACKAGE_ROOT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      // Defensive — surface details if a future regression hits.
      throw new Error(
        `expected ok=true, got issues:\n${JSON.stringify(result, null, 2)}`,
      );
    }
    expect(result.manifest.id).toBe("com.hyperforge.combat");
    expect(result.manifest.entry).toBe("./dist/index.js");
  });

  it("passes the host-API gate when the host advertises a compatible range", async () => {
    const result = await validatePluginDirectory(PACKAGE_ROOT, {
      hostApiVersion: "0.1.0",
    });
    expect(result.ok).toBe(true);
  });
});
