/**
 * ConditionEvaluator — Default condition node evaluators for script graphs.
 *
 * Each evaluator receives node data and execution context,
 * returns true/false for branching decisions.
 */

import type {
  ConditionEvaluator as ConditionEvalFn,
  ExecutionContext,
} from "./ScriptGraphInterpreter";

// ---------------------------------------------------------------------------
// Default condition evaluators
// ---------------------------------------------------------------------------

const hasItem: ConditionEvalFn = (data, ctx) => {
  const itemId = data.itemId as string;
  const playerId = (data.playerId as string) ?? ctx.triggerData.playerId;
  if (!itemId || !playerId) return false;

  // Check via world entity data
  const player = ctx.world.getEntityById(playerId);
  if (!player) return false;

  const inventory = player.inventory as
    | Array<{ itemId: string; quantity: number }>
    | undefined;
  if (!inventory) return false;

  const requiredCount = (data.quantity as number) ?? 1;
  const item = inventory.find((i) => i.itemId === itemId);
  return !!item && item.quantity >= requiredCount;
};

const questState: ConditionEvalFn = (data, ctx) => {
  const questId = data.questId as string;
  const expectedState = data.state as string; // "not_started", "in_progress", "completed"
  const playerId = (data.playerId as string) ?? ctx.triggerData.playerId;
  if (!questId || !expectedState || !playerId) return false;

  const player = ctx.world.getEntityById(playerId);
  if (!player) return false;

  const quests = player.quests as Record<string, { state: string }> | undefined;
  const questData = quests?.[questId];

  if (expectedState === "not_started") return !questData;
  return questData?.state === expectedState;
};

const skillLevel: ConditionEvalFn = (data, ctx) => {
  const skillId = data.skillId as string;
  const minLevel = (data.minLevel as number) ?? 1;
  const playerId = (data.playerId as string) ?? ctx.triggerData.playerId;
  if (!skillId || !playerId) return false;

  const player = ctx.world.getEntityById(playerId);
  if (!player) return false;

  const skills = player.skills as Record<string, { level: number }> | undefined;
  return (skills?.[skillId]?.level ?? 0) >= minLevel;
};

const compareNumber: ConditionEvalFn = (data, ctx) => {
  const leftVar = data.variable as string;
  const operator = (data.operator as string) ?? "==";
  const rightValue = data.value as number;

  const leftValue = leftVar
    ? ((ctx.variables.get(leftVar) as number) ?? 0)
    : ((data.leftValue as number) ?? 0);

  switch (operator) {
    case "==":
      return leftValue === rightValue;
    case "!=":
      return leftValue !== rightValue;
    case ">":
      return leftValue > rightValue;
    case ">=":
      return leftValue >= rightValue;
    case "<":
      return leftValue < rightValue;
    case "<=":
      return leftValue <= rightValue;
    default:
      return false;
  }
};

const andGate: ConditionEvalFn = (data, ctx) => {
  // AND gate checks all connected input data ports
  const inputs = data._inputValues as boolean[] | undefined;
  if (!inputs || inputs.length === 0) return true;
  return inputs.every(Boolean);
};

const orGate: ConditionEvalFn = (data, ctx) => {
  const inputs = data._inputValues as boolean[] | undefined;
  if (!inputs || inputs.length === 0) return false;
  return inputs.some(Boolean);
};

// ---------------------------------------------------------------------------
// Combat conditions
// ---------------------------------------------------------------------------

const isInCombat: ConditionEvalFn = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (!entityId) return false;

  const entity = ctx.world.getEntityById(entityId);
  if (!entity) return false;

  return !!(entity.inCombat ?? entity.combatTarget);
};

const isAlive: ConditionEvalFn = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (!entityId) return false;

  const entity = ctx.world.getEntityById(entityId);
  if (!entity) return false;

  const health = entity.health as number | undefined;
  const hp = entity.hp as number | undefined;
  return (health ?? hp ?? 0) > 0;
};

