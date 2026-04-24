/**
 * InputBindingManifest — the "UI Pack" entry for player input.
 *
 * Actions are declared once in an `InputBindingManifest`, each with a
 * stable `id`, a default chord, and optional context-scoping and
 * rebindability policy. Per-player overrides (keyed by `actionId`)
 * live in `UserInputBindings`, a minimal shape that mirrors the
 * UI-layout override pattern: sparse, partial, merged by a pure
 * function (`resolveInputBindings`).
 *
 * What "chord" means:
 *   - a keyboard chord is one key plus any subset of modifiers
 *   - a mouse-button chord is a single button (no modifiers surfaced here)
 *   - a chord is stringly normalized (`chordToString`) so the runtime
 *     can look up "Ctrl+Shift+K" without caring about insertion order
 *
 * What "context scope" means:
 *   - actions can declare the contexts they're active in — same string
 *     space as the U8 widget visibility rule (`"combat"`, `"menu"`, …)
 *   - when unset, the action is active in every context
 *
 * This module is pure — no DOM wiring, no event listeners. The client
 * consumes these schemas to build the actual key-listener stack.
 */

import { z } from "zod";

export const INPUT_MODIFIER_KEYS = ["ctrl", "meta", "alt", "shift"] as const;

export type InputModifierKey = (typeof INPUT_MODIFIER_KEYS)[number];

export const INPUT_POINTER_BUTTONS = [
  "mouseLeft",
  "mouseRight",
  "mouseMiddle",
  "mouseBack",
  "mouseForward",
] as const;

export type InputPointerButton = (typeof INPUT_POINTER_BUTTONS)[number];

/**
 * One chord = one key + optional modifiers, OR one pointer button.
 *
 *   - `key` is the `KeyboardEvent.code`-ish string the client matches
 *     against (`"KeyA"`, `"ArrowUp"`, `"Space"`, `"Escape"`, …).
 *   - When both `key` and `button` are set, `key` wins — the runtime
 *     prefers keyboard chords over pointer chords for disambiguation.
 */
export const InputChordSchema = z.object({
  key: z.string().min(1).optional(),
  button: z.enum(INPUT_POINTER_BUTTONS).optional(),
  modifiers: z.array(z.enum(INPUT_MODIFIER_KEYS)).default([]),
});

export type InputChord = z.infer<typeof InputChordSchema>;

/**
 * A single action binding. `id` must be unique within the manifest.
 * `defaults` is a prioritized list of chords — the first unoverridden
 * chord wins at runtime. `rebindable: false` locks the chord from the
 * rebinding UI (useful for system actions like `"ui.closeMenu"` that
 * must stay on `Escape`).
 */
export const InputActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  /**
   * Ordered list of default chords. The first entry is "the" default;
   * additional entries act as alternates shown in the rebinding UI.
   */
  defaults: z.array(InputChordSchema).min(1),
  /** If false, the rebinding UI hides this action. Default: true. */
  rebindable: z.boolean().default(true),
  /**
   * Optional context whitelist. When unset the action is active in
   * every context. Same string space as U8 widget visibility.
   */
  contexts: z.array(z.string().min(1)).optional(),
  /**
   * Optional free-form category for the rebinding UI's grouping
   * (`"Combat"`, `"Movement"`, `"UI"`, …). Purely presentational —
   * runtime dispatch ignores it.
   */
  category: z.string().min(1).optional(),
});

export type InputAction = z.infer<typeof InputActionSchema>;

export const InputBindingManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().optional(),
  description: z.string().optional(),
  actions: z.array(InputActionSchema).min(1),
});

export type InputBindingManifest = z.infer<typeof InputBindingManifestSchema>;

/**
 * Per-player override for a single action. `chords` replaces the
 * manifest's `defaults` entirely for that action — an empty array
 * means "this action has no binding right now" (useful for "unbind"
 * in the UI).
 */
export const UserInputBindingSchema = z.object({
  actionId: z.string().min(1),
  chords: z.array(InputChordSchema),
});

export type UserInputBinding = z.infer<typeof UserInputBindingSchema>;

export const UserInputBindingsSchema = z.object({
  schemaVersion: z.literal(1),
  manifestId: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
  bindings: z.array(UserInputBindingSchema),
});

export type UserInputBindings = z.infer<typeof UserInputBindingsSchema>;

// ----------------------------------------------------------------------
// Validation + resolver.
// ----------------------------------------------------------------------

export interface InputValidationIssue {
  actionId?: string;
  code: "duplicate-action-id" | "empty-chord" | "conflict";
  message: string;
}

