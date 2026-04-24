/**
 * Damage type registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `damage-types.ts`.
 * Indexes authored damage types by id, resolves resistance multipliers
 * for (attackerType, targetType) pairs, and provides the combat-math
 * entry point `applyDamage`.
 *
 * Scope: pure logic. No deps on combat system, entity health, VFX, or
 * networking — can be imported + unit-tested in isolation. Gameplay
 * glue (reading attacker damage type from weapon, resolving target
 * damage tag from NPC archetype, emitting damage events) lives in
 * `CombatSystem` and handlers.
 */

import {
  type DamageType,
  type DamageTypesManifest,
  DamageTypesManifestSchema,
} from "@hyperforge/manifest-schema";

export class UnknownDamageTypeError extends Error {
  readonly damageTypeId: string;
  readonly availableIds: readonly string[];
  constructor(damageTypeId: string, availableIds: readonly string[]) {
    super(
      `damage type "${damageTypeId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownDamageTypeError";
    this.damageTypeId = damageTypeId;
    this.availableIds = availableIds;
  }
}

export class DamageTypeRegistry {
  private _types = new Map<string, DamageType>();
  private _resistances = new Map<string, number>();
  private _defaultMultiplier = 1;

  constructor(manifest?: DamageTypesManifest) {
    if (manifest) this.load(manifest);
  }

  /** Reset + load from an already-validated manifest. */
  load(manifest: DamageTypesManifest): void {
    this._types.clear();
    this._resistances.clear();
    for (const t of manifest.types) this._types.set(t.id, t);
    for (const r of manifest.resistances) {
      this._resistances.set(
        this._resistanceKey(r.attacker, r.target),
        r.multiplier,
      );
    }
    this._defaultMultiplier = manifest.defaultMultiplier;
  }

  /** Parse raw JSON through the schema, then load. */
  loadFromJson(raw: unknown): void {
    this.load(DamageTypesManifestSchema.parse(raw));
  }

  get size(): number {
    return this._types.size;
  }

  /**
   * Non-throwing check for consumers that want to prefer the registry
   * when a manifest has been loaded and fall back to hardcoded defaults
   * otherwise. Symmetric with `WorldAreasRegistry.isLoaded()`.
   */
  isLoaded(): boolean {
    return this._types.size > 0;
  }

  get typeIds(): readonly string[] {
    return Array.from(this._types.keys());
  }

  get defaultMultiplier(): number {
    return this._defaultMultiplier;
  }

  has(id: string): boolean {
    return this._types.has(id);
  }

  get(id: string): DamageType {
    const t = this._types.get(id);
    if (!t)
      throw new UnknownDamageTypeError(id, Array.from(this._types.keys()));
    return t;
  }

  /**
   * Resolve the resistance multiplier for (attacker → target).
   *
   * - Throws `UnknownDamageTypeError` for unknown ids (fail loud — authoring bug).
   * - Returns `1` if the attacker has `ignoresResistances: true` (bypass).
   * - Otherwise looks up the sparse matrix; falls back to `defaultMultiplier`
   *   when no explicit cell is authored.
   */
  resolveMultiplier(attackerId: string, targetId: string): number {
    const attacker = this.get(attackerId);
    this.get(targetId); // validate
    if (attacker.ignoresResistances) return 1;
    const explicit = this._resistances.get(
      this._resistanceKey(attackerId, targetId),
    );
    return explicit ?? this._defaultMultiplier;
  }

  /**
   * Apply typed-damage math: `rawDamage * resolveMultiplier(attacker, target)`.
   * Returns a non-negative number; does not round — rounding/clamping belongs
   * to the gameplay consumer so it can choose floor/ceil policy.
   */
  applyDamage(
    attackerTypeId: string,
    targetTypeId: string,
    rawDamage: number,
  ): number {
    if (!Number.isFinite(rawDamage)) {
      throw new TypeError(
        `rawDamage must be a finite number (got ${String(rawDamage)})`,
      );
    }
    const mult = this.resolveMultiplier(attackerTypeId, targetTypeId);
    const out = rawDamage * mult;
    return out < 0 ? 0 : out;
  }

  private _resistanceKey(attacker: string, target: string): string {
    return `${attacker}→${target}`;
  }
}
