/**
 * Input-actions manifest schema.
 *
 * Phase J4 of the World Studio AAA plan — **author side** of the
 * input system. Declares the logical actions the game exposes
 * (`"jump"`, `"interact"`, `"openInventory"`) plus their default
 * bindings per input scheme (keyboard-mouse, gamepad, touch).
 *
 * Companion to UI Pack U10's `useUserInputBindings` store — U10 lets
 * *players* rebind at runtime. This manifest is what authors ship
 * as the defaults and the editor's Keybinding UI edits.
 */

import { z } from "zod";

export const InputActionKindSchema = z.enum(["button", "axis", "vector2"]);
export type InputActionKind = z.infer<typeof InputActionKindSchema>;

/**
 * Binding source — `key` = keyboard key name (`"KeyW"`, `"Space"`),
 * `mouse-button` = `"Left"|"Right"|"Middle"`, `gamepad-button` =
 * standard-mapping indices as strings (`"0"`..`"15"`), `gamepad-axis`
 * = `"LeftStick"|"RightStick"|"LeftTrigger"|"RightTrigger"`,
 * `touch-region` = named region from a touch-region manifest.
 */
export const InputBindingSourceSchema = z.enum([
  "key",
  "mouse-button",
  "mouse-wheel",
  "gamepad-button",
  "gamepad-axis",
  "touch-region",
]);
export type InputBindingSource = z.infer<typeof InputBindingSourceSchema>;

/**
 * Modifier keys that must be held simultaneously for a binding to
 * trigger. Enforced at most once each so `["shift", "shift"]` fails.
 */
export const InputModifierSchema = z.enum(["shift", "ctrl", "alt", "meta"]);
export type InputModifier = z.infer<typeof InputModifierSchema>;

export const InputBindingSchema = z
  .object({
    source: InputBindingSourceSchema,
    /** Source-specific code (see `InputBindingSourceSchema` docblock). */
    code: z.string().min(1),
    modifiers: z.array(InputModifierSchema).default([]),
    /** For axis actions — scale applied to raw axis value, e.g. `-1` to invert. */
    scale: z.number().default(1),
    /** Which input scheme this binding belongs to. */
    scheme: z.enum(["keyboard-mouse", "gamepad", "touch"]),
  })
  .refine(({ modifiers }) => new Set(modifiers).size === modifiers.length, {
    message: "input binding modifiers must be unique",
  });
export type InputBinding = z.infer<typeof InputBindingSchema>;

/**
 * Action id — lowerCamelCase ASCII identifier. The runtime exposes
 * these as typed keys (`input.action("jump")`), so typos need to
 * fail loudly at authoring time.
 */
const ActionId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9]*$/,
    "Input action id must be lowerCamelCase ASCII identifier",
  );

export const InputActionSchema = z.object({
  id: ActionId,
  name: z.string().min(1),
  kind: InputActionKindSchema,
  description: z.string().default(""),
  category: z.string().default(""),
  /** Hide from the rebinding UI — e.g. internal debug actions. */
  rebindable: z.boolean().default(true),
  /** Default bindings — at least one recommended per shipped scheme. */
  defaults: z.array(InputBindingSchema).default([]),
});
export type InputAction = z.infer<typeof InputActionSchema>;

export const InputActionsManifestSchema = z
  .array(InputActionSchema)
  .refine((list) => new Set(list.map((a) => a.id)).size === list.length, {
    message: "input action ids must be unique",
  });
export type InputActionsManifest = z.infer<typeof InputActionsManifestSchema>;
