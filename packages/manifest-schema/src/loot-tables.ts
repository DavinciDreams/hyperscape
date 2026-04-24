/**
 * Loot-tables manifest schema.
 *
 * Core RPG primitive used by mobs, chests, quest rewards, boss kills,
 * fishing catches, and gathering node drops. A loot table is a set of
 * weighted entries; rolling a table returns zero-or-more items based
 * on entry weights and optional drop conditions.
 *
 * Each entry can either be:
 * - `item`: drop a specific item-id with a stack range
 * - `table`: recursively roll another loot table (allows "common
 *    mob drops" to be reused across many creatures)
 * - `nothing`: a no-drop weight so tables can be tuned to drop
 *    nothing sometimes without pre-computing all weights
 *
 * The `rolls` field determines how many independent draws are made
 * against the table — bosses typically have `rolls: {min: 3, max: 5}`
 * for guaranteed multi-drops.
 */

import { z } from "zod";

/**
 * Stack count range. `min` ≤ `max`; if both equal 1, the interpreter
 * can skip the RNG.
 */
export const StackRangeSchema = z
  .object({
    min: z.number().int().nonnegative(),
    max: z.number().int().positive(),
  })
  .refine(({ min, max }) => min <= max, {
    message: "stack range `min` must be ≤ `max`",
  });
export type StackRange = z.infer<typeof StackRangeSchema>;

/**
 * Optional drop gate — the entry only counts if the player meets
 * the condition. Kept as a loose kind/params discriminator; the
 * runtime resolves the predicate against player state.
 */
export const DropConditionSchema = z.object({
  kind: z.enum([
    "always",
    "quest-active",
    "quest-completed",
    "level-at-least",
    "has-item",
    "custom",
  ]),
  params: z
    .record(z.string().min(1), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
});
export type DropCondition = z.infer<typeof DropConditionSchema>;

const ItemEntrySchema = z.object({
  kind: z.literal("item"),
  itemId: z.string().min(1),
  weight: z.number().positive(),
  stack: StackRangeSchema.default({ min: 1, max: 1 }),
  condition: DropConditionSchema.default({ kind: "always", params: {} }),
});

const TableEntrySchema = z.object({
  kind: z.literal("table"),
  tableId: z.string().min(1),
  weight: z.number().positive(),
  condition: DropConditionSchema.default({ kind: "always", params: {} }),
});

const NothingEntrySchema = z.object({
  kind: z.literal("nothing"),
  weight: z.number().positive(),
});

export const LootEntrySchema = z.discriminatedUnion("kind", [
  ItemEntrySchema,
  TableEntrySchema,
  NothingEntrySchema,
]);
export type LootEntry = z.infer<typeof LootEntrySchema>;

/** Number of independent rolls against the table. */
export const RollCountSchema = z
  .object({
    min: z.number().int().nonnegative(),
    max: z.number().int().positive(),
  })
  .refine(({ min, max }) => min <= max, {
    message: "roll count `min` must be ≤ `max`",
  });
export type RollCount = z.infer<typeof RollCountSchema>;

export const LootTableSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    rolls: RollCountSchema.default({ min: 1, max: 1 }),
    entries: z.array(LootEntrySchema).min(1),
  })
  .refine(
    ({ id, entries }) =>
      entries.every((e) => e.kind !== "table" || e.tableId !== id),
    { message: "loot table cannot roll itself directly — use another table" },
  );
export type LootTable = z.infer<typeof LootTableSchema>;

export const LootTablesManifestSchema = z
  .array(LootTableSchema)
  .refine((list) => new Set(list.map((t) => t.id)).size === list.length, {
    message: "loot table ids must be unique",
  })
  .refine(
    (list) => {
      const ids = new Set(list.map((t) => t.id));
      return list.every((t) =>
        t.entries.every((e) => e.kind !== "table" || ids.has(e.tableId)),
      );
    },
    {
      message:
        "every `kind: 'table'` entry must reference an existing loot table id",
    },
  );
export type LootTablesManifest = z.infer<typeof LootTablesManifestSchema>;
