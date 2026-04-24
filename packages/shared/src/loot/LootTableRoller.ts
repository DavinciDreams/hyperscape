/**
 * Loot-table roller.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `loot-tables.ts`.
 * Indexes tables by id and rolls them against an injected RNG +
 * condition evaluator, returning a flat list of `DroppedItem`s.
 *
 * Scope: pure logic. Zero dependencies on ECS, world state,
 * networking, or player entities — callers pass a `RollContext` with
 * `rng()` + `evaluateCondition()` so the roller can be unit-tested
 * deterministically.
 *
 * Recursion: table-kind entries look up a sibling table by id and roll
 * it in-place. The schema already rejects direct self-loops (`table A
 * → table A`) but does not detect multi-hop cycles (`A → B → A`), so
 * the roller guards with a recursion-depth budget.
 *
 * Sink: drops are returned as separate entries even when the same
 * itemId appears multiple times across rolls — the caller decides
 * whether to merge stacks before displaying / awarding.
 */

import {
  type DropCondition,
  type LootEntry,
  type LootTable,
  type LootTablesManifest,
  LootTablesManifestSchema,
} from "@hyperforge/manifest-schema";

/**
 * One item granted by a roll. `quantity` is already resolved from the
 * entry's stack range.
 */
export interface DroppedItem {
  itemId: string;
  quantity: number;
}

/**
 * Context the caller supplies per-roll. `rng` must return `[0, 1)`
 * (like `Math.random`); tests swap in a seeded PRNG. `evaluateCondition`
 * is called at most once per candidate entry per roll and should be
 * side-effect free.
 */
export interface RollContext {
  rng: () => number;
  evaluateCondition: (condition: DropCondition) => boolean;
}

export interface RollerOptions {
  /**
   * Max depth for table-kind entries rolling other tables. Guards
   * against A → B → A multi-hop cycles the schema can't detect.
   * Default 8.
   */
  maxRecursionDepth?: number;
}

const DEFAULT_MAX_RECURSION_DEPTH = 8;

export class UnknownLootTableError extends Error {
  readonly tableId: string;
  readonly availableIds: readonly string[];
  constructor(tableId: string, availableIds: readonly string[]) {
    super(
      `loot table "${tableId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownLootTableError";
    this.tableId = tableId;
    this.availableIds = availableIds;
  }
}

export class LootTableRecursionError extends Error {
  readonly path: readonly string[];
  constructor(path: readonly string[]) {
    super(
      `loot table recursion limit exceeded along path: ${path.join(" → ")}`,
    );
    this.name = "LootTableRecursionError";
    this.path = path;
  }
}

/**
 * Pick an entry from `entries` using weight-proportional sampling
 * against `rng`. Caller must guarantee at least one entry and all
 * weights > 0 (schema enforces `.positive()`).
 */
function pickWeighted(
  entries: readonly LootEntry[],
  rng: () => number,
): LootEntry {
  let totalWeight = 0;
  for (const e of entries) totalWeight += e.weight;
  let r = rng() * totalWeight;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return e;
  }
  // Guard against floating-point drift on the last entry.
  return entries[entries.length - 1]!;
}

/** Pick an integer in `[min, max]` inclusive, uniform. */
function pickStack(min: number, max: number, rng: () => number): number {
  if (min === max) return min;
  return Math.floor(rng() * (max - min + 1)) + min;
}

export class LootTableRoller {
  private tablesById = new Map<string, LootTable>();
  private readonly maxRecursionDepth: number;

  constructor(manifest?: LootTablesManifest, options: RollerOptions = {}) {
    this.maxRecursionDepth =
      options.maxRecursionDepth ?? DEFAULT_MAX_RECURSION_DEPTH;
    if (manifest !== undefined) this.load(manifest);
  }

  /** Replace contents with a pre-validated manifest. */
  load(manifest: LootTablesManifest): void {
    this.tablesById.clear();
    for (const table of manifest) {
      this.tablesById.set(table.id, table);
    }
  }

  /** Validate-and-load untrusted JSON. Throws Zod error on malformed input. */
  loadFromJson(raw: unknown): void {
    const parsed = LootTablesManifestSchema.parse(raw);
    this.load(parsed);
  }

  get tableIds(): readonly string[] {
    return Array.from(this.tablesById.keys());
  }

  get size(): number {
    return this.tablesById.size;
  }

  has(tableId: string): boolean {
    return this.tablesById.has(tableId);
  }

  get(tableId: string): LootTable | undefined {
    return this.tablesById.get(tableId);
  }

  /**
   * Roll `tableId` against `ctx` and return the flat list of drops.
   * Order of drops mirrors the order rolls were produced; subtable
   * drops are inlined in place of the table entry that produced them.
   */
  roll(tableId: string, ctx: RollContext): DroppedItem[] {
    return this.rollInternal(tableId, ctx, [tableId]);
  }

  private rollInternal(
    tableId: string,
    ctx: RollContext,
    path: readonly string[],
  ): DroppedItem[] {
    if (path.length > this.maxRecursionDepth) {
      throw new LootTableRecursionError(path);
    }
    const table = this.tablesById.get(tableId);
    if (table === undefined) {
      throw new UnknownLootTableError(tableId, this.tableIds);
    }

    const rollCount = pickStack(table.rolls.min, table.rolls.max, ctx.rng);
    const drops: DroppedItem[] = [];

    for (let i = 0; i < rollCount; i++) {
      const eligible = table.entries.filter((e) =>
        e.kind === "nothing" ? true : ctx.evaluateCondition(e.condition),
      );
      if (eligible.length === 0) continue;

      const picked = pickWeighted(eligible, ctx.rng);
      if (picked.kind === "item") {
        const qty = pickStack(picked.stack.min, picked.stack.max, ctx.rng);
        if (qty > 0) drops.push({ itemId: picked.itemId, quantity: qty });
      } else if (picked.kind === "table") {
        drops.push(
          ...this.rollInternal(picked.tableId, ctx, [...path, picked.tableId]),
        );
      }
      // "nothing" entry: no drop produced.
    }

    return drops;
  }
}
