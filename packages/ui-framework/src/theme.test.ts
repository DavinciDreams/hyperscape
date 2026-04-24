import { describe, expect, it } from "vitest";
import {
  HYPERSCAPE_DARK_THEME,
  ThemeManifestSchema,
  themeToCssVars,
  validateTheme,
} from "./theme";

describe("ThemeManifestSchema", () => {
  it("accepts a minimal manifest with just colors", () => {
    const parsed = ThemeManifestSchema.parse({
      id: "test.min",
      name: "Minimal",
      colors: { primary: "#ff0000" },
    });
    expect(parsed.colors.primary).toBe("#ff0000");
    expect(parsed.spacing).toEqual({});
    expect(parsed.fontSizes).toEqual({});
  });

  it("parses the built-in Hyperscape dark theme", () => {
    expect(HYPERSCAPE_DARK_THEME.id).toBe("hyperscape.dark");
    expect(HYPERSCAPE_DARK_THEME.mode).toBe("dark");
    expect(Object.keys(HYPERSCAPE_DARK_THEME.colors).length).toBeGreaterThan(
      10,
    );
  });

  it("rejects empty id/name", () => {
    expect(() =>
      ThemeManifestSchema.parse({ id: "", name: "x", colors: { a: "#000" } }),
    ).toThrow();
    expect(() =>
      ThemeManifestSchema.parse({ id: "x", name: "", colors: { a: "#000" } }),
    ).toThrow();
  });

  it("rejects unknown top-level fields (strict)", () => {
    expect(() =>
      ThemeManifestSchema.parse({
        id: "t",
        name: "t",
        colors: { a: "#000" },
        madeUp: true,
      }),
    ).toThrow();
  });

  it("accepts hex, rgb, rgba, hsl, var, transparent and currentColor colors", () => {
    const parsed = ThemeManifestSchema.parse({
      id: "t",
      name: "t",
      colors: {
        hex3: "#abc",
        hex4: "#abcd",
        hex6: "#aabbcc",
        hex8: "#aabbccdd",
        rgb: "rgb(10, 20, 30)",
        rgba: "rgba(10, 20, 30, 0.5)",
        hsl: "hsl(120, 50%, 50%)",
        fromVar: "var(--external)",
        transparent: "transparent",
        current: "currentColor",
      },
    });
    expect(Object.keys(parsed.colors).length).toBe(10);
  });

  it("rejects malformed color values", () => {
    const bad = ThemeManifestSchema.safeParse({
      id: "t",
      name: "t",
      colors: { bad: "not-a-color" },
    });
    expect(bad.success).toBe(false);
  });

  it("accepts common CSS length spacing / radii values", () => {
    const parsed = ThemeManifestSchema.parse({
      id: "t",
      name: "t",
      colors: { a: "#000" },
      spacing: { zero: "0", px: "8px", rem: "1.25rem", pct: "100%" },
      radii: { custom: "var(--foo)" },
    });
    expect(parsed.spacing.zero).toBe("0");
    expect(parsed.radii.custom).toBe("var(--foo)");
  });

  it("rejects junk size values", () => {
    const bad = ThemeManifestSchema.safeParse({
      id: "t",
      name: "t",
      colors: { a: "#000" },
      spacing: { weird: "banana" },
    });
    expect(bad.success).toBe(false);
  });

  it("accepts integer font weights in [1, 1000]", () => {
    const parsed = ThemeManifestSchema.parse({
      id: "t",
      name: "t",
      colors: { a: "#000" },
      fontWeights: { regular: 400, bold: 700 },
    });
    expect(parsed.fontWeights.bold).toBe(700);
  });

  it("rejects out-of-range font weights", () => {
    const bad = ThemeManifestSchema.safeParse({
      id: "t",
      name: "t",
      colors: { a: "#000" },
      fontWeights: { regular: 1200 },
    });
    expect(bad.success).toBe(false);
  });
});

describe("validateTheme", () => {
  it("returns ok for the built-in dark theme", () => {
    const result = validateTheme(HYPERSCAPE_DARK_THEME);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.id).toBe("hyperscape.dark");
      expect(result.issues).toEqual([]);
    }
  });

  it("returns schema-error issues with paths for invalid input", () => {
    const result = validateTheme({
      id: "t",
      name: "t",
      colors: { bad: 123 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].code).toBe("schema-error");
      expect(result.issues[0].path).toContain("colors");
    }
  });

  it("flags completely empty theme as empty-token-category", () => {
    const result = validateTheme({ id: "t", name: "t" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].code).toBe("empty-token-category");
    }
  });
});

describe("themeToCssVars", () => {
  it("emits the exact vars the asset-forge stylesheet consumes", () => {
    const vars = themeToCssVars(HYPERSCAPE_DARK_THEME);
    expect(vars["--color-primary"]).toBe("#6366f1");
    expect(vars["--color-bg-primary"]).toBe("#0c0d10");
    expect(vars["--color-text-secondary"]).toBe("#9a9caa");
    expect(vars["--color-border-hover"]).toBe("#3a3d4a");
    expect(vars["--spacing-md"]).toBe("12px");
    expect(vars["--radius-lg"]).toBe("8px");
    expect(vars["--font-family-sans"]).toContain("Inter");
    expect(vars["--font-size-md"]).toBe("14px");
    expect(vars["--font-weight-bold"]).toBe("700");
    expect(vars["--shadow-md"]).toBe("0 4px 8px rgba(0,0,0,0.3)");
    expect(vars["--z-modal"]).toBe("2000");
    expect(vars["--duration-base"]).toBe("200ms");
  });

  it("kebabizes camelCase keys by default", () => {
    const vars = themeToCssVars(HYPERSCAPE_DARK_THEME);
    expect(vars["--color-primary-dark"]).toBe("#4f46e5");
    expect(vars["--line-height-tight"]).toBe("1.2");
  });

  it("respects kebabize=false", () => {
    const vars = themeToCssVars(HYPERSCAPE_DARK_THEME, { kebabize: false });
    expect(vars["--color-primaryDark"]).toBe("#4f46e5");
  });

  it("respects custom prefix", () => {
    const vars = themeToCssVars(HYPERSCAPE_DARK_THEME, { prefix: "$hf-" });
    expect(vars["$hf-color-primary"]).toBe("#6366f1");
    // And doesn't leak double-dash vars.
    expect(vars["--color-primary"]).toBeUndefined();
  });

  it("produces an empty map for a theme with no tokens", () => {
    const theme = ThemeManifestSchema.parse({
      id: "t",
      name: "t",
      colors: { seed: "#000" },
    });
    theme.colors = {};
    expect(themeToCssVars(theme)).toEqual({});
  });
});
