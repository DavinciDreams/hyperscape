/**
 * Credits manifest schema.
 *
 * Authored registry of credit roll sections + entries shown at
 * game completion, end of cinematic, or standalone "Credits"
 * menu option. Supports section hierarchy, per-entry localization,
 * scroll speed, and background music cues.
 *
 * Scope-isolated from:
 *   - `localization.ts` (names + roles live as keys here; the
 *     strings themselves live there)
 *   - `cinematic.ts` (cinematics may *embed* a credit sequence,
 *     but the credit content is authored here)
 *   - `main-menu.ts` (credits is typically a menu entry point;
 *     the menu wiring is separate)
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

const Id = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_-]*$/, "id must be lowerCamelCase ASCII identifier");

/** Entry kinds — what's shown on a line. */
export const CreditEntryKindSchema = z.enum([
  "person",
  "group",
  "sectionHeader",
  "thanks",
  "spacer",
  "image",
  "quote",
]);
export type CreditEntryKind = z.infer<typeof CreditEntryKindSchema>;

/** Alignment for rendered entry. */
export const CreditAlignmentSchema = z.enum(["left", "center", "right"]);
export type CreditAlignment = z.infer<typeof CreditAlignmentSchema>;

/** One credit entry (line, header, image, etc.). */
export const CreditEntrySchema = z
  .object({
    id: Id,
    kind: CreditEntryKindSchema,
    /** Localization key for primary text (name, header, quote). */
    primaryLocalizationKey: z.string().default(""),
    /** Localization key for role/title/attribution. */
    secondaryLocalizationKey: z.string().default(""),
    alignment: CreditAlignmentSchema.default("center"),
    /** Optional image asset (for kind='image'). */
    imageAssetRef: ManifestRef.optional(),
    /** Optional external link/url key (resolved via manifest, not inline URL). */
    linkUrlKey: z.string().default(""),
    /** Vertical spacing multiplier. */
    verticalSpacingMultiplier: z.number().min(0).max(10).default(1),
  })
  .strict()
  .refine(
    (e) => e.kind !== "sectionHeader" || e.primaryLocalizationKey.length > 0,
    {
      message: "sectionHeader requires primaryLocalizationKey",
      path: ["primaryLocalizationKey"],
    },
  )
  .refine(
    (e) =>
      e.kind !== "image" ||
      (e.imageAssetRef !== undefined && e.imageAssetRef.length > 0),
    {
      message: "image entry requires imageAssetRef",
      path: ["imageAssetRef"],
    },
  )
  .refine(
    (e) =>
      e.kind !== "person" ||
      (e.primaryLocalizationKey.length > 0 &&
        e.secondaryLocalizationKey.length > 0),
    {
      message:
        "person requires primaryLocalizationKey + secondaryLocalizationKey",
      path: ["primaryLocalizationKey"],
    },
  );
export type CreditEntry = z.infer<typeof CreditEntrySchema>;

/** One credit section (group of entries). */
export const CreditSectionSchema = z
  .object({
    id: Id,
    titleLocalizationKey: z.string().default(""),
    entries: z.array(CreditEntrySchema).default([]),
    /** Display order (ascending). */
    displayOrder: z.number().int().min(0).max(10000).default(0),
  })
  .strict()
  .refine(
    (s) => new Set(s.entries.map((e) => e.id)).size === s.entries.length,
    {
      message: "entry ids must be unique within a section",
      path: ["entries"],
    },
  );
export type CreditSection = z.infer<typeof CreditSectionSchema>;

/** Scroll rules for the credit roll. */
export const ScrollRulesSchema = z
  .object({
    /** Pixels per second. */
    scrollSpeedPxPerSec: z.number().min(1).max(500).default(60),
    /** Fade in duration. */
    fadeInMs: z.number().int().min(0).max(5000).default(500),
    /** Fade out duration. */
    fadeOutMs: z.number().int().min(0).max(5000).default(500),
    /** Allow player to skip credits with input. */
    allowSkip: z.boolean().default(true),
    /** Allow player to speed up credits (hold button). */
    allowSpeedUp: z.boolean().default(true),
    speedUpMultiplier: z.number().min(1).max(10).default(3),
  })
  .strict();
export type ScrollRules = z.infer<typeof ScrollRulesSchema>;

/** Top-level credits manifest. */
export const CreditsManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    sections: z.array(CreditSectionSchema).default([]),
    scroll: ScrollRulesSchema.default(() => ScrollRulesSchema.parse({})),
    /** Music state to play during credits (optional). */
    musicStateRef: ManifestRef.optional(),
    /** Background art asset (optional). */
    backgroundAssetRef: ManifestRef.optional(),
    /** Localization key for final legal/copyright line. */
    copyrightLocalizationKey: z.string().default(""),
  })
  .strict()
  .refine(
    (m) => new Set(m.sections.map((s) => s.id)).size === m.sections.length,
    { message: "section ids must be unique", path: ["sections"] },
  )
  .refine((m) => !m.enabled || m.sections.length > 0, {
    message: "enabled manifest requires at least one section",
    path: ["sections"],
  });
export type CreditsManifest = z.infer<typeof CreditsManifestSchema>;
