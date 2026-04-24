import { describe, expect, it } from "vitest";
import {
  DeviceFamilySchema,
  InputGlyphSchema,
  KeyPromptIconsManifestSchema,
} from "./key-prompt-icons.js";

describe("InputGlyphSchema", () => {
  it("accepts a valid keyboard glyph", () => {
    const g = InputGlyphSchema.parse({
      deviceKind: "keyboard",
      inputCode: "KeyA",
      iconAssetRef: "glyphKeyA",
      fallbackLabel: "A",
    });
    expect(g.renderWidthPx).toBe(24);
    expect(g.renderHeightPx).toBe(24);
  });

  it("rejects inputCode with invalid characters", () => {
    expect(() =>
      InputGlyphSchema.parse({
        deviceKind: "keyboard",
        inputCode: "Key-A",
        iconAssetRef: "glyph",
        fallbackLabel: "A",
      }),
    ).toThrow(/inputCode/);
  });

  it("rejects empty fallbackLabel", () => {
    expect(() =>
      InputGlyphSchema.parse({
        deviceKind: "keyboard",
        inputCode: "KeyA",
        iconAssetRef: "glyph",
        fallbackLabel: "",
      }),
    ).toThrow();
  });

  it("rejects fallbackLabel over 8 chars", () => {
    expect(() =>
      InputGlyphSchema.parse({
        deviceKind: "keyboard",
        inputCode: "KeyA",
        iconAssetRef: "glyph",
        fallbackLabel: "123456789",
      }),
    ).toThrow();
  });

  it("rejects renderWidthPx below 8", () => {
    expect(() =>
      InputGlyphSchema.parse({
        deviceKind: "keyboard",
        inputCode: "KeyA",
        iconAssetRef: "glyph",
        fallbackLabel: "A",
        renderWidthPx: 4,
      }),
    ).toThrow();
  });

  it("rejects renderHeightPx above 256", () => {
    expect(() =>
      InputGlyphSchema.parse({
        deviceKind: "keyboard",
        inputCode: "KeyA",
        iconAssetRef: "glyph",
        fallbackLabel: "A",
        renderHeightPx: 512,
      }),
    ).toThrow();
  });
});

describe("DeviceFamilySchema", () => {
  it("accepts minimal family with defaults", () => {
    const f = DeviceFamilySchema.parse({ kind: "gamepadXbox" });
    expect(f.scaleMultiplier).toBe(1);
    expect(f.themeName).toBe("");
  });

  it("rejects scaleMultiplier <= 0", () => {
    expect(() =>
      DeviceFamilySchema.parse({ kind: "keyboard", scaleMultiplier: 0 }),
    ).toThrow();
  });

  it("rejects scaleMultiplier above 4", () => {
    expect(() =>
      DeviceFamilySchema.parse({ kind: "keyboard", scaleMultiplier: 5 }),
    ).toThrow();
  });
});

describe("KeyPromptIconsManifestSchema", () => {
  it("accepts empty manifest with defaults", () => {
    const m = KeyPromptIconsManifestSchema.parse({});
    expect(m.enabled).toBe(true);
    expect(m.fallbackDeviceKind).toBe("keyboard");
    expect(m.families).toEqual([]);
    expect(m.glyphs).toEqual([]);
  });

  it("accepts full manifest with families + glyphs", () => {
    const m = KeyPromptIconsManifestSchema.parse({
      families: [
        { kind: "keyboard", themeName: "dark" },
        { kind: "gamepadXbox", themeName: "dark" },
      ],
      glyphs: [
        {
          deviceKind: "keyboard",
          inputCode: "KeyA",
          iconAssetRef: "glyphA",
          fallbackLabel: "A",
        },
        {
          deviceKind: "gamepadXbox",
          inputCode: "FaceButtonA",
          iconAssetRef: "glyphXboxA",
          fallbackLabel: "A",
        },
      ],
    });
    expect(m.families).toHaveLength(2);
    expect(m.glyphs).toHaveLength(2);
  });

  it("rejects duplicate family per device kind", () => {
    expect(() =>
      KeyPromptIconsManifestSchema.parse({
        families: [{ kind: "keyboard" }, { kind: "keyboard" }],
      }),
    ).toThrow(/one family entry per device kind/);
  });

  it("rejects duplicate (deviceKind, inputCode) glyph pair", () => {
    const g = {
      deviceKind: "keyboard",
      inputCode: "KeyA",
      iconAssetRef: "glyphA",
      fallbackLabel: "A",
    };
    expect(() =>
      KeyPromptIconsManifestSchema.parse({ glyphs: [g, g] }),
    ).toThrow(/unique across glyphs/);
  });

  it("allows same inputCode across different device kinds", () => {
    const m = KeyPromptIconsManifestSchema.parse({
      glyphs: [
        {
          deviceKind: "keyboard",
          inputCode: "ButtonA",
          iconAssetRef: "g1",
          fallbackLabel: "A",
        },
        {
          deviceKind: "gamepadXbox",
          inputCode: "ButtonA",
          iconAssetRef: "g2",
          fallbackLabel: "A",
        },
      ],
    });
    expect(m.glyphs).toHaveLength(2);
  });
});
