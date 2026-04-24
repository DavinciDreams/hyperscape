/**
 * theme.ts — apply a `@hyperforge/ui-framework` ThemeManifest as
 * CSS custom properties on a given root element (default: `:root`).
 *
 * This is the runtime complement to `ThemeManifestSchema` +
 * `themeToCssVars`: call `applyTheme(HYPERSCAPE_DARK_THEME)` once at
 * client bootstrap and every `var(--color-primary)` / `var(--bg-*)`
 * lookup in the stylesheet resolves correctly.
 */

import {
  HYPERSCAPE_DARK_THEME,
  themeToCssVars,
  type ThemeManifest,
  type ThemeToCssVarsOptions,
} from "@hyperforge/ui-framework";

export interface ApplyThemeOptions extends ThemeToCssVarsOptions {
  /**
   * Element to set the CSS variables on. Defaults to
   * `document.documentElement` (`:root`).
   */
  target?: HTMLElement;
}

/**
 * Flatten `theme` into CSS vars and set them on `options.target`
 * (defaults to `document.documentElement`). Returns the vars map
 * that was applied so tests can assert against it.
 */
export function applyTheme(
  theme: ThemeManifest,
  options: ApplyThemeOptions = {},
): Record<string, string> {
  const { target, ...varOptions } = options;
  const vars = themeToCssVars(theme, varOptions);
  const el =
    target ??
    (typeof document !== "undefined" ? document.documentElement : null);
  if (el) {
    for (const [name, value] of Object.entries(vars)) {
      el.style.setProperty(name, value);
    }
  }
  return vars;
}

/** Convenience: apply the canonical Hyperscape dark theme. */
export function applyDefaultTheme(): Record<string, string> {
  return applyTheme(HYPERSCAPE_DARK_THEME);
}
