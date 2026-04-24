/**
 * Damage-types manifest schema.
 *
 * Section 11 (missing systems → damage-type registry) of the
 * World Studio AAA plan. Complements `combat.ts` by declaring
 * the typed damage namespace (physical / fire / ice / holy /
 * poison / …) and the resistance matrix that maps
 * (attackerType, targetType) → multiplier.
 *
 * Scope: declarative taxonomy + multiplier table. Runtime
 * combat math reads the matrix; this schema only describes
 * the shape of the data.
 */

import { z } from "zod";

/** DamageTypeId — lowerCamelCase ASCII identifier. */
const DamageTypeId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "damage type id must be lowerCamelCase ASCII identifier",
  );

/** Family tag — coarse bucket for UI filters / resistances. */
export const DamageFamilySchema = z.enum([
  "physical",
  "elemental",
  "arcane",
  "holy",
  "shadow",
  "true",
]);
export type DamageFamily = z.infer<typeof DamageFamilySchema>;

/** Named damage type — e.g. `fire`, `slashing`, `holy`. */
export const DamageTypeSchema = z
  .object({
    id: DamageTypeId,
    name: z.string().min(1),
    description: z.string().default(""),
    family: DamageFamilySchema,
    /** Hex color for UI — e.g. damage numbers. */
    displayColor: z
      .string()
      .regex(
        /^#[0-9a-fA-F]{6}$/,
        "displayColor must be a 7-char hex string like `#ff8040`",
      ),
    /** Optional VFX id to play on hit (resolves against vfx manifest). */
    hitVfxId: z.string().default(""),
    /** Optional SFX id to play on hit (resolves against sfx manifest). */
    hitSfxId: z.string().default(""),
    /** Bypasses damage mitigation entirely — `true`-family types typically. */
    ignoresResistances: z.boolean().default(false),
  })
  .strict();
export type DamageType = z.infer<typeof DamageTypeSchema>;

/** One cell of the resistance matrix. */
export const DamageResistanceEntrySchema = z
  .object({
    /** Damage type being dealt. */
    attacker: DamageTypeId,
    /** Damage type category of the target (e.g. target creature tag). */
    target: DamageTypeId,
    /** Multiplier applied to the damage — 0 = immune, 1 = normal, 2 = double. */
    multiplier: z.number().min(0).max(10),
  })
  .strict();
export type DamageResistanceEntry = z.infer<typeof DamageResistanceEntrySchema>;

export const DamageTypesManifestSchema = z
  .object({
    types: z.array(DamageTypeSchema).min(1),
    /** Sparse resistance cells — cells absent use `defaultMultiplier`. */
    resistances: z.array(DamageResistanceEntrySchema).default([]),
    /** Multiplier used when no explicit (attacker,target) cell is provided. */
    defaultMultiplier: z.number().min(0).max(10).default(1),
  })
  .refine(
    ({ types }) => new Set(types.map((t) => t.id)).size === types.length,
    { message: "damage type ids must be unique" },
  )
  .refine(
    ({ types, resistances }) => {
      const ids = new Set(types.map((t) => t.id));
      return resistances.every((r) => ids.has(r.attacker) && ids.has(r.target));
    },
    {
      message:
        "resistance `attacker` and `target` must reference declared damage type ids",
    },
  )
  .refine(
    ({ resistances }) => {
      const keys = resistances.map((r) => `${r.attacker}→${r.target}`);
      return new Set(keys).size === keys.length;
    },
    { message: "duplicate (attacker, target) resistance cells are ambiguous" },
  )
  .refine(
    ({ types, resistances }) => {
      // A `true`-family / ignoresResistances type cannot also appear as an attacker
      // in the resistance table — its multiplier is always 1 by contract.
      const bypassIds = new Set(
        types.filter((t) => t.ignoresResistances).map((t) => t.id),
      );
      return resistances.every((r) => !bypassIds.has(r.attacker));
    },
    {
      message:
        "damage types with `ignoresResistances: true` must not have entries in the resistance matrix",
    },
  );
export type DamageTypesManifest = z.infer<typeof DamageTypesManifestSchema>;
