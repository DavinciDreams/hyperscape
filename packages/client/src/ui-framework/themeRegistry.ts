/**
 * themeRegistry.ts — runtime theme-by-id lookup for `ManifestHud`.
 *
 * `UILayoutManifestSchema` lets authors reference a theme by `themeId`
 * (a loose string) instead of inlining the whole `ThemeManifest`. At
 * runtime the renderer needs a way to turn that id back into a real
 * manifest — hence this registry.
 *
 * The module also acts as the compile-time *default* index. We
 * pre-register `hyperscape.dark` so existing layouts that simply
 * reference `themeId: "hyperscape.dark"` work without any
 * integration step. Additional themes can be registered at runtime
 * (e.g. an upcoming "ThemePanel" in World Studio may dispatch
 * `registerTheme(livePreviewTheme)` whenever the author tweaks a
 * token).
 *
 * Intentionally tiny + synchronous — the renderer reads through
 * `resolveThemeById` once per layout change, which is rare. No
 * persistence, no network. Themes loaded from a user-authored
 * manifest belong in the layout's inline `theme` field.
 */

import {
  HYPERSCAPE_DARK_THEME,
  type ThemeManifest,
  validateTheme,
} from "@hyperforge/ui-framework";

const registry = new Map<string, ThemeManifest>();

function seedBuiltins(): void {
  if (!registry.has(HYPERSCAPE_DARK_THEME.id)) {
    registry.set(HYPERSCAPE_DARK_THEME.id, HYPERSCAPE_DARK_THEME);
  }
}

// Seed lazily the first time the module is imported — safe in both
// browser and jsdom environments.
seedBuiltins();

/**
 * Register (or replace) a theme by id. Returns `true` on success,
 * `false` when the theme fails schema validation — invalid themes
 * are never written to the registry so a bad live-preview edit
 * can't corrupt the id→theme mapping.
 */
export function registerTheme(theme: ThemeManifest): boolean {
  const result = validateTheme(theme);
  if (!result.ok) return false;
  registry.set(result.theme.id, result.theme);
  return true;
}

/**
 * Remove a theme by id. No-ops when the id isn't registered.
 * Built-in themes can be unregistered — callers that need the
 * Hyperscape defaults back should re-register from the exported
 * constant.
 */
export function unregisterTheme(id: string): void {
  registry.delete(id);
}

/**
 * Look up a theme manifest by id. Returns `null` when the id is
 * unknown so `ManifestRenderer`'s resolver can no-op cleanly.
 */
export function resolveThemeById(id: string): ThemeManifest | null {
  return registry.get(id) ?? null;
}

/** Full list of currently-registered theme ids (for UI). */
export function listRegisteredThemes(): string[] {
  return Array.from(registry.keys());
}

/** Reset the registry to its built-in seed — test hook only. */
export function _resetThemeRegistryForTests(): void {
  registry.clear();
  seedBuiltins();
}
