/**
 * Feature flags manifest schema.
 *
 * Authored runtime toggles + rollout policies so live-ops can enable
 * features by cohort without code changes. Each flag is either a
 * boolean or a string-valued variant; rollout rules target players
 * by account age, platform, region, percentage hash bucket, and/or
 * explicit allow/block lists.
 *
 * Scope-isolated from:
 *   - `analytics-events.ts` (observability — flags are the *cause*
 *     variable on analytics cohort splits, but flags don't emit events)
 *   - `deploy-targets.ts` (CI/CD target config — flags are a *runtime*
 *     toggle orthogonal to build targets)
 *   - `project-settings.ts` (baseline quality/toggles shipped in build)
 *
 * Runtime `FeatureFlagRegistry` owns the hash bucketing, evaluation
 * order, cache invalidation, remote-config bridge, and admin override
 * layer — none of that lives in this schema.
 */

import { z } from "zod";

/** FlagId — lowerCamelCase. */
const FlagId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "flag id must be lowerCamelCase ASCII identifier",
  );

/** RuleId — lowerCamelCase. */
const RuleId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "rule id must be lowerCamelCase ASCII identifier",
  );

/** Supported platforms for targeting. */
export const PlatformSchema = z.enum([
  "web",
  "windows",
  "macos",
  "linux",
  "ios",
  "android",
  "steam",
]);
export type Platform = z.infer<typeof PlatformSchema>;

/**
 * Rollout targeting rule — a predicate applied to the evaluating
 * principal (player). All specified criteria must match (AND). Each
 * optional criterion left unset is a wildcard match.
 */
export const TargetingRuleSchema = z
  .object({
    id: RuleId,
    /** Human-readable note for live-ops review. */
    description: z.string().default(""),
    /** Percent of eligible players who pass this rule (0..100). */
    rolloutPercent: z.number().int().min(0).max(100).default(100),
    /** Minimum account age in days (0 = no minimum). */
    minAccountAgeDays: z.number().int().min(0).max(3650).default(0),
    /** Minimum character level (0 = no minimum). */
    minCharacterLevel: z.number().int().min(0).max(200).default(0),
    /** Restrict to specific platforms (empty = all). */
    platforms: z.array(PlatformSchema).default([]),
    /** Restrict to specific region/locale prefixes (empty = all). */
    regionPrefixes: z.array(z.string().min(2).max(8)).default([]),
    /** Explicit allow list (accountIds/userIds) — bypasses percent. */
    allowAccountIds: z.array(z.string().min(1)).default([]),
    /** Explicit block list — always fails rule even if percent passes. */
    blockAccountIds: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type TargetingRule = z.infer<typeof TargetingRuleSchema>;

/** Boolean flag — evaluates to true or false. */
export const BooleanFlagBodySchema = z
  .object({
    kind: z.literal("boolean"),
    /** Value returned to players who match any `enabledForRuleIds`. */
    enabledValue: z.literal(true).default(true),
    /** Default value for everyone else. */
    defaultValue: z.boolean().default(false),
    /** Rule ids that opt a player into `enabledValue`. */
    enabledForRuleIds: z.array(RuleId).default([]),
  })
  .strict();
export type BooleanFlagBody = z.infer<typeof BooleanFlagBodySchema>;

/**
 * Variant flag — returns one of a set of named string variants.
 * A rule→variant mapping says which rule assigns which variant.
 * Rules are evaluated in array order; first match wins.
 */
export const VariantFlagVariantSchema = z
  .object({
    value: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "variant value must be lowerCamelCase ASCII identifier",
      ),
    description: z.string().default(""),
  })
  .strict();
export type VariantFlagVariant = z.infer<typeof VariantFlagVariantSchema>;

export const VariantAssignmentSchema = z
  .object({
    ruleId: RuleId,
    variantValue: z.string().min(1),
  })
  .strict();
export type VariantAssignment = z.infer<typeof VariantAssignmentSchema>;

export const VariantFlagBodySchema = z
  .object({
    kind: z.literal("variant"),
    /** All known variants. Must include the default. */
    variants: z.array(VariantFlagVariantSchema).min(1),
    /** Fallback variant for players matching no rule. */
    defaultVariantValue: z.string().min(1),
    /** Ordered rule→variant mapping; first match wins. */
    assignments: z.array(VariantAssignmentSchema).default([]),
  })
  .strict()
  .refine(
    (b) => new Set(b.variants.map((v) => v.value)).size === b.variants.length,
    { message: "variant values must be unique", path: ["variants"] },
  )
  .refine((b) => b.variants.some((v) => v.value === b.defaultVariantValue), {
    message: "defaultVariantValue must be one of the declared variants",
    path: ["defaultVariantValue"],
  })
  .refine(
    (b) => {
      const known = new Set(b.variants.map((v) => v.value));
      return b.assignments.every((a) => known.has(a.variantValue));
    },
    {
      message: "all assignment.variantValue must be declared in variants",
      path: ["assignments"],
    },
  );
export type VariantFlagBody = z.infer<typeof VariantFlagBodySchema>;

/**
 * Single feature flag entry — boolean or variant.
 */
export const FeatureFlagSchema = z
  .object({
    id: FlagId,
    name: z.string().min(1),
    description: z.string().default(""),
    /** If false, flag returns `defaultValue`/`defaultVariantValue`. */
    enabled: z.boolean().default(true),
    /** Team-owned tag for ownership/rollback dashboards. */
    ownerTeamTag: z.string().default(""),
    /** ISO-8601 date after which runtime should warn this flag is stale. */
    staleAfterIso: z.string().default(""),
    body: z.discriminatedUnion("kind", [
      BooleanFlagBodySchema,
      VariantFlagBodySchema,
    ]),
  })
  .strict();
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

/**
 * Mutual-exclusion group — at most one flag in the group may be
 * enabled per player (e.g. competing UI redesigns).
 */
export const MutexGroupSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "mutex group id must be lowerCamelCase ASCII identifier",
      ),
    name: z.string().min(1),
    /** Flag ids in the group. */
    flagIds: z.array(FlagId).min(2),
  })
  .strict()
  .refine((g) => new Set(g.flagIds).size === g.flagIds.length, {
    message: "mutex group flagIds must be unique",
    path: ["flagIds"],
  });
