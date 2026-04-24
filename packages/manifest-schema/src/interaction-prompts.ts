/**
 * Interaction-prompts manifest schema.
 *
 * Section 11 (missing systems → interaction prompts) of the
 * World Studio AAA plan. Declares the UI prompts that appear
 * when a player looks at or nears an interactable entity —
 * "Press [E] to open chest", "Hold [F] to loot", etc.
 *
 * Scope: authored templates keyed by interaction kind. Runtime
 * interaction system picks a template per context; this schema
 * describes only the authored surface.
 */

import { z } from "zod";

/** PromptId — dot-separated lowerCamelCase. */
const PromptId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*(?:\.[a-z][a-zA-Z0-9_-]*)*$/,
    "prompt id must be dot-separated lowerCamelCase segments",
  );

/** Input action id — must match an entry in `input-actions.ts`. */
const InputActionId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "input action id must be lowerCamelCase ASCII identifier",
  );

/** Localization key — dot-separated ASCII path. */
const LocalizationKey = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)*$/,
    "localization key must be dot-separated ASCII identifier path",
  );

/** Prompt interaction mode — how the action is triggered. */
export const PromptModeSchema = z.enum(["tap", "hold", "toggle", "rapid-tap"]);
export type PromptMode = z.infer<typeof PromptModeSchema>;

/** Prompt visual style preset. */
export const PromptStyleSchema = z.enum([
  "default",
  "emphasis",
  "danger",
  "subtle",
]);
export type PromptStyle = z.infer<typeof PromptStyleSchema>;

/** Where the prompt anchors relative to the target/screen. */
export const PromptAnchorSchema = z.enum([
  "screen-center",
  "screen-bottom",
  "world-target",
  "world-above",
]);
export type PromptAnchor = z.infer<typeof PromptAnchorSchema>;

export const InteractionPromptSchema = z
  .object({
    id: PromptId,
    /** Interaction kind — matches entity's declared interaction tag. */
    interactionKind: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "interactionKind must be lowerCamelCase ASCII identifier",
      ),
    /** Input action to resolve to the user's current binding. */
    actionId: InputActionId,
    mode: PromptModeSchema.default("tap"),
    /** Hold/rapid-tap duration in seconds (0 for tap/toggle). */
    durationSec: z.number().min(0).max(60).default(0),
    /** Localization key for the prompt body (e.g. "prompt.chest.open"). */
    labelKey: LocalizationKey,
    /** Optional secondary detail line localization key. */
    subLabelKey: z.string().default(""),
    /** Icon id — resolves against icon manifest; empty = no icon. */
    iconId: z.string().default(""),
    style: PromptStyleSchema.default("default"),
    anchor: PromptAnchorSchema.default("screen-center"),
    /** Auto-hide distance in meters — above this the prompt disappears. */
    autoHideDistanceMeters: z.number().min(0).max(1000).default(3),
    /** Fade-in seconds when prompt first appears. */
    fadeInSec: z.number().min(0).max(5).default(0.15),
    /** Fade-out seconds when prompt disappears. */
    fadeOutSec: z.number().min(0).max(5).default(0.2),
    /** Priority — higher wins when multiple prompts are eligible. */
    priority: z.number().int().min(-1000).max(1000).default(0),
  })
  .strict()
  .refine(
    ({ mode, durationSec }) => {
      if (mode === "hold" || mode === "rapid-tap") return durationSec > 0;
      return true;
    },
    {
      message: "`hold` and `rapid-tap` modes require a positive `durationSec`",
    },
  )
  .refine(
    ({ mode, durationSec }) => {
      if (mode === "tap" || mode === "toggle") return durationSec === 0;
      return true;
    },
    {
      message:
        "`tap` and `toggle` modes must leave `durationSec` at the default 0",
    },
  );
export type InteractionPrompt = z.infer<typeof InteractionPromptSchema>;

export const InteractionPromptsManifestSchema = z
  .array(InteractionPromptSchema)
  .refine((list) => new Set(list.map((p) => p.id)).size === list.length, {
    message: "interaction prompt ids must be unique",
  })
  .refine(
    (list) => {
      // Each interactionKind may have multiple prompts, but within a kind
      // every prompt must declare a unique `priority` so tie-break is
      // deterministic.
      const byKind = new Map<string, number[]>();
      for (const p of list) {
        const arr = byKind.get(p.interactionKind) ?? [];
        arr.push(p.priority);
        byKind.set(p.interactionKind, arr);
      }
      for (const [, prios] of byKind) {
        if (new Set(prios).size !== prios.length) return false;
      }
      return true;
    },
    {
      message:
        "prompts with the same `interactionKind` must have unique `priority` values for deterministic tie-break",
    },
  );
export type InteractionPromptsManifest = z.infer<
  typeof InteractionPromptsManifestSchema
>;
