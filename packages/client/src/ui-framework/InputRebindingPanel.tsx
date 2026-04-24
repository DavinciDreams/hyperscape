/**
 * InputRebindingPanel — closes the U10 authoring loop.
 *
 * Reads the resolved input bindings for a manifest, lets the player
 * rebind each rebindable action via a capture modal, and persists
 * overrides through `useSetActionChords`. Non-rebindable actions are
 * still listed (so players can see the locked chord) but the rebind
 * button is hidden.
 *
 * Conflict surfacing:
 *   - We run `validateInputBindings` against a *synthesized* manifest
 *     where each action's defaults are replaced by the resolved chords
 *     (so conflicts detected here reflect the live state, not just the
 *     authored defaults).
 *   - Any conflicts attached to the active action are shown inline.
 *
 * The panel is self-contained and does not depend on World Studio.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  chordToString,
  resolveInputBindings,
  validateInputBindings,
  type InputBindingManifest,
  type InputChord,
  type InputValidationResult,
  type ResolvedInputBinding,
  type ResolvedInputBindings,
} from "@hyperforge/ui-framework";
import {
  useSetActionChords,
  useUserInputBindings,
} from "./useUserInputBindings";

export interface InputRebindingPanelProps {
  manifest: InputBindingManifest;
}

/**
 * Live key capture returns a single chord. Escape cancels.
 */
function useChordCapture(
  enabled: boolean,
  onCapture: (chord: InputChord) => void,
  onCancel: () => void,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handle = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      // Ignore pure modifier presses so the player can hold Ctrl and
      // then press a real key to produce Ctrl+Key.
      if (
        e.code === "ControlLeft" ||
        e.code === "ControlRight" ||
        e.code === "MetaLeft" ||
        e.code === "MetaRight" ||
        e.code === "AltLeft" ||
        e.code === "AltRight" ||
        e.code === "ShiftLeft" ||
        e.code === "ShiftRight"
      ) {
        return;
      }
      const modifiers: InputChord["modifiers"] = [];
      if (e.ctrlKey) modifiers.push("ctrl");
      if (e.metaKey) modifiers.push("meta");
      if (e.altKey) modifiers.push("alt");
      if (e.shiftKey) modifiers.push("shift");
      onCapture({ key: e.code, modifiers });
    };
    window.addEventListener("keydown", handle, { capture: true });
    return () =>
      window.removeEventListener("keydown", handle, { capture: true });
  }, [enabled, onCapture, onCancel]);
}

/**
 * Build a synthetic manifest from the resolved bindings so we can feed
 * live chord state to `validateInputBindings` and surface runtime
 * conflicts, not just authored ones. Actions with zero chords are
 * dropped from the synthesized manifest (unbound = no conflict).
 */
function buildLiveValidation(
  resolved: ResolvedInputBindings,
): InputValidationResult {
  const liveManifest: InputBindingManifest = {
    ...resolved.manifest,
    actions: resolved.bindings
      .filter((b) => b.chords.length > 0)
      .map((b) => ({ ...b.action, defaults: b.chords })),
  };
  if (liveManifest.actions.length === 0) {
    return { ok: true, issues: [] };
  }
  return validateInputBindings(liveManifest);
}

function groupByCategory(
  bindings: ResolvedInputBinding[],
): Record<string, ResolvedInputBinding[]> {
  const out: Record<string, ResolvedInputBinding[]> = {};
  for (const b of bindings) {
    const key = b.action.category ?? "General";
    (out[key] ??= []).push(b);
  }
  return out;
}

