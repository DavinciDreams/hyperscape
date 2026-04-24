/**
 * theme.ts — Hyperscape UI theme manifest (Phase D5).
 *
 * Themes are authored as plain JSON/TS objects and validated with Zod.
 * The framework stays presentation-agnostic: a theme is just a
 * structured bag of design tokens (colors, fonts, spacing, radii, …).
 * Consumers decide how to apply them — e.g. `themeToCssVars(theme)`
 * returns a `Record<string, string>` of CSS custom properties that the
 * existing asset-forge stylesheet already consumes
 * (`--color-primary`, `--bg-secondary`, `--text-primary`, …).
 *
 * Tokens are intentionally open-ended (`z.record(string, …)`) so
 * additional semantic roles can be introduced without a framework
 * release. Validation focuses on *value shape* (hex/rgb/var or a CSS
 * length) rather than enforcing a canonical key list.
 */

import { z } from "zod";

// A permissive CSS color value: #RGB, #RGBA, #RRGGBB, #RRGGBBAA, or a
// functional notation (rgb/rgba/hsl/hsla/color/var/currentColor).
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNC_COLOR_RE = /^(rgb|rgba|hsl|hsla|color|var)\(.+\)$/;

export const ThemeColorValueSchema = z
  .string()
  .min(1)
  .refine(
    (v) =>
      HEX_COLOR_RE.test(v) ||
      FUNC_COLOR_RE.test(v) ||
      v === "transparent" ||
      v === "currentColor",
    {
      message:
        "Expected #hex, rgb()/rgba()/hsl()/hsla()/color()/var(), 'transparent', or 'currentColor'",
    },
  );

// A CSS length: "12px", "1.25rem", "0", "0.5em", "100%", or a var().
const CSS_LENGTH_RE =
  /^(0|(-?\d*\.?\d+)(px|rem|em|%|vh|vw|ch|ex))$|^var\(.+\)$/;

export const ThemeSizeValueSchema = z
  .string()
  .min(1)
  .refine((v) => CSS_LENGTH_RE.test(v), {
    message: "Expected a CSS length (e.g. '8px', '1rem', '0', or var(...))",
  });

const tokenMap = <V extends z.ZodTypeAny>(value: V) =>
  z.record(z.string().min(1), value);

/**
 * Full theme manifest schema. All token categories except `id`/`name`
 * are optional so themes can incrementally override a base.
 */
export const ThemeManifestSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().optional(),
    description: z.string().optional(),
    mode: z.enum(["light", "dark", "auto"]).optional(),
    extends: z.string().optional(),

    colors: tokenMap(ThemeColorValueSchema).default({}),
    spacing: tokenMap(ThemeSizeValueSchema).default({}),
    radii: tokenMap(ThemeSizeValueSchema).default({}),
    fontFamilies: tokenMap(z.string().min(1)).default({}),
    fontSizes: tokenMap(ThemeSizeValueSchema).default({}),
    fontWeights: tokenMap(z.number().int().min(1).max(1000)).default({}),
    lineHeights: tokenMap(
      z.union([z.number().positive(), z.string().min(1)]),
    ).default({}),
    shadows: tokenMap(z.string().min(1)).default({}),
    zIndices: tokenMap(z.number().int()).default({}),
    durations: tokenMap(z.string().min(1)).default({}),

    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ThemeManifest = z.infer<typeof ThemeManifestSchema>;

// ── Validation ─────────────────────────────────────────────────────

export const THEME_VALIDATION_CODES = [
  "schema-error",
  "empty-token-category",
] as const;

export type ThemeValidationCode = (typeof THEME_VALIDATION_CODES)[number];

export interface ThemeValidationIssue {
  code: ThemeValidationCode;
  message: string;
  path?: string;
}

export type ThemeValidationResult =
  | { ok: true; theme: ThemeManifest; issues: [] }
  | { ok: false; issues: ThemeValidationIssue[] };

/**
 * Validate a theme manifest. Collects schema errors plus
 * non-blocking warnings (empty named categories).
 */
export function validateTheme(input: unknown): ThemeValidationResult {
  const parsed = ThemeManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "schema-error",
        message: issue.message,
        path: issue.path.map((p) => String(p)).join("."),
      })),
    };
  }

  // Every manifest field `.default({})` fills empty categories,
  // but warn when the theme didn't supply *any* tokens — almost
  // always a user mistake.
  const theme = parsed.data;
  const hasAnyToken =
    Object.keys(theme.colors).length +
      Object.keys(theme.spacing).length +
      Object.keys(theme.fontFamilies).length +
      Object.keys(theme.fontSizes).length +
      Object.keys(theme.radii).length +
      Object.keys(theme.shadows).length >
    0;

  if (!hasAnyToken) {
    return {
      ok: false,
      issues: [
        {
          code: "empty-token-category",
          message:
            "Theme contains no tokens — populate at least one of colors/spacing/fontFamilies/fontSizes/radii/shadows",
        },
      ],
    };
  }

  return { ok: true, theme, issues: [] };
}

