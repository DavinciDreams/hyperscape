/**
 * Phase U7 — theme application smoke tests for ManifestRenderer.
 *
 * Asserts that the flat CSS-var map from `themeToCssVars` ends up on
 * the overlay root's inline style, scoped to the HUD subtree rather
 * than polluting `:root`. No widgets are rendered — we only care
 * about the overlay's style surface.
 */

import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ThemeManifest, UILayoutManifest } from "@hyperforge/ui-framework";

import { ManifestRenderer } from "@/ui-framework/ManifestRenderer";

function makeLayout(partial?: Partial<UILayoutManifest>): UILayoutManifest {
  return {
    id: "layout.test",
    name: "Test",
    instances: [],
    ...partial,
  } as UILayoutManifest;
}

function makeTheme(): ThemeManifest {
  return {
    id: "theme.test",
    name: "Test Theme",
    colors: { primary: "#ff0000", secondary: "#00ff00" },
    spacing: { md: "8px" },
    radii: {},
    fontFamilies: {},
    fontSizes: {},
    fontWeights: {},
    lineHeights: {},
    shadows: {},
    zIndices: {},
    durations: {},
  };
}

function overlayFor(
  layout: UILayoutManifest,
  resolveTheme?: (id: string) => ThemeManifest | null,
) {
  const { container } = render(
    <ManifestRenderer
      layout={layout}
      dataContext={{}}
      resolveTheme={resolveTheme}
    />,
  );
  const overlay = container.querySelector(
    `[data-layout-id="${layout.id}"]`,
  ) as HTMLElement;
  return overlay;
}

describe("ManifestRenderer theme integration", () => {
  it("applies no theme vars when layout has neither theme nor themeId", () => {
    const overlay = overlayFor(makeLayout());
    expect(overlay.style.getPropertyValue("--color-primary")).toBe("");
  });

  it("inline theme wins: CSS vars land on the overlay root", () => {
    const overlay = overlayFor(makeLayout({ theme: makeTheme() }));
    expect(overlay.style.getPropertyValue("--color-primary")).toBe("#ff0000");
    expect(overlay.style.getPropertyValue("--color-secondary")).toBe("#00ff00");
    expect(overlay.style.getPropertyValue("--spacing-md")).toBe("8px");
  });

  it("themeId resolves via resolveTheme when no inline theme is present", () => {
    const overlay = overlayFor(makeLayout({ themeId: "theme.test" }), (id) =>
      id === "theme.test" ? makeTheme() : null,
    );
    expect(overlay.style.getPropertyValue("--color-primary")).toBe("#ff0000");
  });

  it("themeId missing from resolver → no vars, does not throw", () => {
    const overlay = overlayFor(
      makeLayout({ themeId: "theme.missing" }),
      () => null,
    );
    expect(overlay.style.getPropertyValue("--color-primary")).toBe("");
  });

  it("inline theme wins over themeId when both are set", () => {
    const inline = makeTheme();
    inline.colors.primary = "#0000ff";
    const overlay = overlayFor(
      makeLayout({ theme: inline, themeId: "theme.other" }),
      (_id) => ({ ...makeTheme(), colors: { primary: "#000000" } }),
    );
    // Inline's primary (blue) wins; the resolver's theme is ignored.
    expect(overlay.style.getPropertyValue("--color-primary")).toBe("#0000ff");
  });
});
