/**
 * Localization manifest schema.
 *
 * Phase F2 of the World Studio AAA plan — authors ship one manifest
 * per locale. Each manifest is
 *
 *   { locale, fallback?, strings: { [key]: value } }
 *
 * where `key` is a dot-separated string key (e.g. `"ui.inventory.title"`)
 * and `value` is an ICU MessageFormat-style string that the runtime
 * formatter (separate follow-up) interpolates against named params.
 *
 * Multiple locales live in separate manifest files rather than one
 * giant blob so translators can work on a single-language JSON without
 * merge conflicts with other locales. `LocalizationBundleSchema` wraps
 * the usual "author-editor loads everything" case.
 */

import { z } from "zod";

/**
 * BCP-47-ish locale tag, e.g. `en`, `en-US`, `zh-Hant`, `pt-BR`.
 * Runtime formatter treats unknown tags as a fallback to `fallback`.
 */
const LocaleTag = z
  .string()
  .regex(
    /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,4})*$/,
    "Locale tag must look like 'en' or 'en-US' (BCP-47 subset)",
  );

/**
 * Translation key — dot-separated ASCII identifier segments. Enforced
 * to stop obvious typos (leading dots, empty segments, whitespace,
 * non-ASCII) at authoring time.
 */
const TranslationKey = z
  .string()
  .regex(
    /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/,
    "Translation key must be dot-separated ASCII identifiers (no empty segments)",
  );

export const LocalizationManifestSchema = z.object({
  locale: LocaleTag,
  /**
   * Optional fallback locale for missing keys — typically `"en"`.
   * Missing values on a non-fallback locale are permitted (authors
   * land keys incrementally); the runtime walks to `fallback` on miss.
   */
  fallback: LocaleTag.optional(),
  description: z.string().default(""),
  strings: z.record(TranslationKey, z.string()),
});
export type LocalizationManifest = z.infer<typeof LocalizationManifestSchema>;

/**
 * Bundle shape for the editor-loads-everything case. A bundle requires
 * a `base` locale whose keys are the authoritative surface — other
 * locales are validated against it at load time (separate follow-up)
 * to surface missing translations for the translator UI.
 */
export const LocalizationBundleSchema = z
  .object({
    base: LocaleTag,
    locales: z.array(LocalizationManifestSchema).min(1),
  })
  .refine(({ base, locales }) => locales.some((l) => l.locale === base), {
    message: "bundle must include a manifest for the declared `base` locale",
  })
  .refine(
    ({ locales }) =>
      new Set(locales.map((l) => l.locale)).size === locales.length,
    { message: "bundle locales must be unique" },
  );
export type LocalizationBundle = z.infer<typeof LocalizationBundleSchema>;