// ── CSS var projection ─────────────────────────────────────────────

export interface ThemeToCssVarsOptions {
  /** Prefix to apply to every var name (default: `--`). */
  prefix?: string;
  /**
   * When true, token keys are converted from camelCase and
   * snake_case to kebab-case. Default: `true`.
   */
  kebabize?: boolean;
}

/**
 * Flatten a theme manifest into a `{ --var-name: value }` map,
 * suitable for `Object.assign(element.style, …)` or a generated
 * `:root { … }` stylesheet.
 *
 * Category naming mirrors the existing asset-forge stylesheet:
 *   colors.primary       → --color-primary
 *   spacing.md           → --spacing-md
 *   radii.lg             → --radius-lg
 *   fontFamilies.display → --font-family-display
 *   fontSizes.md         → --font-size-md
 *   fontWeights.bold     → --font-weight-bold
 *   lineHeights.tight    → --line-height-tight
 *   shadows.md           → --shadow-md
 *   zIndices.modal       → --z-modal
 *   durations.fast       → --duration-fast
 */
export function themeToCssVars(
  theme: ThemeManifest,
  options: ThemeToCssVarsOptions = {},
): Record<string, string> {
  const prefix = options.prefix ?? "--";
  const kebabize = options.kebabize ?? true;
  const out: Record<string, string> = {};

  const write = (category: string, key: string, value: unknown) => {
    const token = kebabize ? toKebab(key) : key;
    out[`${prefix}${category}-${token}`] = String(value);
  };

  for (const [k, v] of Object.entries(theme.colors)) write("color", k, v);
  for (const [k, v] of Object.entries(theme.spacing)) write("spacing", k, v);
  for (const [k, v] of Object.entries(theme.radii)) write("radius", k, v);
  for (const [k, v] of Object.entries(theme.fontFamilies))
    write("font-family", k, v);
  for (const [k, v] of Object.entries(theme.fontSizes))
    write("font-size", k, v);
  for (const [k, v] of Object.entries(theme.fontWeights))
    write("font-weight", k, v);
  for (const [k, v] of Object.entries(theme.lineHeights))
    write("line-height", k, v);
  for (const [k, v] of Object.entries(theme.shadows)) write("shadow", k, v);
  for (const [k, v] of Object.entries(theme.zIndices)) write("z", k, v);
  for (const [k, v] of Object.entries(theme.durations)) write("duration", k, v);

  return out;
}

function toKebab(key: string): string {
  return key
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

// ── Default Hyperscape theme ───────────────────────────────────────

/**
 * Hyperscape's dark theme — mirrors the palette currently hard-coded
 * in `packages/asset-forge/src/styles/index.css`. Kept here so the
 * editor has something to render against and downstream consumers
 * can `extends: "hyperscape.dark"` by id.
 */
export const HYPERSCAPE_DARK_THEME: ThemeManifest = ThemeManifestSchema.parse({
  id: "hyperscape.dark",
  name: "Hyperscape Dark",
  mode: "dark",
  description:
    "Default dark palette shared by World Studio and the game client.",
  colors: {
    primary: "#6366f1",
    primaryDark: "#4f46e5",
    primaryLight: "#818cf8",
    secondary: "#8b5cf6",
    secondaryDark: "#7c3aed",
    secondaryLight: "#a78bfa",
    success: "#10b981",
    successDark: "#059669",
    successLight: "#34d399",
    warning: "#f59e0b",
    warningDark: "#d97706",
    warningLight: "#fbbf24",
    error: "#ef4444",
    errorDark: "#dc2626",
    errorLight: "#f87171",
    info: "#3b82f6",
    infoDark: "#2563eb",
    infoLight: "#60a5fa",
    bgPrimary: "#0c0d10",
    bgSecondary: "#141518",
    bgTertiary: "#1c1d22",
    bgCard: "#141518",
    bgHover: "#22232a",
    bgElevated: "#1e1f26",
    textPrimary: "#e8e9ed",
    textSecondary: "#9a9caa",
    textTertiary: "#636577",
    textMuted: "#464860",
    borderPrimary: "#1e2028",
    borderSecondary: "#2a2d38",
    borderHover: "#3a3d4a",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    xxl: "32px",
  },
  radii: {
    sm: "4px",
    md: "6px",
    lg: "8px",
    xl: "12px",
    full: "9999px",
  },
  fontFamilies: {
    sans: "Inter, system-ui, -apple-system, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  fontSizes: {
    xs: "10px",
    sm: "12px",
    md: "14px",
    lg: "16px",
    xl: "20px",
  },
  fontWeights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
  shadows: {
    sm: "0 1px 2px rgba(0,0,0,0.25)",
    md: "0 4px 8px rgba(0,0,0,0.3)",
    lg: "0 10px 24px rgba(0,0,0,0.35)",
  },
  zIndices: {
    dropdown: 1000,
    modal: 2000,
    toast: 3000,
  },
  durations: {
    fast: "120ms",
    base: "200ms",
    slow: "320ms",
  },
});