export type MutexGroup = z.infer<typeof MutexGroupSchema>;

/**
 * Feature flags manifest — top-level authored document.
 */
export const FeatureFlagsManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Named targeting rules referenced by flags. */
    rules: z.array(TargetingRuleSchema).default([]),
    /** Feature flag registry. */
    flags: z.array(FeatureFlagSchema).default([]),
    /** Mutual-exclusion groups across flags. */
    mutexGroups: z.array(MutexGroupSchema).default([]),
  })
  .strict()
  .refine((m) => new Set(m.rules.map((r) => r.id)).size === m.rules.length, {
    message: "rule ids must be unique",
    path: ["rules"],
  })
  .refine((m) => new Set(m.flags.map((f) => f.id)).size === m.flags.length, {
    message: "flag ids must be unique",
    path: ["flags"],
  })
  .refine(
    (m) =>
      new Set(m.mutexGroups.map((g) => g.id)).size === m.mutexGroups.length,
    { message: "mutex group ids must be unique", path: ["mutexGroups"] },
  )
  .refine(
    (m) => {
      const ruleIds = new Set(m.rules.map((r) => r.id));
      return m.flags.every((f) => {
        if (f.body.kind === "boolean") {
          return f.body.enabledForRuleIds.every((id) => ruleIds.has(id));
        }
        return f.body.assignments.every((a) => ruleIds.has(a.ruleId));
      });
    },
    {
      message: "all rule references in flag bodies must resolve",
      path: ["flags"],
    },
  )
  .refine(
    (m) => {
      const flagIds = new Set(m.flags.map((f) => f.id));
      return m.mutexGroups.every((g) =>
        g.flagIds.every((id) => flagIds.has(id)),
      );
    },
    {
      message: "mutex group flagIds must resolve to declared flags",
      path: ["mutexGroups"],
    },
  )
  .refine(
    (m) => {
      const seen = new Set<string>();
      for (const g of m.mutexGroups) {
        for (const fid of g.flagIds) {
          if (seen.has(fid)) return false;
          seen.add(fid);
        }
      }
      return true;
    },
    {
      message: "each flag may belong to at most one mutex group",
      path: ["mutexGroups"],
    },
  );
export type FeatureFlagsManifest = z.infer<typeof FeatureFlagsManifestSchema>;
