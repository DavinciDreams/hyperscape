/**
 * useInputActions — register keyboard listeners for a resolved input
 * manifest and dispatch callbacks when the live chord matches a
 * bound action.
 *
 * This closes the U10 loop: designers author `InputBindingManifest`,
 * players persist `UserInputBindings` overrides, the client resolves
 * them via `resolveInputBindings`, and this hook turns the resolved
 * chord list into real `keydown` dispatches.
 *
 * Context filtering:
 *   - Each action can declare `contexts`. Only actions whose `contexts`
 *     include the live `gameContext` (or whose `contexts` is unset,
 *     meaning "everywhere") fire.
 *   - `gameContext` is passed explicitly so callers can wire up the
 *     same source of truth the HUD uses for visibility (U8).
 *
 * `preventDefault`: actions with a chord that matches prevent the
 * browser default when we dispatch (avoids Ctrl+S "save page" on
 * manifest save, etc.). Pass `preventDefault: false` in options to
 * opt out for an individual hook instance.
 */

import { useEffect } from "react";
import {
  chordsEqual,
  type InputChord,
  type InputModifierKey,
  type ResolvedInputBindings,
} from "@hyperforge/ui-framework";

export interface UseInputActionsOptions {
  /** Current context for context-filtered actions (same space as U8 widget visibility). */
  gameContext?: string | null;
  /** Call `preventDefault()` when a chord matches. Default: true. */
  preventDefault?: boolean;
  /**
   * When false, the hook ignores events whose target is an input /
   * textarea / contenteditable node. Default: true (ignore).
   */
  ignoreTextInputs?: boolean;
}

export type InputActionHandler = (
  actionId: string,
  event: KeyboardEvent,
) => void;

export function useInputActions(
  resolved: ResolvedInputBindings | null,
  onAction: InputActionHandler,
  options: UseInputActionsOptions = {},
): void {
  const {
    gameContext = null,
    preventDefault = true,
    ignoreTextInputs = true,
  } = options;

  useEffect(() => {
    if (!resolved) return;
    if (typeof window === "undefined") return;

    const handle = (event: KeyboardEvent) => {
      if (ignoreTextInputs && isTextEditingTarget(event.target)) return;

      const liveChord = keyboardEventToChord(event);
      if (!liveChord) return;

      for (const binding of resolved.bindings) {
        if (
          binding.action.contexts &&
          binding.action.contexts.length > 0 &&
          (!gameContext || !binding.action.contexts.includes(gameContext))
        ) {
          continue;
        }
        for (const chord of binding.chords) {
          if (chordsEqual(liveChord, chord)) {
            if (preventDefault) event.preventDefault();
            onAction(binding.action.id, event);
            return; // first match wins — avoid double-firing
          }
        }
      }
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [resolved, onAction, gameContext, preventDefault, ignoreTextInputs]);
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function keyboardEventToChord(event: KeyboardEvent): InputChord | null {
  if (!event.code) return null;
  const modifiers: InputModifierKey[] = [];
  if (event.ctrlKey) modifiers.push("ctrl");
  if (event.metaKey) modifiers.push("meta");
  if (event.altKey) modifiers.push("alt");
  if (event.shiftKey) modifiers.push("shift");
  return { key: event.code, modifiers };
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  return false;
}
