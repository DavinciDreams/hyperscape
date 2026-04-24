/**
 * Tests for the KeyPromptIconsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { keyPromptIconsProvider } from "../KeyPromptIconsProvider";

beforeEach(() => {
  keyPromptIconsProvider.unload();
});
afterEach(() => {
  keyPromptIconsProvider.unload();
});

const validGlyph = {
  deviceKind: "keyboard" as const,
  inputCode: "W",
  iconAssetRef: "uiKeyW",
  fallbackLabel: "W",
};

describe("KeyPromptIconsProvider", () => {
  it("starts unloaded", () => {
    expect(keyPromptIconsProvider.isLoaded()).toBe(false);
    expect(keyPromptIconsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts baseline {enabled:false}", () => {
    const parsed = keyPromptIconsProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.glyphs).toEqual([]);
    expect(parsed.families).toEqual([]);
    expect(keyPromptIconsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid glyph", () => {
    const parsed = keyPromptIconsProvider.loadRaw({ glyphs: [validGlyph] });
    expect(parsed.glyphs.length).toBe(1);
    expect(parsed.glyphs[0].deviceKind).toBe("keyboard");
  });

  it("loadRaw() rejects duplicate (deviceKind, inputCode) pair", () => {
    expect(() =>
      keyPromptIconsProvider.loadRaw({
        glyphs: [validGlyph, { ...validGlyph }],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate family kind entries", () => {
    expect(() =>
      keyPromptIconsProvider.loadRaw({
        families: [
          { kind: "keyboard" as const },
          { kind: "keyboard" as const },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() allows different deviceKind with same inputCode", () => {
    const parsed = keyPromptIconsProvider.loadRaw({
      glyphs: [
        validGlyph,
        { ...validGlyph, deviceKind: "gamepadXbox" as const },
      ],
    });
    expect(parsed.glyphs.length).toBe(2);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = keyPromptIconsProvider.loadRaw({ enabled: false });
    keyPromptIconsProvider.unload();
    keyPromptIconsProvider.load(parsed);
    expect(keyPromptIconsProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    keyPromptIconsProvider.loadRaw({ glyphs: [validGlyph] });
    const parsed = keyPromptIconsProvider.loadRaw({ enabled: false });
    keyPromptIconsProvider.hotReload(parsed);
    expect(keyPromptIconsProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    keyPromptIconsProvider.loadRaw({ enabled: false });
    keyPromptIconsProvider.hotReload(null);
    expect(keyPromptIconsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    keyPromptIconsProvider.loadRaw({ enabled: false });
    keyPromptIconsProvider.unload();
    expect(keyPromptIconsProvider.isLoaded()).toBe(false);
  });
});