export interface InputValidationResult {
  ok: boolean;
  issues: InputValidationIssue[];
}

/**
 * Static validation for an `InputBindingManifest`. Catches:
 *   - duplicate action ids
 *   - chords that are neither a key nor a pointer button
 *   - two actions in overlapping contexts binding the same chord
 *     (reported once per conflicting pair)
 */
export function validateInputBindings(
  manifest: InputBindingManifest,
): InputValidationResult {
  const issues: InputValidationIssue[] = [];
  const seen = new Set<string>();

  // Map of chordKey -> list of actions binding that chord.
  const chordMap = new Map<string, InputAction[]>();

  for (const action of manifest.actions) {
    if (seen.has(action.id)) {
      issues.push({
        actionId: action.id,
        code: "duplicate-action-id",
        message: `Action id "${action.id}" appears more than once.`,
      });
    } else {
      seen.add(action.id);
    }

    for (const chord of action.defaults) {
      if (!chord.key && !chord.button) {
        issues.push({
          actionId: action.id,
          code: "empty-chord",
          message: `Action "${action.id}" has a default chord with neither a key nor a button.`,
        });
        continue;
      }
      const chordKey = chordToString(chord);
      const list = chordMap.get(chordKey);
      if (list) {
        for (const other of list) {
          if (contextsOverlap(action.contexts, other.contexts)) {
            issues.push({
              code: "conflict",
              actionId: action.id,
              message: `Chord "${chordKey}" is bound by both "${other.id}" and "${action.id}" in overlapping contexts.`,
            });
          }
        }
        list.push(action);
      } else {
        chordMap.set(chordKey, [action]);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export interface ResolvedInputBinding {
  action: InputAction;
  /** Chords after merging user overrides. Empty = unbound. */
  chords: InputChord[];
  /** True when the user has overridden this action. */
  overridden: boolean;
}

export interface ResolvedInputBindings {
  manifest: InputBindingManifest;
  bindings: ResolvedInputBinding[];
  /** User-override actionIds that no longer exist in the manifest. */
  droppedOverrides: string[];
}

/**
 * Merge manifest defaults with user overrides. Pure — never throws.
 * A user override supplying `chords: []` unbinds the action. Missing
 * actions in the user override fall back to the manifest defaults.
 */
export function resolveInputBindings(
  manifest: InputBindingManifest,
  userBindings: UserInputBindings | null,
): ResolvedInputBindings {
  const manifestActionIds = new Set(manifest.actions.map((a) => a.id));
  const droppedOverrides: string[] = [];
  const overridesById = new Map<string, UserInputBinding>();

  if (userBindings && userBindings.manifestId === manifest.id) {
    for (const override of userBindings.bindings) {
      if (manifestActionIds.has(override.actionId)) {
        overridesById.set(override.actionId, override);
      } else {
        droppedOverrides.push(override.actionId);
      }
    }
  }

  const bindings: ResolvedInputBinding[] = manifest.actions.map((action) => {
    const override = overridesById.get(action.id);
    if (!override) {
      return { action, chords: action.defaults, overridden: false };
    }
    return { action, chords: override.chords, overridden: true };
  });

  return { manifest, bindings, droppedOverrides };
}

// ----------------------------------------------------------------------
// Chord helpers.
// ----------------------------------------------------------------------

/**
 * Normalize a chord to a stable string. Modifier order is forced to
 * the canonical `ctrl+meta+alt+shift+<key|button>` ordering so two
 * chords that mean the same thing compare equal as strings.
 */
export function chordToString(chord: InputChord): string {
  const modifiers = INPUT_MODIFIER_KEYS.filter((m) =>
    chord.modifiers.includes(m),
  );
  const base = chord.key ?? chord.button ?? "";
  return [...modifiers, base].filter(Boolean).join("+");
}

/**
 * True when two chords match. Modifier arrays are compared as sets
 * (order-insensitive).
 */
export function chordsEqual(a: InputChord, b: InputChord): boolean {
  if (a.key !== b.key) return false;
  if (a.button !== b.button) return false;
  if (a.modifiers.length !== b.modifiers.length) return false;
  const setA = new Set(a.modifiers);
  for (const m of b.modifiers) {
    if (!setA.has(m)) return false;
  }
  return true;
}

function contextsOverlap(
  a: string[] | undefined,
  b: string[] | undefined,
): boolean {
  // Either action being context-free means "everywhere" → overlap.
  if (!a || a.length === 0) return true;
  if (!b || b.length === 0) return true;
  const setA = new Set(a);
  return b.some((c) => setA.has(c));
}