const healthCheck: ConditionEvalFn = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (!entityId) return false;

  const entity = ctx.world.getEntityById(entityId);
  if (!entity) return false;

  const currentHp = (entity.health as number) ?? (entity.hp as number) ?? 0;
  const maxHp = (entity.maxHealth as number) ?? (entity.maxHp as number) ?? 1;
  const healthPercent = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;

  const threshold = (data.threshold as number) ?? 50;
  const comparison = (data.comparison as string) ?? "below";

  return comparison === "above"
    ? healthPercent >= threshold
    : healthPercent < threshold;
};

// ---------------------------------------------------------------------------
// Equipment / inventory conditions
// ---------------------------------------------------------------------------

const hasEquipped: ConditionEvalFn = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  const itemId = data.itemId as string;
  const slot = data.slot as string | undefined;
  if (!playerId || !itemId) return false;

  const player = ctx.world.getEntityById(playerId);
  if (!player) return false;

  const equipment = player.equipment as Record<string, string> | undefined;
  if (!equipment) return false;

  if (slot) {
    return equipment[slot] === itemId;
  }
  return Object.values(equipment).includes(itemId);
};

const hasCoins: ConditionEvalFn = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  const amount = (data.amount as number) ?? 0;
  if (!playerId) return false;

  const player = ctx.world.getEntityById(playerId);
  if (!player) return false;

  const coins = (player.coins as number) ?? (player.gold as number) ?? 0;
  return coins >= amount;
};

// ---------------------------------------------------------------------------
// Zone / position conditions
// ---------------------------------------------------------------------------

const isInZone: ConditionEvalFn = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  const zoneId = data.zoneId as string;
  if (!entityId || !zoneId) return false;

  const entity = ctx.world.getEntityById(entityId);
  if (!entity) return false;

  const currentZone = entity.zone as string | undefined;
  const currentZoneId = entity.zoneId as string | undefined;
  return currentZone === zoneId || currentZoneId === zoneId;
};

// ---------------------------------------------------------------------------
// Prayer conditions
// ---------------------------------------------------------------------------

const isPrayerActive: ConditionEvalFn = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  const prayerId = data.prayerId as string;
  if (!playerId || !prayerId) return false;

  const player = ctx.world.getEntityById(playerId);
  if (!player) return false;

  const prayers = player.prayers as string[] | undefined;
  const activePrayers = player.activePrayers as string[] | undefined;
  const prayerList = prayers ?? activePrayers ?? [];
  return prayerList.includes(prayerId);
};

// ---------------------------------------------------------------------------
// Logic conditions
// ---------------------------------------------------------------------------

const notGate: ConditionEvalFn = (data, _ctx) => {
  return !(data.value as boolean);
};

const randomChance: ConditionEvalFn = (data, _ctx) => {
  const chance = (data.chance as number) ?? 50;
  return Math.random() * 100 < chance;
};

// ---------------------------------------------------------------------------
// String / type conditions
// ---------------------------------------------------------------------------

const compareString: ConditionEvalFn = (data, ctx) => {
  const left =
    (data.left as string) ??
    (data.variable
      ? ((ctx.variables.get(data.variable as string) as string) ?? "")
      : "");
  const right = (data.right as string) ?? (data.value as string) ?? "";
  const mode = (data.mode as string) ?? "equals";

  switch (mode) {
    case "equals":
      return left === right;
    case "contains":
      return left.includes(right);
    case "startsWith":
      return left.startsWith(right);
    case "endsWith":
      return left.endsWith(right);
    default:
      return left === right;
  }
};

const entityType: ConditionEvalFn = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  const expectedType = data.type as string;
  if (!entityId || !expectedType) return false;

  const entity = ctx.world.getEntityById(entityId);
  if (!entity) return false;

  const type = (entity.type as string) ?? (entity.entityType as string) ?? "";
  return type === expectedType;
};

// ---------------------------------------------------------------------------
// Entity / world conditions
// ---------------------------------------------------------------------------

const entityExists: ConditionEvalFn = (data, ctx) => {
  const entityId = (data.entityId as string) ?? ctx.triggerData.entityId;
  if (!entityId) return false;
  return ctx.world.getEntityById(entityId) !== null;
};

