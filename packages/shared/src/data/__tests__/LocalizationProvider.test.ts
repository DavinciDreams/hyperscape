/**
 * Tests for the LocalizationProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { localizationProvider } from "../LocalizationProvider";

beforeEach(() => {
  localizationProvider.unload();
});
afterEach(() => {
  localizationProvider.unload();
});

const validBundle = {
  base: "en-US",
  locales: [
    {
      locale: "en-US",
      strings: {
        "greeting.hello": "Hello!",
        "greeting.goodbye": "Goodbye!",
      },
    },
    {
      locale: "fr-FR",
      strings: {
        "greeting.hello": "Bonjour !",
        "greeting.goodbye": "Au revoir !",
      },
    },
  ],
};

describe("LocalizationProvider", () => {
  it("starts unloaded", () => {
    expect(localizationProvider.isLoaded()).toBe(false);
    expect(localizationProvider.getBundle()).toBeNull();
    expect(localizationProvider.getManifest()).toBeNull();
  });

  it("load() installs an already-validated bundle", () => {
    localizationProvider.load(validBundle);
    expect(localizationProvider.isLoaded()).toBe(true);
    expect(localizationProvider.getBundle()?.base).toBe("en-US");
  });

  it("loadRaw() rejects a bundle whose base locale isn't in `locales`", () => {
    expect(() =>
      localizationProvider.loadRaw({
        base: "de-DE",
        locales: validBundle.locales,
      }),
    ).toThrow();
    expect(localizationProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate locales", () => {
    expect(() =>
      localizationProvider.loadRaw({
        base: "en-US",
        locales: [validBundle.locales[0], { ...validBundle.locales[0] }],
      }),
    ).toThrow();
    expect(localizationProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts and installs a valid bundle", () => {
    const parsed = localizationProvider.loadRaw(validBundle);
    expect(parsed.base).toBe("en-US");
    expect(parsed.locales.length).toBe(2);
    expect(localizationProvider.isLoaded()).toBe(true);
  });

  it("hotReload(bundle) replaces the current bundle", () => {
    localizationProvider.load(validBundle);
    const second = { ...validBundle, base: "fr-FR" };
    localizationProvider.hotReload(second);
    expect(localizationProvider.getBundle()?.base).toBe("fr-FR");
  });

  it("hotReload(null) clears the authored bundle", () => {
    localizationProvider.load(validBundle);
    localizationProvider.hotReload(null);
    expect(localizationProvider.isLoaded()).toBe(false);
    expect(localizationProvider.getBundle()).toBeNull();
  });

  it("unload() resets to default empty state", () => {
    localizationProvider.load(validBundle);
    localizationProvider.unload();
    expect(localizationProvider.isLoaded()).toBe(false);
    expect(localizationProvider.getManifest()).toBeNull();
  });
});
