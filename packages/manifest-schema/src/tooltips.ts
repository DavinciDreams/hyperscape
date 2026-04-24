/**
 * Tooltips manifest schema.
 *
 * Authored registry of tooltip/help strings keyed by tooltipId.
 * Widgets, item panels, action buttons, and keybind prompts all
 * reference a tooltipId; runtime `TooltipRegistry` resolves the
 * current locale's string + formatting tokens at display time.
 *
 * Scope-isolated from:
 *   - `localization.ts` (raw string catalog — tooltips point at it
 *     by key, the strings themselves live there)
 *   - `interaction-prompts.ts` (world-space prompts — tooltips are
 *     UI-space hover/focus hints)
 *   - `accessibility.ts` (screen-reader text — tooltips may reference
 *     an a11y-specific override key)
 */

import { z } from "zod";

/** TooltipId — lowerCamelCase. */
const TooltipId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_.-]*$/,
    "tooltip id must be lowerCamelCase (dots and dashes allowed)",
  );

/** Trigger — what makes the tooltip appear. */
export const TooltipTriggerSchema = z.enum([
  "hover",
  "focus",
  "longPress",
  "manual",
]);
export type TooltipTrigger = z.infer<typeof TooltipTriggerSchema>;

/** Placement relative to the anchor element. */
export const TooltipPlacementSchema = z.enum([
  "auto",
  "top",
  "bottom",
  "left",
  "right",
]);
export type TooltipPlacement = z.infer<typeof TooltipPlacementSchema>;

/**
 * One tooltip entry. Keys into localization catalog by id.
 */
export const TooltipEntrySchema = z
  .object({
    id: TooltipId,
    /** Localization key for the tooltip title (optional). */
    titleLocalizationKey: z.string().default(""),
    /** Localization key for the tooltip body (required). */
    bodyLocalizationKey: z.string().min(1),
    /** Optional a11y-override body key (screen-reader). */
    ariaLocalizationKey: z.string().default(""),
    trigger: TooltipTriggerSchema.default("hover"),
    placement: TooltipPlacementSchema.default("auto"),
    /** Show after this many ms of hover/focus. */
    showDelayMs: z.number().int().min(0).max(5000).default(400),
    /** Hide after this many ms of mouseout (0 = immediate). */
    hideDelayMs: z.number().int().min(0).max(5000).default(100),
    /** Max width in CSS pixels (0 = no cap). */
    maxWidthPx: z.number().int().min(0).max(2000).default(320),
    /** Optional icon asset (e.g. key-prompt glyph embedded in tooltip). */
    iconAssetRef: z.string().default(""),
    /** Tag for grouping/filtering in the authoring tool. */
    categoryTag: z.string().default(""),
    /** Only show if player has seen tooltip fewer than N times. 0 = always. */
    maxShowsPerPlayer: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
export type TooltipEntry = z.infer<typeof TooltipEntrySchema>;

/**
 * Tooltips manifest — top-level.
 */
export const TooltipsManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    entries: z.array(TooltipEntrySchema).default([]),
    /** Default values applied to entries that don't set them. */
    defaultShowDelayMs: z.number().int().min(0).max(5000).default(400),
    defaultHideDelayMs: z.number().int().min(0).max(5000).default(100),
    defaultMaxWidthPx: z.number().int().min(0).max(2000).default(320),
    /** Global disable (accessibility). */
    respectReducedMotionPreference: z.boolean().default(true),
  })
  .strict()
  .refine(
    (m) => new Set(m.entries.map((e) => e.id)).size === m.entries.length,
    { message: "tooltip ids must be unique", path: ["entries"] },
  );
export type TooltipsManifest = z.infer<typeof TooltipsManifestSchema>;