const isPlayerInRange: ConditionEvalFn = (data, ctx) => {
  const entityId = ctx.entityId;
  if (!entityId) return false;

  const entity = ctx.world.getEntityById(entityId);
  if (!entity) return false;

  const pos = entity.position as
    | { x: number; y: number; z: number }
    | undefined;
  if (!pos) return false;

  const tx = (data.x as number) ?? 0;
  const ty = (data.y as number) ?? 0;
  const tz = (data.z as number) ?? 0;
  const range = (data.range as number) ?? 10;

  const dx = pos.x - tx;
  const dy = pos.y - ty;
  const dz = pos.z - tz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) <= range;
};

const hasQuestCompleted: ConditionEvalFn = (data, ctx) => {
  const questId = data.questId as string;
  if (!questId) return false;
  return ctx.variables.get(`quest_${questId}_state`) === "completed";
};

const timeOfDay: ConditionEvalFn = (data, _ctx) => {
  const minHour = (data.minHour as number) ?? 0;
  const maxHour = (data.maxHour as number) ?? 23;
  const hour = new Date().getHours();
  return hour >= minHour && hour <= maxHour;
};

const entityCount: ConditionEvalFn = (data, ctx) => {
  const variableName = data.variableName as string;
  const operator = (data.operator as string) ?? "==";
  const value = (data.value as number) ?? 0;
  if (!variableName) return false;

  const count = (ctx.variables.get(variableName) as number) ?? 0;

  switch (operator) {
    case "==":
      return count === value;
    case "!=":
      return count !== value;
    case "<":
      return count < value;
    case ">":
      return count > value;
    case "<=":
      return count <= value;
    case ">=":
      return count >= value;
    default:
      return false;
  }
};

const isMobAlive: ConditionEvalFn = (data, ctx) => {
  const entityId = (data.entityId as string) ?? (ctx.triggerData.mob as string);
  if (!entityId) return false;
  return ctx.world.getEntityById(entityId) !== null;
};

const hasActiveBuff: ConditionEvalFn = (data, ctx) => {
  const buffId = data.buffId as string;
  if (!buffId) return false;
  const value = ctx.variables.get(`buff_${buffId}_active`);
  return !!value;
};

const variableExists: ConditionEvalFn = (data, ctx) => {
  const variableName = data.variableName as string;
  if (!variableName) return false;
  return ctx.variables.has(variableName);
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ConditionRegistry {
  private evaluators: Map<string, ConditionEvalFn> = new Map();

  constructor() {
    this.register("condition/hasItem", hasItem);
    this.register("condition/questState", questState);
    this.register("condition/skillLevel", skillLevel);
    this.register("condition/compareNumber", compareNumber);
    this.register("condition/and", andGate);
    this.register("condition/or", orGate);

    // Combat conditions
    this.register("condition/isInCombat", isInCombat);
    this.register("condition/isAlive", isAlive);
    this.register("condition/healthCheck", healthCheck);

    // Equipment / inventory conditions
    this.register("condition/hasEquipped", hasEquipped);
    this.register("condition/hasCoins", hasCoins);

    // Zone / position conditions
    this.register("condition/isInZone", isInZone);

    // Prayer conditions
    this.register("condition/isPrayerActive", isPrayerActive);

    // Logic conditions
    this.register("condition/not", notGate);
    this.register("condition/random", randomChance);

    // String / type conditions
    this.register("condition/compareString", compareString);
    this.register("condition/entityType", entityType);

    // Entity / world conditions
    this.register("condition/entityExists", entityExists);
    this.register("condition/isPlayerInRange", isPlayerInRange);
    this.register("condition/hasQuestCompleted", hasQuestCompleted);
    this.register("condition/timeOfDay", timeOfDay);
    this.register("condition/entityCount", entityCount);
    this.register("condition/isMobAlive", isMobAlive);
    this.register("condition/hasActiveBuff", hasActiveBuff);
    this.register("condition/variableExists", variableExists);
  }

  register(nodeType: string, evaluator: ConditionEvalFn): void {
    this.evaluators.set(nodeType, evaluator);
  }

  getEvaluator(nodeType: string): ConditionEvalFn | undefined {
    return this.evaluators.get(nodeType);
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.evaluators.keys());
  }
}
