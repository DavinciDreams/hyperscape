/**
 * Interaction prompt selector.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `interaction-prompts.ts`. Given an interaction context, picks the
 * highest-priority prompt whose `interactionKind` matches and whose
 * `autoHideDistanceMeters` is not exceeded. Also surfaces change
 * events for a stateful HUD controller.
 *
 * Scope: pure logic. No deps on React, Three.js, or the input
 * system. The HUD layer subscribes to the controller's output and
 * renders the returned `InteractionPrompt` with its label, icon,
 * fade timings, and anchor.
 */

import {
  type InteractionPrompt,
  type InteractionPromptsManifest,
  InteractionPromptsManifestSchema,
} from "@hyperforge/manifest-schema";

/** Context fed to the selector each tick. */
export interface InteractionContext {
  interactionKind: string;
  distanceMeters: number;
  /**
   * Optional — restrict the match to prompts whose `actionId` the
   * caller considers available. Omitted = no filtering.
   */
  availableActionIds?: ReadonlySet<string>;
}

/** Emitted by the stateful controller when the displayed prompt changes. */
export type PromptChangeEvent =
  | { kind: "show"; prompt: InteractionPrompt }
  | { kind: "hide"; prompt: InteractionPrompt }
  | { kind: "swap"; previous: InteractionPrompt; next: InteractionPrompt };

export class UnknownInteractionPromptError extends Error {
  readonly promptId: string;
  readonly availableIds: readonly string[];
  constructor(promptId: string, availableIds: readonly string[]) {
    super(
      `interaction prompt "${promptId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownInteractionPromptError";
    this.promptId = promptId;
    this.availableIds = availableIds;
  }
}

/**
 * Stateless registry + lookup. Groups prompts by `interactionKind`
 * on load so per-tick selection is O(k) in matched prompts only.
 */
export class InteractionPromptRegistry {
  private _byId = new Map<string, InteractionPrompt>();
  private _byKind = new Map<string, InteractionPrompt[]>();

  constructor(manifest?: InteractionPromptsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: InteractionPromptsManifest): void {
    this._byId.clear();
    this._byKind.clear();
    for (const p of manifest) {
      this._byId.set(p.id, p);
      const arr = this._byKind.get(p.interactionKind) ?? [];
      arr.push(p);
      this._byKind.set(p.interactionKind, arr);
    }
    // Sort per-kind arrays once so selection is already priority-ordered.
    // Schema refinement guarantees unique priority per kind → stable order.
    for (const [, arr] of this._byKind) {
      arr.sort((a, b) => b.priority - a.priority);
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(InteractionPromptsManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byId.size;
  }

  isLoaded(): boolean {
    return this._byId.size > 0;
  }

  get ids(): readonly string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): InteractionPrompt {
    const p = this._byId.get(id);
    if (!p) {
      throw new UnknownInteractionPromptError(
        id,
        Array.from(this._byId.keys()),
      );
    }
    return p;
  }

  /** All prompts registered for an interactionKind, priority-desc. */
  forKind(interactionKind: string): readonly InteractionPrompt[] {
    return this._byKind.get(interactionKind) ?? [];
  }

  /**
   * Stateless selector — returns the best-eligible prompt for `ctx`,
   * or `null` when nothing matches.
   */
  select(ctx: InteractionContext): InteractionPrompt | null {
    if (!Number.isFinite(ctx.distanceMeters) || ctx.distanceMeters < 0) {
      throw new TypeError(
        `distanceMeters must be a non-negative finite number (got ${String(ctx.distanceMeters)})`,
      );
    }
    const candidates = this._byKind.get(ctx.interactionKind);
    if (!candidates) return null;
    for (const p of candidates) {
      if (ctx.distanceMeters > p.autoHideDistanceMeters) continue;
      if (ctx.availableActionIds && !ctx.availableActionIds.has(p.actionId)) {
        continue;
      }
      return p;
    }
    return null;
  }
}

/**
 * Stateful controller — retains the currently-displayed prompt so it
 * can emit `show` / `hide` / `swap` events on each tick.
 */
export class InteractionPromptController {
  readonly registry: InteractionPromptRegistry;
  private _current: InteractionPrompt | null = null;

  constructor(registry: InteractionPromptRegistry) {
    this.registry = registry;
  }

  get current(): InteractionPrompt | null {
    return this._current;
  }

  /** Drop the current prompt without emitting. */
  reset(): void {
    this._current = null;
  }

  /**
   * Evaluate a context + emit a change event if the display should
   * update. Returns `null` when nothing changed.
   *
   * Pass `null` as the context to indicate "no interaction in range"
   * — the controller will emit a `hide` if anything was showing.
   */
  tick(ctx: InteractionContext | null): PromptChangeEvent | null {
    const next = ctx ? this.registry.select(ctx) : null;
    if (next === this._current) return null;
    if (next === null) {
      const previous = this._current!;
      this._current = null;
      return { kind: "hide", prompt: previous };
    }
    if (this._current === null) {
      this._current = next;
      return { kind: "show", prompt: next };
    }
    const previous = this._current;
    this._current = next;
    return { kind: "swap", previous, next };
  }
}
