/**
 * Theme registry — unit tests.
 *
 * Covers the runtime theme-by-id lookup that `ManifestHud` passes to
 * `ManifestRenderer` as `resolveTheme`. The registry seeds itself
 * with `hyperscape.dark` on import; we reset between tests via the
 * exported test hook to keep cases isolated.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  HYPERSCAPE_DARK_THEME,
  type ThemeManifest,
} from "@hyperforge/ui-framework";

import {
  _resetThemeRegistryForTests,
  listRegisteredThemes,
  registerTheme,
  resolveThemeById,
  unregisterTheme,
} from "@/ui-framework/themeRegistry";

function makeTheme(overrides: Partial<ThemeManifest> = {}): ThemeManifest {
  return {
    id: "theme.custom",
    name: "Custom",
    colors: { primary: "#112233" },
    spacing: { md: "8px" },
    radii: {},
    fontFamilies: {},
    fontSizes: {},
    fontWeights: {},
    lineHeights: {},
    shadows: {},
    zIndices: {},
    durations: {},
    ...overrides,
  } as ThemeManifest;
}

beforeEach(() => {
  _resetThemeRegistryForTests();
});

describe("themeRegistry", () => {
  it("seeds hyperscape.dark on import", () => {
    const resolved = resolveThemeById(HYPERSCAPE_DARK_THEME.id);
    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe(HYPERSCAPE_DARK_THEME.id);
  });

  it("listRegisteredThemes includes the builtin after reset", () => {
    expect(listRegisteredThemes()).toContain(HYPERSCAPE_DARK_THEME.id);
  });

  it("resolveThemeById returns null for unknown ids", () => {
    expect(resolveThemeById("theme.does-not-exist")).toBeNull();
  });

  it("registerTheme writes a valid theme and returns true", () => {
    const theme = makeTheme({ id: "theme.custom-a" });
    expect(registerTheme(theme)).toBe(true);
    expect(resolveThemeById("theme.custom-a")?.id).toBe("theme.custom-a");
  });

  it("registerTheme rejects invalid themes without writing", () => {
    // Missing required `id` / `name` + wrong-shaped colors.
    const bad = { colors: "not an object" } as unknown as ThemeManifest;
    expect(registerTheme(bad)).toBe(false);
    // Nothing got written under any obvious id.
    expect(listRegisteredThemes()).toEqual([HYPERSCAPE_DARK_THEME.id]);
  });

  it("registerTheme replaces an existing theme with the same id", () => {
    const first = makeTheme({
      id: "theme.replaceable",
      colors: { primary: "#111111" },
    });
    const second = makeTheme({
      id: "theme.replaceable",
      colors: { primary: "#222222" },
    });
    registerTheme(first);
    registerTheme(second);
    expect(resolveThemeById("theme.replaceable")?.colors.primary).toBe(
      "#222222",
    );
  });

  it("unregisterTheme removes the theme", () => {
    registerTheme(makeTheme({ id: "theme.temp" }));
    expect(resolveThemeById("theme.temp")).not.toBeNull();
    unregisterTheme("theme.temp");
    expect(resolveThemeById("theme.temp")).toBeNull();
  });

  it("unregisterTheme is a no-op for unknown ids", () => {
    const before = listRegisteredThemes().sort();
    unregisterTheme("theme.never-existed");
    const after = listRegisteredThemes().sort();
    expect(after).toEqual(before);
  });

  it("_resetThemeRegistryForTests wipes custom themes and re-seeds builtins", () => {
    registerTheme(makeTheme({ id: "theme.custom-reset" }));
    expect(resolveThemeById("theme.custom-reset")).not.toBeNull();
    _resetThemeRegistryForTests();
    expect(resolveThemeById("theme.custom-reset")).toBeNull();
    expect(resolveThemeById(HYPERSCAPE_DARK_THEME.id)).not.toBeNull();
  });

  it("_resetThemeRegistryForTests re-seeds builtins even after unregistering them", () => {
    unregisterTheme(HYPERSCAPE_DARK_THEME.id);
    expect(resolveThemeById(HYPERSCAPE_DARK_THEME.id)).toBeNull();
    _resetThemeRegistryForTests();
    expect(resolveThemeById(HYPERSCAPE_DARK_THEME.id)).not.toBeNull();
  });
});
