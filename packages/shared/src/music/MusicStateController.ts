/**
 * Music state controller.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `music-state-machine.ts`. Given a state machine + a predicate map
 * (flat `Record<string, boolean>` resolved by the caller from world
 * state), decides when to transition and surfaces a
 * `MusicTransitionEvent` carrying the fade/stinger/quantize data a
 * real audio mixer needs.
 *
 * Scope: pure logic. No deps on Three.js audio, WebAudio, Howler,
 * LiveKit, or any world state. The caller:
 *   1. Builds the predicate record each tick from world/player state.
 *   2. Calls `controller.tick(predicates)`.
 *   3. If a transition event fires, drives the crossfade using the
 *      returned `fadeSec`/`curve`/`stingerId` fields.
 */

import {
  type MusicState,
  type MusicStateMachine,
  type MusicStateMachineManifest,
  type MusicTransition,
  MusicStateMachineManifestSchema,
} from "@hyperforge/manifest-schema";

/** Flat map from predicate name → boolean. Empty string key is never read. */
export type PredicateMap = Record<string, boolean>;

/** Emitted when the controller enters a new state. */
export interface MusicTransitionEvent {
  fromStateId: string;
  toStateId: string;
  transition: MusicTransition;
  /** The full target state — saves the caller a lookup for music/volume. */
  toState: MusicState;
}

export class UnknownMusicStateMachineError extends Error {
  readonly machineId: string;
  readonly availableIds: readonly string[];
  constructor(machineId: string, availableIds: readonly string[]) {
    super(
      `music state machine "${machineId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownMusicStateMachineError";
    this.machineId = machineId;
    this.availableIds = availableIds;
  }
}

export class UnknownMusicStateError extends Error {
  readonly machineId: string;
  readonly stateId: string;
  readonly availableIds: readonly string[];
  constructor(
    machineId: string,
    stateId: string,
    availableIds: readonly string[],
  ) {
    super(
      `music state "${stateId}" not found in machine "${machineId}". Known ids: ${availableIds.join(", ")}`,
    );
    this.name = "UnknownMusicStateError";
    this.machineId = machineId;
    this.stateId = stateId;
    this.availableIds = availableIds;
  }
}

/**
 * Runtime for a single music state machine. Stateful — holds the
 * current state id between ticks.
 */
export class MusicStateController {
  readonly machine: MusicStateMachine;
  private _current: MusicState;
  private _stateById: Map<string, MusicState>;

  constructor(machine: MusicStateMachine) {
    this.machine = machine;
    this._stateById = new Map(machine.states.map((s) => [s.id, s]));
    const initial = this._stateById.get(machine.initial);
    if (!initial) {
      throw new UnknownMusicStateError(
        machine.id,
        machine.initial,
        Array.from(this._stateById.keys()),
      );
    }
    this._current = initial;
  }

  get currentStateId(): string {
    return this._current.id;
  }

  get currentState(): MusicState {
    return this._current;
  }

  /** Reset back to the machine's initial state. */
  reset(): void {
    // Safe: validated in constructor.
    this._current = this._stateById.get(this.machine.initial)!;
  }

  /**
   * Force a specific state — used for debug / editor "enter state"
   * actions. Returns the synthesized transition event, or `null` if
   * already in that state.
   */
  force(stateId: string): MusicTransitionEvent | null {
    const target = this._stateById.get(stateId);
    if (!target) {
      throw new UnknownMusicStateError(
        this.machine.id,
        stateId,
        Array.from(this._stateById.keys()),
      );
    }
    if (target.id === this._current.id) return null;
    const fromStateId = this._current.id;
    this._current = target;
    return {
      fromStateId,
      toStateId: target.id,
      transition: {
        to: target.id,
        when: "",
        priority: 0,
        fadeSec: 0,
        curve: "equal-power",
        quantizeToBar: false,
        stingerId: "",
      },
      toState: target,
    };
  }

  /**
   * Evaluate transitions for the current state. Returns the
   * transition event (and advances internal state) if one satisfied
   * predicate wins; otherwise returns `null` and stays in the
   * current state.
   *
   * Resolution order:
   *   1. Filter `transitions` to those whose `when` evaluates `true`
   *      (empty `when` → always true).
   *   2. Sort by `priority` descending; break ties by manifest order.
   *   3. If the winner's `to` equals the current state id, return
   *      `null` (caller doesn't need to re-play music for a self-loop).
   */
  tick(predicates: PredicateMap): MusicTransitionEvent | null {
    const candidates: Array<{ index: number; t: MusicTransition }> = [];
    const transitions = this._current.transitions;
    for (let i = 0; i < transitions.length; i++) {
      const t = transitions[i]!;
      if (!satisfies(t.when, predicates)) continue;
      candidates.push({ index: i, t });
    }
    if (candidates.length === 0) return null;

    // Higher priority first; stable by manifest order on ties.
    candidates.sort((a, b) => {
      if (b.t.priority !== a.t.priority) return b.t.priority - a.t.priority;
      return a.index - b.index;
    });
    const winner = candidates[0]!.t;
    if (winner.to === this._current.id) return null;

    const next = this._stateById.get(winner.to);
    if (!next) {
      // Schema refinement guarantees `to` is valid, but belt-and-suspenders:
      throw new UnknownMusicStateError(
        this.machine.id,
        winner.to,
        Array.from(this._stateById.keys()),
      );
    }
    const fromStateId = this._current.id;
    this._current = next;
    return {
      fromStateId,
      toStateId: next.id,
      transition: winner,
      toState: next,
    };
  }
}

/**
 * Registry of state machines keyed by id. Doesn't instantiate
 * controllers — the caller owns instantiation (per-world, per-player,
 * per-zone, whatever policy the audio layer picks).
 */
export class MusicStateMachineRegistry {
  private _byId = new Map<string, MusicStateMachine>();

  constructor(manifest?: MusicStateMachineManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: MusicStateMachineManifest): void {
    this._byId.clear();
    for (const m of manifest) this._byId.set(m.id, m);
  }

  loadFromJson(raw: unknown): void {
    this.load(MusicStateMachineManifestSchema.parse(raw));
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

  get(id: string): MusicStateMachine {
    const m = this._byId.get(id);
    if (!m) {
      throw new UnknownMusicStateMachineError(
        id,
        Array.from(this._byId.keys()),
      );
    }
    return m;
  }

  /** Convenience: `new MusicStateController(registry.get(id))`. */
  createController(id: string): MusicStateController {
    return new MusicStateController(this.get(id));
  }
}

function satisfies(when: string, predicates: PredicateMap): boolean {
  if (when === "") return true;
  return predicates[when] === true;
}
