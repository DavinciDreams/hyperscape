import { KeyPromptIconsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import { KeyPromptGlyphRegistry } from "../KeyPromptGlyphRegistry.js";

function manifest(
  overrides: Partial<{ enabled: boolean; fallbackDeviceKind: string }> = {},
) {
  return KeyPromptIconsManifestSchema.parse({
    enabled: overrides.enabled ?? true,
    fallbackDeviceKind: overrides.fallbackDeviceKind ?? "keyboard",
    families: [
      {
        kind: "keyboard",
        themeName: "light",
        sheetAssetRef: "glyphs-keyboard-light",
        scaleMultiplier: 1,
      },
      {
        kind: "gamepadXbox",
        themeName: "xbox-series",
        sheetAssetRef: "glyphs-xbox",
        scaleMultiplier: 2,
      },
    ],
    glyphs: [
      {
        deviceKind: "keyboard",
        inputCode: "KeyA",
        iconAssetRef: "kb-a",
        fallbackLabel: "A",
      },
      {
        deviceKind: "keyboard",
        inputCode: "Space",
        iconAssetRef: "kb-space",
        fallbackLabel: "Spc",
      },
      {
        deviceKind: "gamepadXbox",
        inputCode: "FaceButtonA",
        iconAssetRef: "xbox-a",
        fallbackLabel: "A",
        renderWidthPx: 32,
        renderHeightPx: 32,
      },
    ],
  });
}

describe("KeyPromptGlyphRegistry", () => {
  it("indexes glyphs + families on load", () => {
    const reg = new KeyPromptGlyphRegistry(manifest());
    expect(reg.size).toBe(3);
    expect(reg.isEnabled).toBe(true);
  });

  it("getExact returns null on miss", () => {
    const reg = new KeyPromptGlyphRegistry(manifest());
    expect(reg.getExact("keyboard", "Missing")).toBeNull();
  });

  it("getExact finds exact match", () => {
    const reg = new KeyPromptGlyphRegistry(manifest());
    const g = reg.getExact("keyboard", "KeyA");
    expect(g?.iconAssetRef).toBe("kb-a");
  });

  it("resolve applies family scale multiplier", () => {
    const reg = new KeyPromptGlyphRegistry(manifest());
    const r = reg.resolve("gamepadXbox", "FaceButtonA");
    expect(r).not.toBeNull();
    // glyph renderWidthPx=32, xbox family scale=2 → 64
    expect(r!.renderWidthPx).toBe(64);
    expect(r!.renderHeightPx).toBe(64);
    expect(r!.themeName).toBe("xbox-series");
    expect(r!.sheetAssetRef).toBe("glyphs-xbox");
  });

  it("resolve falls back to fallbackDeviceKind on miss", () => {
    const reg = new KeyPromptGlyphRegistry(manifest());
    // gamepadXbox has no "Space", keyboard does → fallback to keyboard
    const r = reg.resolve("gamepadXbox", "Space");
    expect(r).not.toBeNull();
    expect(r!.deviceKind).toBe("keyboard");
    expect(r!.iconAssetRef).toBe("kb-space");
  });

  it("resolve returns null when even fallback device has no glyph", () => {
    const reg = new KeyPromptGlyphRegistry(manifest());
    const r = reg.resolve("gamepadXbox", "UtterlyUnknown");
    expect(r).toBeNull();
  });

  it("resolve returns null when manifest disabled", () => {
    const reg = new KeyPromptGlyphRegistry(manifest({ enabled: false }));
    expect(reg.resolve("keyboard", "KeyA")).toBeNull();
  });

  it("resolve returns null when manifest not loaded", () => {
    const reg = new KeyPromptGlyphRegistry();
    expect(reg.resolve("keyboard", "KeyA")).toBeNull();
  });

  it("resolve uses scale=1 when device has no family entry", () => {
    const m = KeyPromptIconsManifestSchema.parse({
      enabled: true,
      fallbackDeviceKind: "keyboard",
      families: [],
      glyphs: [
        {
          deviceKind: "keyboard",
          inputCode: "KeyA",
          iconAssetRef: "kb-a",
          fallbackLabel: "A",
          renderWidthPx: 24,
          renderHeightPx: 24,
        },
      ],
    });
    const reg = new KeyPromptGlyphRegistry(m);
    const r = reg.resolve("keyboard", "KeyA");
    expect(r!.renderWidthPx).toBe(24);
    expect(r!.sheetAssetRef).toBeNull();
    expect(r!.themeName).toBe("");
  });

  it("loadFromJson validates before loading", () => {
    const reg = new KeyPromptGlyphRegistry();
    reg.loadFromJson({
      enabled: true,
      fallbackDeviceKind: "keyboard",
      families: [],
      glyphs: [],
    });
    expect(reg.size).toBe(0);
    expect(reg.isEnabled).toBe(true);
  });
});

describe("KeyPromptGlyphRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new KeyPromptGlyphRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new KeyPromptGlyphRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new KeyPromptGlyphRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
