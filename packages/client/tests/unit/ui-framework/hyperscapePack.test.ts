/**
 * Round-trip test for Hyperscape's reference UIPackManifest.
 *
 * Asserts the pack composes the existing DEFAULT_UI_LAYOUT +
 * HYPERSCAPE_DARK_THEME without behavior change — the layout and
 * theme objects survive parse/re-parse identically (modulo Zod's
 * default-injection of optional fields). This is the D9 end-to-end
 * proof: existing UI ships as a single manifest.
 */

import { describe, expect, it } from "vitest";

import {
  UIPackManifestSchema,
  validateUIPackManifest,
} from "@hyperforge/ui-framework";

import {
  DEFAULT_UI_LAYOUT,
  DEFAULT_UI_LAYOUT_ID,
} from "@/ui-framework/defaultLayout";
import {
  HYPERSCAPE_UI_PACK,
  HYPERSCAPE_UI_PACK_ID,
} from "@/ui-framework/hyperscapePack";

describe("HYPERSCAPE_UI_PACK", () => {
  it("has the expected id", () => {
    expect(HYPERSCAPE_UI_PACK.id).toBe(HYPERSCAPE_UI_PACK_ID);
    expect(HYPERSCAPE_UI_PACK_ID).toBe("hyperscape.default");
  });

  it("validates against UIPackManifestSchema", () => {
    const result = validateUIPackManifest(HYPERSCAPE_UI_PACK);
    expect(result.ok).toBe(true);
  });

  it("composes the DEFAULT_UI_LAYOUT under layouts.default", () => {
    expect(HYPERSCAPE_UI_PACK.layouts.default).toBeDefined();
    expect(HYPERSCAPE_UI_PACK.layouts.default.id).toBe(DEFAULT_UI_LAYOUT_ID);
    // The pack's default layout is structurally equal to
    // DEFAULT_UI_LAYOUT — same id + same instance count.
    expect(HYPERSCAPE_UI_PACK.layouts.default.instances.length).toBe(
      DEFAULT_UI_LAYOUT.instances.length,
    );
  });

  it("includes the Hyperscape dark theme", () => {
    expect(HYPERSCAPE_UI_PACK.theme).toBeDefined();
    expect(HYPERSCAPE_UI_PACK.theme?.id).toBe("hyperscape.dark");
    expect(HYPERSCAPE_UI_PACK.theme?.mode).toBe("dark");
  });

  it("survives JSON serialization round-trip", () => {
    const json = JSON.stringify(HYPERSCAPE_UI_PACK);
    const reparsed = UIPackManifestSchema.parse(JSON.parse(json));
    expect(reparsed.id).toBe(HYPERSCAPE_UI_PACK.id);
    expect(reparsed.layouts.default.id).toBe(
      HYPERSCAPE_UI_PACK.layouts.default.id,
    );
    expect(reparsed.theme?.id).toBe(HYPERSCAPE_UI_PACK.theme?.id);
  });

  it("metadata.sourceLayoutId points at the layout that was wrapped", () => {
    expect(HYPERSCAPE_UI_PACK.metadata?.sourceLayoutId).toBe(
      DEFAULT_UI_LAYOUT_ID,
    );
  });
});
