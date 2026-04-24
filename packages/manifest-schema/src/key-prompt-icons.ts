/**
 * Key-prompt-icons manifest schema.
 *
 * Authored glyph catalog for rendering input prompts (keyboard keys,
 * mouse buttons, gamepad buttons, touch gestures). Widgets look up a
 * glyph by (deviceKind, inputCode) and render the mapped asset.
 *
 * Scope-isolated from:
 *   - `input-actions.ts` (author-side default bindings — this schema
 *     owns the *visual* representation of those inputs)
 *   - `interaction-prompts.ts` (world-space prompts — they consume
 *     glyphs from this catalog)
 *   - `tooltips.ts` (may embed glyphs inline via iconAssetRef)
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** Device kind grouping. */
export const DeviceKindSchema = z.enum([
  "keyboard",
  "mouse",
  "gamepadXbox",
  "gamepadPlaystation",
  "gamepadNintendo",
  "gamepadGeneric",
  "touch",
]);
export type DeviceKind = z.infer<typeof DeviceKindSchema>;

/**
 * One glyph mapping. `inputCode` is a free-form string whose
 * interpretation is device-kind-specific (e.g. "KeyA" for keyboard,
 * "FaceButtonA" for xbox, "Cross" for playstation).
 */
export const InputGlyphSchema = z
  .object({
    deviceKind: DeviceKindSchema,
    inputCode: z
      .string()
      .regex(
        /^[A-Za-z][A-Za-z0-9_]*$/,
        "inputCode must be ASCII identifier-ish (letters/digits/underscore)",
      ),
    /** Asset reference for the glyph icon (svg/png). */
    iconAssetRef: ManifestRef,
    /** Short label shown when icon is unavailable (e.g. "A", "RT"). */
    fallbackLabel: z.string().min(1).max(8),
    /** Preferred render width in CSS pixels. */
    renderWidthPx: z.number().int().min(8).max(256).default(24),
    /** Preferred render height. */
    renderHeightPx: z.number().int().min(8).max(256).default(24),
  })
  .strict();
export type InputGlyph = z.infer<typeof InputGlyphSchema>;

/**
 * Device-family metadata (e.g. rumble support, icon theme).
 */
export const DeviceFamilySchema = z
  .object({
    kind: DeviceKindSchema,
    /** Theme name for swapping between light/dark glyph sheets. */
    themeName: z.string().default(""),
    /** Icon asset sheet for the entire family. */
    sheetAssetRef: ManifestRef.optional(),
    /** Scale multiplier applied to all glyphs in this family. */
    scaleMultiplier: z.number().positive().max(4).default(1),
  })
  .strict();
export type DeviceFamily = z.infer<typeof DeviceFamilySchema>;

export const KeyPromptIconsManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    families: z.array(DeviceFamilySchema).default([]),
    glyphs: z.array(InputGlyphSchema).default([]),
    /** Fallback device kind when player's device can't be detected. */
    fallbackDeviceKind: DeviceKindSchema.default("keyboard"),
  })
  .strict()
  .refine(
    (m) => new Set(m.families.map((f) => f.kind)).size === m.families.length,
    { message: "at most one family entry per device kind", path: ["families"] },
  )
  .refine(
    (m) => {
      const seen = new Set<string>();
      for (const g of m.glyphs) {
        const key = `${g.deviceKind}|${g.inputCode}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
    {
      message: "(deviceKind, inputCode) pair must be unique across glyphs",
      path: ["glyphs"],
    },
  );
export type KeyPromptIconsManifest = z.infer<
  typeof KeyPromptIconsManifestSchema
>;
