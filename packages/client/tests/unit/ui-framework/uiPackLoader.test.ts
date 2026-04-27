/**
 * Tests for uiPackLoader — the D9 client-side bridge that wires
 * `loadUIPack` to the local `themeRegistry`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadHyperscapeUIPack,
  loadUIPackOnClient,
} from "@/ui-framework/uiPackLoader";
import {
  _resetThemeRegistryForTests,
  resolveThemeById,
  unregisterTheme,
} from "@/ui-framework/themeRegistry";
import { HYPERSCAPE_UI_PACK } from "@/ui-framework/hyperscapePack";

describe("uiPackLoader", () => {
  beforeEach(() => {
    _resetThemeRegistryForTests();
  });

  afterEach(() => {
    _resetThemeRegistryForTests();
  });

  describe("loadUIPackOnClient", () => {
    it("returns ok=true and registers the pack's theme", () => {
      // Remove the dark theme so we can verify the loader registers it.
      unregisterTheme("hyperscape.dark");
      expect(resolveThemeById("hyperscape.dark")).toBeNull();

      const result = loadUIPackOnClient(HYPERSCAPE_UI_PACK);
      expect(result.ok).toBe(true);
      // Theme is now back in the registry — the loader put it there.
      expect(resolveThemeById("hyperscape.dark")).not.toBeNull();
    });

    it("returns ok=false for an invalid manifest", () => {
      const result = loadUIPackOnClient({ version: 1, id: "bad" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it("does not touch the theme registry on validation failure", () => {
      unregisterTheme("hyperscape.dark");
      loadUIPackOnClient({ version: 1, id: "bad" });
      expect(resolveThemeById("hyperscape.dark")).toBeNull();
    });
  });

  describe("loadHyperscapeUIPack", () => {
    it("returns a LoadedUIPack with the expected id and default layout", () => {
      const loaded = loadHyperscapeUIPack();
      expect(loaded.id).toBe("hyperscape.default");
      expect(loaded.defaultLayout.id).toBe("hyperscape.default");
      expect(loaded.theme?.id).toBe("hyperscape.dark");
    });

    it("registers the Hyperscape dark theme", () => {
      unregisterTheme("hyperscape.dark");
      loadHyperscapeUIPack();
      expect(resolveThemeById("hyperscape.dark")).not.toBeNull();
    });
  });
});
