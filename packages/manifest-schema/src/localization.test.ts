/**
 * Faithfulness + defensiveness tests for the localization schemas.
 */

import { describe, expect, it } from "vitest";

import {
  LocalizationBundleSchema,
  LocalizationManifestSchema,
  type LocalizationBundle,
  type LocalizationManifest,
} from "./localization.js";

const en: LocalizationManifest = {
  locale: "en",
  description: "Authoring surface",
  strings: {
    "ui.inventory.title": "Inventory",
    "ui.inventory.empty": "Your inventory is empty.",
    "combat.you_die": "You died.",
    "quest.intro.accept": "I'll help you, {npcName}.",
  },
};

const frFallback: LocalizationManifest = {
  locale: "fr",
  fallback: "en",
  strings: {
    "ui.inventory.title": "Inventaire",
    "combat.you_die": "Vous êtes mort.",
  },
};

const bundle: LocalizationBundle = {
  base: "en",
  locales: [en, frFallback],
};

describe("LocalizationManifestSchema", () => {
  it("parses a full manifest", () => {
    expect(LocalizationManifestSchema.safeParse(en).success).toBe(true);
  });

  it("parses a partial non-base manifest with fallback", () => {
    expect(LocalizationManifestSchema.safeParse(frFallback).success).toBe(true);
  });

  it("rejects malformed locale tag", () => {
    const bad = { ...en, locale: "english" };
    expect(LocalizationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty-segment translation key", () => {
    const bad = {
      ...en,
      strings: { "ui..title": "x" },
    };
    expect(LocalizationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-ASCII translation key", () => {
    const bad = { ...en, strings: { "ui.café": "x" } };
    expect(LocalizationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects whitespace in translation key", () => {
    const bad = { ...en, strings: { "ui.inventory title": "x" } };
    expect(LocalizationManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts empty string value (translators can stub)", () => {
    const parsed = LocalizationManifestSchema.parse({
      ...en,
      strings: { "ui.todo": "" },
    });
    expect(parsed.strings["ui.todo"]).toBe("");
  });
});

describe("LocalizationBundleSchema", () => {
  it("parses a bundle containing its base locale", () => {
    expect(LocalizationBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it("rejects a bundle missing its base locale", () => {
    const bad = { base: "de", locales: bundle.locales };
    expect(LocalizationBundleSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a bundle with duplicate locales", () => {
    const bad = { base: "en", locales: [en, en] };
    expect(LocalizationBundleSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty bundle", () => {
    const bad = { base: "en", locales: [] };
    expect(LocalizationBundleSchema.safeParse(bad).success).toBe(false);
  });
});
