/**
 * Talent-trees manifest schema.
 *
 * Authored registry for branching progression trees — the "spend
 * N points across a DAG of nodes to customize character build"
 * pattern (WoW talent trees, PoE passive tree, Diablo 2 skill tree,
 * FF14 job actions unlocked by level).
 *
 * A talent tree is a directed acyclic graph of nodes. A node may
 * grant a stat boost, unlock an ability, modify an existing ability,
 * apply a passive, or be a "keystone" that reshapes how a build
 * plays. Nodes have prerequisites (other nodes reaching point
 * threshold) and cost (points per rank). Trees are keyed by kind:
 * class, weapon, profession, racial, or custom (plugin-defined).
 *
 * Scope: authored DAG + respec rules. Runtime `TalentTreeSystem`
 * owns per-character allocation state, point budget derivation from
 * level/XP, prerequisite enforcement on spend, respec flow + cost
 * settlement, and the tree-viewer UI — all separate follow-ups.
 *
 * Scope-isolated from `xp-curves.ts` (point-granting level curve
 * lives there — trees just consume points), `status-effects.ts`
 * (a talent may apply a status effect by id — trees never define
 * one), and `item-sets.ts` (set bonuses are item-driven, talents
 * are choice-driven; both can target the same 20-stat vocabulary).
 */

import { z } from "zod";

/** TalentNodeId — lowerCamelCase ASCII identifier. */
const TalentNodeId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "talent node id must be lowerCamelCase ASCII identifier",
  );

/** TalentTreeId — lowerCamelCase ASCII identifier. */
const TalentTreeId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "talent tree id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/**
 * Tree kind — what category of progression this tree represents.
 */
export const TalentTreeKindSchema = z.enum([
  "class",
  "weapon",
  "profession",
  "racial",
  "pet",
  "custom",
]);
export type TalentTreeKind = z.infer<typeof TalentTreeKindSchema>;

/**
 * Node effect kind — what spending a point on this node does.
 */
export const TalentNodeKindSchema = z.enum([
  "statBoost",
  "abilityGrant",
  "abilityModifier",
  "passive",
  "keystone",
  "aura",
]);
export type TalentNodeKind = z.infer<typeof TalentNodeKindSchema>;

/**
 * Prerequisite — require node X to have ≥ minPoints allocated to it.
 */
export const TalentPrerequisiteSchema = z
  .object({
    nodeId: TalentNodeId,
    minPoints: z.number().int().min(1).max(10).default(1),
  })
  .strict();
export type TalentPrerequisite = z.infer<typeof TalentPrerequisiteSchema>;

/**
 * Talent node — one DAG vertex.
 */
export const TalentNodeSchema = z
  .object({
    id: TalentNodeId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    kind: TalentNodeKindSchema,
    /**
     * Tier — rank within the tree. Point-floor gating: tier N requires
     * `tier * tierPointRequirement` total points spent in the tree.
     */
    tier: z.number().int().min(0).max(20).default(0),
    /** Max rank a player can reach on this node (1 = binary). */
    maxPoints: z.number().int().min(1).max(10).default(1),
    /** Point cost per rank (typically 1). */
    costPerPoint: z.number().int().min(1).max(5).default(1),
    /** Other nodes that must reach a point floor before this is selectable. */
    prerequisites: z.array(TalentPrerequisiteSchema).default([]),
    /**
     * Shape-only ref to the ability granted (if kind='abilityGrant') or
     * modified (if kind='abilityModifier'). Loader resolves against
     * combat-spells / prayers / runes. Ignored for other kinds.
     */
    abilityRef: ManifestRef.or(z.literal("")).default(""),
    /**
     * Shape-only ref to the status effect applied (if kind='aura'|'passive').
     * Empty = no effect (pure stat-boost or ability-change).
     */
    statusEffectRef: ManifestRef.or(z.literal("")).default(""),
    /**
     * Keystone-level tags (free-form) for UI highlighting + build filters.
     * Empty arrays allowed (most nodes are not keystones).
     */
    keystoneTags: z.array(z.string().min(1)).default([]),
    /** Display grid position — authors lay out the tree visually. */
    gridX: z.number().int().min(0).max(20).default(0),
    gridY: z.number().int().min(0).max(40).default(0),
    /**
     * If true, this node is mutually exclusive with its siblings at the
     * same tier + prerequisite set (PoE Cluster Jewel "choice" pattern).
     * Respec is required to switch.
     */
    exclusiveWithSiblings: z.boolean().default(false),
  })
  .strict()
  .refine(
    ({ kind, abilityRef }) =>
      (kind !== "abilityGrant" && kind !== "abilityModifier") ||
      abilityRef !== "",
    {
      message:
        "kind='abilityGrant'|'abilityModifier' requires abilityRef (empty refs point to no ability)",
    },
  )
  .refine(
    ({ kind, keystoneTags }) => kind !== "keystone" || keystoneTags.length > 0,
    {
      message:
        "kind='keystone' requires at least one keystoneTag (keystones are grouped for UI highlight)",
    },
  )
  .refine(({ kind, maxPoints }) => kind !== "keystone" || maxPoints === 1, {
    message:
      "kind='keystone' requires maxPoints=1 (keystones are binary build-defining choices)",
  });
export type TalentNode = z.infer<typeof TalentNodeSchema>;

/**
 * Talent tree — the root DAG container.
 */
