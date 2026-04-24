/**
 * Concrete world-backed `DropConditionKindHandler` implementations.
 *
 * Binds the closed-set `DropCondition` kinds (`quest-active`,
 * `quest-completed`, `has-item`, `level-at-least`) to the live
 * `QuestSystem`, `InventorySystem`, and `SkillsSystem` reads.
 *
 * Every handler is **safe-by-default**:
 *  - Missing `ctx.killerId` → returns `false`.
 *  - Missing / wrong-typed `params` → returns `false`.
 *  - Missing required system → returns `false` (logged once-per-kind at
 *    install time).
 *
 * The handlers are pure read-only — they never mutate world state and
 * never throw on missing data. Any plugin-side throw is re-surfaced
 * to the dispatcher caller; `LootSystem.rollLootFor` then catches it
 * and treats the entry as `false`.
 *
 * ## params conventions
 *
 *  - `quest-active`:    `{ questId: string }`
 *  - `quest-completed`: `{ questId: string }`
 *  - `has-item`:        `{ itemId: string, quantity?: number }` — default qty 1
 *  - `level-at-least`:  `{ skill: string, level: number }`
 */
import type { DropCondition } from "@hyperforge/manifest-schema";

import type { World } from "../../../types/index";
import type { Skills } from "../../../types/entities/entity-types";
import type { QuestSystem } from "../progression/QuestSystem";
import type { InventorySystem } from "../character/InventorySystem";
import type { SkillsSystem } from "../character/SkillsSystem";
import { SystemLogger } from "../../../utils/Logger";

import type { DropConditionDispatcher } from "./DropConditionDispatcher";
import type { LootDropContext } from "./LootSystem";

const KNOWN_SKILLS: ReadonlySet<keyof Skills> = new Set<keyof Skills>([
  "attack",
  "strength",
  "defense",
  "constitution",
  "ranged",
  "magic",
  "prayer",
  "woodcutting",
  "mining",
  "fishing",
  "firemaking",
  "cooking",
  "smithing",
  "agility",
  "crafting",
  "fletching",
  "runecrafting",
]);

function asSkillKey(skill: string): keyof Skills | undefined {
  return KNOWN_SKILLS.has(skill as keyof Skills)
    ? (skill as keyof Skills)
    : undefined;
}

type Params = DropCondition["params"];

function stringParam(params: Params, key: string): string | undefined {
  const v = params[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function numberParam(params: Params, key: string): number | undefined {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** `quest-active` handler — requires `params.questId` + live QuestSystem. */
export function createQuestActiveHandler(
  world: World,
): (params: Params, ctx: LootDropContext) => boolean {
  return (params, ctx) => {
    if (!ctx.killerId) return false;
    const questId = stringParam(params, "questId");
    if (!questId) return false;
    const quests = world.getSystem<QuestSystem>("quest") ?? null;
    if (!quests) return false;
    const active = quests.getActiveQuests(ctx.killerId);
    return active.some(
      (q) => q.questId === questId && q.status !== "completed",
    );
  };
}

/** `quest-completed` handler — requires `params.questId` + live QuestSystem. */
export function createQuestCompletedHandler(
  world: World,
): (params: Params, ctx: LootDropContext) => boolean {
  return (params, ctx) => {
    if (!ctx.killerId) return false;
    const questId = stringParam(params, "questId");
    if (!questId) return false;
    const quests = world.getSystem<QuestSystem>("quest") ?? null;
    if (!quests) return false;
    return quests.hasCompletedQuest(ctx.killerId, questId);
  };
}

/** `has-item` handler — requires `params.itemId`; `params.quantity` defaults to 1. */
export function createHasItemHandler(
  world: World,
): (params: Params, ctx: LootDropContext) => boolean {
  return (params, ctx) => {
    if (!ctx.killerId) return false;
    const itemId = stringParam(params, "itemId");
    if (!itemId) return false;
    const quantity = numberParam(params, "quantity") ?? 1;
    if (quantity <= 0) return false;
    const inv = world.getSystem<InventorySystem>("inventory") ?? null;
    if (!inv) return false;
    return inv.hasItem(ctx.killerId, itemId, quantity);
  };
}

/** `level-at-least` handler — requires `params.skill` + `params.level`. */
export function createLevelAtLeastHandler(
  world: World,
): (params: Params, ctx: LootDropContext) => boolean {
  return (params, ctx) => {
    if (!ctx.killerId) return false;
    const skill = stringParam(params, "skill");
    const level = numberParam(params, "level");
    if (!skill || level === undefined) return false;
    const skillKey = asSkillKey(skill);
    if (!skillKey) return false;
    const skills = world.getSystem<SkillsSystem>("skills") ?? null;
    if (!skills) return false;
    const data = skills.getSkillData(ctx.killerId, skillKey);
    if (!data) return false;
    return data.level >= level;
  };
}

/**
 * Installs every world-backed handler into a dispatcher in one call.
 *
 * Safe to call on server-boot once the world + systems are constructed.
 * Handlers are stateless — they re-resolve `getSystem` on every
 * invocation so a system registered later (or swapped) is picked up
 * without re-installing.
 *
 * Logs a one-time warning per missing system at install time so
 * bootstrap order mistakes are visible.
 */
export function installWorldDropConditions(
  dispatcher: DropConditionDispatcher,
  world: World,
): void {
  const logger = new SystemLogger("WorldDropConditions");
  if (world.getSystem("quest") === null) {
    logger.warn(
      "QuestSystem not registered — quest-active/quest-completed handlers installed but will always return false until it exists",
    );
  }
  if (world.getSystem("inventory") === null) {
    logger.warn(
      "InventorySystem not registered — has-item handler installed but will always return false until it exists",
    );
  }
  if (world.getSystem("skills") === null) {
    logger.warn(
      "SkillsSystem not registered — level-at-least handler installed but will always return false until it exists",
    );
  }
  dispatcher.register("quest-active", createQuestActiveHandler(world));
  dispatcher.register("quest-completed", createQuestCompletedHandler(world));
  dispatcher.register("has-item", createHasItemHandler(world));
  dispatcher.register("level-at-least", createLevelAtLeastHandler(world));
}