export function InputRebindingPanel({
  manifest,
}: InputRebindingPanelProps): React.ReactElement {
  const userBindings = useUserInputBindings(manifest.id);
  const setActionChords = useSetActionChords(manifest.id);

  const resolved = useMemo(
    () => resolveInputBindings(manifest, userBindings),
    [manifest, userBindings],
  );

  const validation = useMemo(() => buildLiveValidation(resolved), [resolved]);

  const [capturing, setCapturing] = useState<string | null>(null);

  useChordCapture(
    capturing !== null,
    (chord) => {
      if (!capturing) return;
      setActionChords(capturing, [chord]);
      setCapturing(null);
    },
    () => setCapturing(null),
  );

  const grouped = useMemo(
    () => groupByCategory(resolved.bindings),
    [resolved.bindings],
  );
  const categoryOrder = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const capturingBinding = capturing
    ? resolved.bindings.find((b) => b.action.id === capturing)
    : null;

  return (
    <div
      className="input-rebinding-panel"
      data-testid="input-rebinding-panel"
      role="region"
      aria-label={`Controls for ${manifest.name}`}
    >
      <header className="input-rebinding-panel__header">
        <h2>Controls — {manifest.name}</h2>
        <p className="input-rebinding-panel__hint">
          Click a chord to rebind. Press <kbd>Esc</kbd> to cancel.
        </p>
      </header>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="input-rebinding-status"
        className="input-rebinding-panel__status"
      >
        {capturingBinding
          ? `Press a key combination to bind to ${capturingBinding.action.label}. Press Escape to cancel.`
          : ""}
      </div>

      {categoryOrder.map((category) => (
        <section
          key={category}
          className="input-rebinding-panel__category"
          data-category={category}
        >
          <h3>{category}</h3>
          <ul>
            {grouped[category]?.map((binding) => {
              const conflict = validation.issues.find(
                (i) =>
                  i.code === "conflict" && i.actionId === binding.action.id,
              );
              return (
                <li
                  key={binding.action.id}
                  data-action-id={binding.action.id}
                  className={[
                    "input-rebinding-panel__row",
                    binding.overridden ? "is-overridden" : "",
                    conflict ? "has-conflict" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="input-rebinding-panel__label">
                    <strong>{binding.action.label}</strong>
                    {binding.action.description && (
                      <span className="input-rebinding-panel__desc">
                        {binding.action.description}
                      </span>
                    )}
                    {conflict && (
                      <span
                        className="input-rebinding-panel__conflict"
                        role="alert"
                      >
                        {conflict.message}
                      </span>
                    )}
                  </div>

                  <div className="input-rebinding-panel__chords">
                    {binding.chords.length === 0 ? (
                      <span className="input-rebinding-panel__unbound">
                        Unbound
                      </span>
                    ) : (
                      binding.chords.map((chord, idx) => (
                        <code
                          key={`${binding.action.id}-${idx}`}
                          className="input-rebinding-panel__chord"
                        >
                          {chordToString(chord) || "—"}
                        </code>
                      ))
                    )}
                  </div>

                  <div className="input-rebinding-panel__actions">
                    {binding.action.rebindable && (
                      <>
                        <button
                          type="button"
                          onClick={() => setCapturing(binding.action.id)}
                          disabled={capturing !== null}
                          aria-pressed={capturing === binding.action.id}
                          aria-label={`Rebind ${binding.action.label}${
                            binding.chords.length > 0
                              ? `, currently ${binding.chords
                                  .map((c) => chordToString(c))
                                  .join(", ")}`
                              : ", currently unbound"
                          }`}
                          data-testid={`rebind-${binding.action.id}`}
                        >
                          {capturing === binding.action.id
                            ? "Press any key…"
                            : "Rebind"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionChords(binding.action.id, [])}
                          disabled={capturing !== null}
                          data-testid={`unbind-${binding.action.id}`}
                        >
                          Unbind
                        </button>
                        {binding.overridden && (
                          <button
                            type="button"
                            onClick={() =>
                              setActionChords(binding.action.id, null)
                            }
                            disabled={capturing !== null}
                            data-testid={`reset-${binding.action.id}`}
                          >
                            Reset
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {resolved.droppedOverrides.length > 0 && (
        <footer className="input-rebinding-panel__dropped">
          <span>
            Dropped stale overrides: {resolved.droppedOverrides.join(", ")}
          </span>
        </footer>
      )}
    </div>
  );
}
