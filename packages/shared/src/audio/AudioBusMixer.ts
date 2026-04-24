/**
 * Audio bus mixer.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `audio-bus-mix.ts`. Given an authored bus graph (parent chain
 * + per-bus dB fader + mute/solo) and runtime per-bus loudness
 * samples, produces the effective linear gain for every bus each
 * tick. Handles:
 *
 *   - Parent gain cascade (a bus's effective gain = product of its
 *     own linear gain and every parent's linear gain).
 *   - Mute (hard-clamps a bus to 0).
 *   - Solo (any soloed bus mutes all non-solo peers globally).
 *   - Ducking with attack/release envelopes over per-rule state.
 *   - Master dB applied as a final multiplier.
 *
 * Scope: pure logic. The transport (Web Audio, FMOD, etc.) binds
 * returned gains onto its bus stack each frame.
 */

import {
  type AudioBusMixManifest,
  AudioBusMixManifestSchema,
} from "@hyperforge/manifest-schema";

export interface BusRuntimeInput {
  /** Instantaneous linear loudness of this bus this tick (0..1). */
  linearLoudness: number;
}

export interface ComputeGainsOptions {
  /**
   * Delta-time since the last `computeGains()` call in seconds.
   * Determines how far duck envelopes advance. Supplying 0 is
   * valid — envelopes stay put (useful for stateless queries).
   */
  dtSec: number;
}

interface DuckEnvelopeState {
  /** Current attenuation in [attenuationToLinear .. 1]. */
  current: number;
}

export class AudioBusMixer {
  private _manifest: AudioBusMixManifest | null = null;
  private _loudness = new Map<string, number>();
  private _duckEnvelopes: DuckEnvelopeState[] = [];

  constructor(manifest?: AudioBusMixManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: AudioBusMixManifest): void {
    this._manifest = manifest;
    this._loudness.clear();
    // Initialize each duck envelope fully open (attenuation = 1).
    this._duckEnvelopes = manifest.duckRules.map(() => ({ current: 1 }));
  }

  loadFromJson(raw: unknown): void {
    this.load(AudioBusMixManifestSchema.parse(raw));
  }

  /** Clear runtime loudness + reset all envelopes to fully open. */
  reset(): void {
    this._loudness.clear();
    for (const env of this._duckEnvelopes) env.current = 1;
  }

  /** Report a live loudness sample for a bus (linear, 0..1). */
  updateLoudness(busId: string, linear: number): void {
    if (!Number.isFinite(linear) || linear < 0) {
      throw new TypeError(
        `linearLoudness must be a non-negative finite number (got ${String(linear)})`,
      );
    }
    this._loudness.set(busId, linear);
  }

  get size(): number {
    return this._manifest?.buses.length ?? 0;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Compute effective linear gain per bus after cascade + solo/mute
   * + ducking + master. Advances duck envelopes by `dtSec`.
   */
  computeGains(options: ComputeGainsOptions): Map<string, number> {
    const manifest = this._manifest;
    if (!manifest) return new Map();
    if (!Number.isFinite(options.dtSec) || options.dtSec < 0) {
      throw new TypeError(
        `dtSec must be a non-negative finite number (got ${String(options.dtSec)})`,
      );
    }

    // Raw (own) linear gain per bus, pre-cascade.
    const byId = new Map<string, (typeof manifest.buses)[number]>();
    for (const b of manifest.buses) byId.set(b.id, b);

    // Solo set: when any bus is soloed, ONLY that bus, its ancestors,
    // and its descendants play (standard DAW semantics).
    const soloIds = manifest.buses.filter((b) => b.solo).map((b) => b.id);
    const anySolo = soloIds.length > 0;
    const soloActive = new Set<string>();
    if (anySolo) {
      const childrenByParent = new Map<string, string[]>();
      for (const b of manifest.buses) {
        if (b.parent === "") continue;
        const arr = childrenByParent.get(b.parent) ?? [];
        arr.push(b.id);
        childrenByParent.set(b.parent, arr);
      }
      for (const id of soloIds) {
        // Walk up to include every ancestor.
        let cur: string | undefined = id;
        while (cur !== undefined && cur !== "") {
          soloActive.add(cur);
          cur = byId.get(cur)?.parent;
        }
        // Walk down to include every descendant.
        const stack: string[] = [id];
        while (stack.length > 0) {
          const cur2 = stack.pop();
          if (cur2 === undefined) break;
          soloActive.add(cur2);
          for (const c of childrenByParent.get(cur2) ?? []) {
            stack.push(c);
          }
        }
      }
    }

    const ownGain = new Map<string, number>();
    for (const b of manifest.buses) {
      if (b.muted) {
        ownGain.set(b.id, 0);
        continue;
      }
      if (anySolo && !soloActive.has(b.id)) {
        ownGain.set(b.id, 0);
        continue;
      }
      ownGain.set(b.id, dbToLinear(b.volumeDb));
    }

    // Cascade gains through the parent chain. Each bus's effective
    // gain = own * parent's effective gain.
    const effective = new Map<string, number>();
    const resolveEffective = (busId: string): number => {
      const cached = effective.get(busId);
      if (cached !== undefined) return cached;
      const bus = byId.get(busId);
      if (!bus) return 0;
      const own = ownGain.get(busId) ?? 0;
      if (bus.parent === "") {
        effective.set(busId, own);
        return own;
      }
      const parentGain = resolveEffective(bus.parent);
      const eff = own * parentGain;
      effective.set(busId, eff);
      return eff;
    };
    for (const b of manifest.buses) resolveEffective(b.id);

    // Advance duck envelopes + accumulate target attenuations.
    const duckMultiplier = new Map<string, number>();
    for (let i = 0; i < manifest.duckRules.length; i++) {
      const rule = manifest.duckRules[i];
      const env = this._duckEnvelopes[i];
      const triggerLoudness = this._loudness.get(rule.trigger) ?? 0;
      const triggering = triggerLoudness >= rule.thresholdLinear;
      const goal = triggering ? rule.attenuationToLinear : 1;
      const tau = triggering ? rule.attackSec : rule.releaseSec;
      if (tau <= 0 || options.dtSec === 0) {
        env.current = goal;
      } else {
        const alpha = Math.min(1, options.dtSec / tau);
        env.current = env.current + (goal - env.current) * alpha;
      }
      const prev = duckMultiplier.get(rule.target) ?? 1;
      duckMultiplier.set(rule.target, prev * env.current);
    }

    // Apply master + duck to each bus's effective gain.
    const master = dbToLinear(manifest.masterVolumeDb);
    const out = new Map<string, number>();
    for (const b of manifest.buses) {
      const cascade = effective.get(b.id) ?? 0;
      const duck = duckMultiplier.get(b.id) ?? 1;
      out.set(b.id, cascade * master * duck);
    }
    return out;
  }

  /**
   * Read the current duck envelope state for a (trigger, target)
   * pair. Returns 1 when the rule is inactive / not declared.
   */
  getDuckAttenuation(trigger: string, target: string): number {
    if (!this._manifest) return 1;
    const idx = this._manifest.duckRules.findIndex(
      (r) => r.trigger === trigger && r.target === target,
    );
    if (idx < 0) return 1;
    return this._duckEnvelopes[idx].current;
  }
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
