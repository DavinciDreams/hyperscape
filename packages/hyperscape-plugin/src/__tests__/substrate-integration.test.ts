/**
 * Substrate integration test for the Hyperia meta-plugin.
 *
 * Drives `validatePluginDirectory` from `@hyperforge/gameplay-framework`
 * against the real on-disk package. This is the CI gate that proves
 * the meta-plugin's `plugin.json` survives the same validation path
 * the editor's Plugin Browser, the `hyperforge-plugin validate` CLI,
 * and the host's `loadPluginPackage` boot sequence all use.
 *
 * Mirrors `@hyperforge/combat`'s substrate-integration.test.ts —
 * each external plugin package ships one of these to lock the
 * on-disk gate in CI.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validatePluginDirectory } from "@hyperforge/gameplay-framework";

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__ → src → package root
const PACKAGE_ROOT = resolve(HERE, "..", "..");

describe("@hyperforge/hyperscape — substrate integration", () => {
  it("validatePluginDirectory accepts the on-disk plugin.json", async () => {
    const result = await validatePluginDirectory(PACKAGE_ROOT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(
        `expected ok=true, got issues:\n${JSON.stringify(result, null, 2)}`,
      );
    }
    expect(result.manifest.id).toBe("com.hyperforge.hyperscape");
    expect(result.manifest.entry).toBe("./dist/index.js");
    expect(result.manifest.dependencies).toHaveLength(1);
    expect(result.manifest.dependencies[0]!.id).toBe("com.hyperforge.combat");
  });

  it("passes the host-API gate when the host advertises a compatible range", async () => {
    const result = await validatePluginDirectory(PACKAGE_ROOT, {
      hostApiVersion: "0.1.0",
    });
    expect(result.ok).toBe(true);
  });
});