export const TalentTreeSchema = z
  .object({
    id: TalentTreeId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    kind: TalentTreeKindSchema,
    /**
     * Custom kind key — required when `kind='custom'`, ignored otherwise.
     */
    customKey: z.string().default(""),
    /** Shape-only ref to the class/weapon/profession this tree attaches to. */
    ownerRef: ManifestRef.or(z.literal("")).default(""),
    /** Total points the tree grants over a full character lifetime (0..200). */
    totalPointsAvailable: z.number().int().min(0).max(200).default(30),
    /**
     * Points required per tier — tier N becomes selectable after the
     * player has spent `tier * tierPointRequirement` points anywhere
     * in THIS tree. 0 = no tier gating.
     */
    tierPointRequirement: z.number().int().min(0).max(20).default(5),
    /** Nodes in the tree. */
    nodes: z.array(TalentNodeSchema).default([]),
    /** If true, respec is permitted on this tree. */
    allowRespec: z.boolean().default(true),
  })
  .strict()
  .refine(({ kind, customKey }) => kind !== "custom" || customKey.length > 0, {
    message: "tree kind='custom' requires a non-empty customKey",
  })
  .refine(
    ({ nodes }) => new Set(nodes.map((n) => n.id)).size === nodes.length,
    { message: "tree node ids must be unique within a tree" },
  )
  .refine(
    ({ nodes }) => {
      const ids = new Set(nodes.map((n) => n.id));
      return nodes.every((n) =>
        n.prerequisites.every((p) => ids.has(p.nodeId)),
      );
    },
    {
      message: "all prerequisite node ids must resolve to a node in this tree",
    },
  )
  .refine(
    ({ nodes }) =>
      nodes.every((n) =>
        n.prerequisites.every((p) => {
          const target = nodes.find((x) => x.id === p.nodeId);
          return target !== undefined && p.minPoints <= target.maxPoints;
        }),
      ),
    {
      message:
        "prerequisite minPoints must be ≤ target node's maxPoints (otherwise the prereq is impossible to satisfy)",
    },
  )
  .refine(
    ({ nodes }) =>
      nodes.every((n) =>
        n.prerequisites.every((p) => {
          const target = nodes.find((x) => x.id === p.nodeId);
          return target !== undefined && target.tier < n.tier;
        }),
      ),
    {
      message:
        "prerequisite target must be at a strictly lower tier than the dependent node (otherwise the tier gate is circular)",
    },
  )
  .refine(
    ({ nodes }) => {
      // DFS cycle detection on prerequisite graph.
      const idMap = new Map(nodes.map((n) => [n.id, n]));
      const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
      const color = new Map<string, number>();
      for (const n of nodes) color.set(n.id, WHITE);
      const visit = (id: string): boolean => {
        color.set(id, GRAY);
        const node = idMap.get(id);
        if (!node) return true;
        for (const p of node.prerequisites) {
          const c = color.get(p.nodeId);
          if (c === GRAY) return false;
          if (c === WHITE && !visit(p.nodeId)) return false;
        }
        color.set(id, BLACK);
        return true;
      };
      for (const n of nodes) {
        if (color.get(n.id) === WHITE && !visit(n.id)) return false;
      }
      return true;
    },
    { message: "prerequisite graph must be acyclic (DAG)" },
  )
  .refine(
    ({ nodes, totalPointsAvailable, tierPointRequirement }) => {
      if (nodes.length === 0) return true;
      const maxTier = Math.max(...nodes.map((n) => n.tier));
      return maxTier * tierPointRequirement <= totalPointsAvailable;
    },
    {
      message:
        "highest tier × tierPointRequirement must be ≤ totalPointsAvailable (else top-tier nodes are unreachable)",
    },
  );
export type TalentTree = z.infer<typeof TalentTreeSchema>;

/**
 * Respec rules — global cost model for reallocating points.
 */
export const TalentRespecRulesSchema = z
  .object({
    /** If true, respec is permitted globally. Per-tree flag can disable. */
    enabled: z.boolean().default(true),
    /** Base cost (currency units) of a respec. */
    baseCostCurrency: z.number().int().min(0).max(1_000_000).default(1000),
    /** Currency id for the cost. */
    costCurrencyId: ManifestRef.default("gold"),
    /** Cost multiplier per prior respec (escalating-cost pattern). */
    costMultiplierPerUse: z.number().min(1).max(10).default(1.5),
    /** Free respecs per week (0 = none). */
    freeRespecsPerWeek: z.number().int().min(0).max(10).default(1),
    /** Cooldown between respecs in hours (0 = no cooldown). */
    respecCooldownHours: z.number().int().min(0).max(720).default(0),
    /**
     * If true, respecs are partial (per-tree) rather than all-trees-at-once.
     * Per-tree is usually more player-friendly; full-wipe is rarer.
     */
    allowPartialRespec: z.boolean().default(true),
  })
  .strict()
  .refine(
    ({ enabled, baseCostCurrency, freeRespecsPerWeek }) =>
      !enabled || baseCostCurrency > 0 || freeRespecsPerWeek > 0,
    {
      message:
        "respec enabled=true requires either baseCostCurrency > 0 or freeRespecsPerWeek > 0 (else respec is simultaneously enabled and impossible)",
    },
  );
export type TalentRespecRules = z.infer<typeof TalentRespecRulesSchema>;

export const TalentTreesManifestSchema = z
  .object({
    /** If true, the talent-tree system is active. */
    enabled: z.boolean().default(true),
    trees: z.array(TalentTreeSchema).default([]),
    respec: TalentRespecRulesSchema.default(() =>
      TalentRespecRulesSchema.parse({}),
    ),
  })
  .strict()
  .refine(
    ({ trees }) => new Set(trees.map((t) => t.id)).size === trees.length,
    { message: "tree ids must be unique across the manifest" },
  )
  .refine(({ enabled, trees }) => !enabled || trees.length > 0, {
    message:
      "talent system enabled=true requires at least one tree (else the UI has nothing to show)",
  });
export type TalentTreesManifest = z.infer<typeof TalentTreesManifestSchema>;
