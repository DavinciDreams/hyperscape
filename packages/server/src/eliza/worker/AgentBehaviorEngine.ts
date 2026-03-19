/**
 * AgentBehaviorEngine — Pure decision logic for agent AI.
 *
 * Runs inside a worker thread. Takes serializable snapshots as input,
 * returns serializable decisions as output. NO World access, NO side effects.
 *
 * Extracted from AgentBehaviorTicker — same logic, but pure functions.
 */

import type {
  WorkerItemData,
  AgentTickInput,
  AgentTickOutput,
  AgentSideEffect,
} from "./workerTypes.js";
import type {
  AgentGoal,
  PendingChatReaction,
  CombatChatReactionType,
  EmbeddedBehaviorAction,
} from "../managers/AgentBehaviorTicker.js";
import type { NearbyEntityData, AgentQuestProgress } from "../types.js";

/** Local item database — populated from main thread at init */
const ITEMS = new Map<string, WorkerItemData>();

function getItem(itemId: string): WorkerItemData | null {
  return ITEMS.get(itemId) || null;
}

/** Combat chat reaction thresholds */
const COMBAT_CHAT_COOLDOWN = 15000;

/**
 * Initialize the worker-side item database.
 */
export function initializeItems(
  itemsData: Array<[string, WorkerItemData]>,
): void {
  ITEMS.clear();
  for (const [id, item] of itemsData) {
    ITEMS.set(id, item);
  }
}

/**
 * Process a batch of agent ticks and return decisions.
 */
export function processAgentTicks(agents: AgentTickInput[]): AgentTickOutput[] {
  const results: AgentTickOutput[] = [];
  for (const input of agents) {
    results.push(processOneAgent(input));
  }
  return results;
}

// ─── PER-AGENT PROCESSING ─────────────────────────────────────────────────

function processOneAgent(input: AgentTickInput): AgentTickOutput {
  const sideEffects: AgentSideEffect[] = [];
  const state = { ...input.agentState };
  let chatMessage: string | undefined;

  // === COMBAT CHAT REACTIONS ===
  if (state.pendingChatReaction) {
    const reaction = state.pendingChatReaction;
    state.pendingChatReaction = null;
    chatMessage = getCombatChatResponse(reaction);
    state.lastCombatChatAt = Date.now();
  }

  // === QUEST MANAGEMENT ===
  manageQuests(input, state);

  // === INVENTORY MANAGEMENT ===
  manageInventory(input, state, sideEffects);

  // === SHOPPING ===
  manageShopping(input, state, sideEffects);

  // === EQUIPMENT MANAGEMENT ===
  manageEquipment(input, sideEffects);

  // === SURVIVAL: EAT FOOD ===
  if (assessAndEat(input, state, sideEffects)) {
    return {
      characterId: input.characterId,
      action: { type: "idle" },
      sideEffects,
      updatedState: {
        goal: state.goal,
        questsAccepted: state.questsAccepted,
        currentTargetId: state.currentTargetId,
        lastAteAt: state.lastAteAt,
        dropCooldownUntil: state.dropCooldownUntil,
        lastGatherTargetId: state.lastGatherTargetId,
        lastGatherQueuedAt: state.lastGatherQueuedAt,
        lastCombatChatAt: state.lastCombatChatAt,
      },
      chatMessage,
    };
  }

  // === PICK ACTION ===
  const action = pickBehaviorAction(input, state);

  return {
    characterId: input.characterId,
    action,
    sideEffects,
    updatedState: {
      goal: state.goal,
      questsAccepted: state.questsAccepted,
      currentTargetId: state.currentTargetId,
      lastAteAt: state.lastAteAt,
      dropCooldownUntil: state.dropCooldownUntil,
      lastGatherTargetId: state.lastGatherTargetId,
      lastGatherQueuedAt: state.lastGatherQueuedAt,
      lastCombatChatAt: state.lastCombatChatAt,
    },
    chatMessage,
  };
}

// ─── MUTABLE AGENT STATE (worker-local) ──────────────────────────────────

interface AgentState {
  goal: AgentGoal | null;
  questsAccepted: string[];
  currentTargetId: string | null;
  lastAteAt: number;
  dropCooldownUntil: number;
  lastGatherTargetId: string | null;
  lastGatherQueuedAt: number;
  pendingChatReaction: PendingChatReaction | null;
  lastCombatChatAt: number;
}

// ─── QUEST MANAGEMENT ────────────────────────────────────────────────────

function manageQuests(input: AgentTickInput, state: AgentState): void {
  const activeQuests = input.questState;
  const availableQuests = input.availableQuests;
  const resourceSystemAvailable = input.resourceSystemAvailable;

  if (activeQuests.length > 0) {
    const quest =
      activeQuests.find(
        (q) =>
          q.status === "ready_to_complete" ||
          q.stageType === "kill" ||
          q.stageType === "dialogue" ||
          (q.stageType === "gather" && resourceSystemAvailable),
      ) || activeQuests[0];

    if (
      quest.stageType === "gather" &&
      !resourceSystemAvailable &&
      quest.status !== "ready_to_complete"
    ) {
      state.goal = {
        type: "combat",
        description: "Train combat (gather resources unavailable)",
      };
      return;
    }

    state.goal = {
      type: "questing",
      description:
        quest.status === "ready_to_complete"
          ? `Turn in: ${quest.name}`
          : `${quest.stageDescription || quest.name}`,
      questId: quest.questId,
      questName: quest.name,
      questStageType: quest.stageType,
      questStageTarget: quest.stageTarget,
      questStageCount: quest.stageCount,
      questStartNpc: quest.startNpc,
    };
    return;
  }

  const questPriority = [
    "goblin_slayer",
    ...(resourceSystemAvailable
      ? ["lumberjacks_first_lesson", "fresh_catch", "torvins_tools"]
      : []),
  ];

  for (const questId of questPriority) {
    const quest = availableQuests.find(
      (q) => q.questId === questId && q.status === "not_started",
    );
    if (quest && !state.questsAccepted.includes(questId)) {
      state.goal = {
        type: "questing",
        description: `Accept quest: ${quest.name}`,
        questId: quest.questId,
        questName: quest.name,
        questStartNpc: quest.startNpc,
      };
      return;
    }
  }

  state.goal = {
    type: "combat",
    description: "Train combat on goblins",
  };
}

// ─── SHOPPING ────────────────────────────────────────────────────────────

function manageShopping(
  input: AgentTickInput,
  state: AgentState,
  sideEffects: AgentSideEffect[],
): void {
  const inventory = input.inventoryItems;
  const equipped = input.equippedItems;
  const goal = state.goal;

  // Read coins from game state entity data
  const gameState = input.gameState;
  if (!gameState) return;

  // Coins are part of the game state we can't read directly in worker.
  // We'll check inventory for coin pouch or skip if not available.
  // Actually, coins are passed separately — let's check inventory for a weapon need.
  // NOTE: coins are read from entity data on the main thread. For simplicity,
  // the bridge will include coins in the input. For now, skip shopping if
  // we can't determine coins. Shopping side effects are low priority.

  const hasItemInInventoryOrEquipped = (itemId: string): boolean => {
    const item = getItem(itemId);
    const equipSlot = item?.equipSlot;
    if (equipSlot) {
      const equippedItem = equipped[equipSlot];
      if (equippedItem === itemId) return true;
      if (equipSlot === "2h" && equipped.weapon === itemId) return true;
    } else if (equipped.weapon === itemId) {
      return true;
    }
    return inventory.some((i) => i.itemId === itemId);
  };

  const hasAnyOfType = (keyword: string): boolean => {
    const equippedWeapon = equipped.weapon || "";
    if (equippedWeapon.includes(keyword)) return true;
    return inventory.some((i) => i.itemId.includes(keyword));
  };

  // Priority 1: Buy a weapon if unarmed
  if (
    !equipped.weapon &&
    !inventory.some((i) => {
      const item = getItem(i.itemId);
      return item?.equipSlot === "weapon" || item?.equipSlot === "2h";
    })
  ) {
    sideEffects.push({
      type: "storeBuy",
      storeId: "sword_store",
      itemId: "bronze_shortsword",
      quantity: 1,
    });
    return;
  }

  // Priority 2: Buy tools needed for current quest
  if (goal?.type === "questing") {
    const stageTarget = goal.questStageTarget || "";
    const stageType = goal.questStageType || "";

    if (
      (stageType === "gather" && stageTarget.includes("log")) ||
      goal.questId === "lumberjacks_first_lesson"
    ) {
      if (!hasAnyOfType("hatchet")) {
        sideEffects.push({
          type: "storeBuy",
          storeId: "general_store",
          itemId: "bronze_hatchet",
          quantity: 1,
        });
        return;
      }
    }

    if (
      (stageType === "gather" &&
        (stageTarget.includes("ore") || stageTarget.includes("essence"))) ||
      goal.questId === "torvins_tools"
    ) {
      if (!hasAnyOfType("pickaxe")) {
        sideEffects.push({
          type: "storeBuy",
          storeId: "general_store",
          itemId: "bronze_pickaxe",
          quantity: 1,
        });
        return;
      }
    }

    if (
      (stageType === "gather" && stageTarget.includes("shrimp")) ||
      goal.questId === "fresh_catch"
    ) {
      if (!hasItemInInventoryOrEquipped("small_fishing_net")) {
        sideEffects.push({
          type: "storeBuy",
          storeId: "fishing_store",
          itemId: "small_fishing_net",
          quantity: 1,
        });
        return;
      }
    }

    if (stageType === "interact" && stageTarget.includes("fire")) {
      if (!hasItemInInventoryOrEquipped("tinderbox")) {
        sideEffects.push({
          type: "storeBuy",
          storeId: "general_store",
          itemId: "tinderbox",
          quantity: 1,
        });
        return;
      }
    }
  }
}

// ─── INVENTORY MANAGEMENT ────────────────────────────────────────────────

function manageInventory(
  input: AgentTickInput,
  state: AgentState,
  sideEffects: AgentSideEffect[],
): void {
  const inventory = input.inventoryItems;
  if (inventory.length < 20) return;
  if (Date.now() < state.dropCooldownUntil) return;

  let foodCount = 0;
  const dropCandidates: Array<{
    itemId: string;
    slot: number;
    priority: number;
  }> = [];

  for (const slot of inventory) {
    const itemData = getItem(slot.itemId);
    const healAmount = itemData?.healAmount;
    const isFood = healAmount && healAmount > 0;
    const isWeapon =
      itemData?.equipSlot === "weapon" || itemData?.equipSlot === "2h";
    const isArmor = itemData?.equipSlot && !isWeapon;
    const isTool = itemData?.type === "tool";

    if (isFood) {
      foodCount++;
      if (foodCount > 5) {
        dropCandidates.push({
          itemId: slot.itemId,
          slot: slot.slot,
          priority: 2,
        });
      }
      continue;
    }

    const questTools = [
      "tinderbox",
      "bronze_hatchet",
      "hatchet",
      "bronze_pickaxe",
      "pickaxe",
      "fishing_rod",
      "net",
      "logs",
      "oak_logs",
    ];
    if (isWeapon || isArmor || isTool || questTools.includes(slot.itemId))
      continue;

    // Bones — bury for prayer XP
    if (slot.itemId === "bones" || slot.itemId.endsWith("_bones")) {
      sideEffects.push({ type: "use", itemId: slot.itemId });
      return; // One action per tick
    }

    dropCandidates.push({
      itemId: slot.itemId,
      slot: slot.slot,
      priority: 1,
    });
  }

  if (dropCandidates.length === 0) return;

  dropCandidates.sort((a, b) => a.priority - b.priority);

  const dropCount =
    inventory.length >= 27 ? Math.min(3, dropCandidates.length) : 1;
  for (let i = 0; i < dropCount; i++) {
    const toDrop = dropCandidates[i];
    sideEffects.push({ type: "drop", itemId: toDrop.itemId, quantity: 1 });
  }

  state.dropCooldownUntil = Date.now() + 25000;
}

// ─── EATING ──────────────────────────────────────────────────────────────

function assessAndEat(
  input: AgentTickInput,
  state: AgentState,
  sideEffects: AgentSideEffect[],
): boolean {
  const { health, maxHealth, inCombat } = input.gameState;
  if (maxHealth <= 0) return false;

  const healthPercent = health / maxHealth;
  const EAT_COOLDOWN_MS = inCombat ? 6000 : 12000;
  const criticalInCombat = inCombat && healthPercent <= 0.25;
  if (!criticalInCombat && Date.now() - state.lastAteAt < EAT_COOLDOWN_MS)
    return false;

  const missingHp = maxHealth - health;
  if (missingHp < 2) return false;

  const eatThreshold = inCombat ? 0.5 : 0.7;
  if (healthPercent >= eatThreshold) return false;

  const inventory = input.inventoryItems;
  if (inventory.length === 0) return false;

  let bestFood: { itemId: string; healAmount: number; slot: number } | null =
    null;

  for (const slot of inventory) {
    const itemData = getItem(slot.itemId);
    if (!itemData) continue;

    const healAmount = itemData.healAmount;
    if (!healAmount || healAmount <= 0) continue;

    if (!bestFood) {
      bestFood = { itemId: slot.itemId, healAmount, slot: slot.slot };
      continue;
    }

    const bestOverheal = Math.max(0, bestFood.healAmount - missingHp);
    const thisOverheal = Math.max(0, healAmount - missingHp);

    if (thisOverheal < bestOverheal) {
      bestFood = { itemId: slot.itemId, healAmount, slot: slot.slot };
    } else if (
      thisOverheal === bestOverheal &&
      healAmount > bestFood.healAmount
    ) {
      bestFood = { itemId: slot.itemId, healAmount, slot: slot.slot };
    }
  }

  if (!bestFood) return false;

  sideEffects.push({ type: "use", itemId: bestFood.itemId });
  state.lastAteAt = Date.now();
  return true;
}

// ─── EQUIPMENT MANAGEMENT ────────────────────────────────────────────────

function manageEquipment(
  input: AgentTickInput,
  sideEffects: AgentSideEffect[],
): void {
  const inventory = input.inventoryItems;
  if (inventory.length === 0) return;

  const equipped = input.equippedItems;

  // --- WEAPON ---
  const equippedWeaponId = equipped.weapon || null;
  let bestWeapon: { itemId: string; score: number } | null = null;

  for (const slot of inventory) {
    const itemData = getItem(slot.itemId);
    if (!itemData) continue;
    if (itemData.equipSlot !== "weapon" && itemData.equipSlot !== "2h")
      continue;

    const bonuses = itemData.bonuses;
    const score = (bonuses?.attack || 0) + (bonuses?.strength || 0);

    if (!bestWeapon || score > bestWeapon.score) {
      bestWeapon = { itemId: slot.itemId, score };
    }
  }

  let equippedWeaponScore = 0;
  if (equippedWeaponId) {
    const d = getItem(equippedWeaponId);
    if (d) {
      const b = d.bonuses;
      equippedWeaponScore = (b?.attack || 0) + (b?.strength || 0);
    }
  }

  if (
    bestWeapon &&
    bestWeapon.score > equippedWeaponScore &&
    bestWeapon.itemId !== equippedWeaponId
  ) {
    sideEffects.push({ type: "equip", itemId: bestWeapon.itemId });
    return;
  }

  // --- ARMOR SLOTS ---
  const armorSlots = [
    "helmet",
    "body",
    "legs",
    "shield",
    "boots",
    "gloves",
    "cape",
  ] as const;

  for (const slotName of armorSlots) {
    const equippedId = equipped[slotName] || null;
    let bestArmor: { itemId: string; score: number } | null = null;

    for (const slot of inventory) {
      const itemData = getItem(slot.itemId);
      if (!itemData) continue;
      if (itemData.equipSlot !== slotName) continue;

      const bonuses = itemData.bonuses;
      const score = (bonuses?.defense || 0) + (bonuses?.attack || 0);

      if (!bestArmor || score > bestArmor.score) {
        bestArmor = { itemId: slot.itemId, score };
      }
    }

    if (bestArmor) {
      let currentScore = 0;
      if (equippedId) {
        const d = getItem(equippedId);
        if (d) {
          const b = d.bonuses;
          currentScore = (b?.defense || 0) + (b?.attack || 0);
        }
      }

      if (bestArmor.score > currentScore && bestArmor.itemId !== equippedId) {
        sideEffects.push({ type: "equip", itemId: bestArmor.itemId });
        return;
      }
    }
  }
}

// ─── ACTION SELECTION ────────────────────────────────────────────────────

function pickBehaviorAction(
  input: AgentTickInput,
  state: AgentState,
): EmbeddedBehaviorAction {
  const gameState = input.gameState;
  const healthPercent =
    gameState.maxHealth > 0 ? gameState.health / gameState.maxHealth : 1;
  const position = gameState.position!;

  const nearbyItems = gameState.nearbyEntities
    .filter((entity) => entity.type === "item" && entity.distance <= 15)
    .sort((a, b) => a.distance - b.distance);

  const nearbyMobs = gameState.nearbyEntities
    .filter(
      (entity) =>
        entity.type === "mob" &&
        entity.distance <= 40 &&
        (entity.health === undefined || entity.health > 0),
    )
    .sort((a, b) => a.distance - b.distance);

  const nearbyResources = gameState.nearbyEntities
    .filter((entity) => entity.type === "resource" && entity.distance <= 45)
    .sort((a, b) => a.distance - b.distance);

  if (gameState.inCombat) {
    return { type: "idle" };
  }

  // Gravestone recovery
  const gravestone = findOwnGravestone(input);
  if (gravestone) {
    const dx = position[0] - gravestone.position[0];
    const dz = position[2] - gravestone.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 4) {
      return { type: "move", target: gravestone.position, runMode: true };
    }
    return { type: "lootGravestone", gravestoneId: gravestone.id };
  }

  // Opportunistic loot pickup
  if (nearbyItems.length > 0 && Date.now() > state.dropCooldownUntil) {
    return { type: "pickup", targetId: nearbyItems[0].id };
  }

  const goal = state.goal;

  // === QUEST-DRIVEN BEHAVIOR ===
  if (goal?.type === "questing" && goal.questId) {
    const questAction = pickQuestAction(
      input,
      state,
      position,
      nearbyMobs,
      nearbyResources,
      healthPercent,
    );
    if (questAction) return questAction;
  }

  // === DEFAULT: fight or explore ===
  return pickCombatOrExplore(
    input,
    state,
    position,
    nearbyMobs,
    nearbyResources,
    healthPercent,
  );
}

function pickQuestAction(
  input: AgentTickInput,
  state: AgentState,
  position: [number, number, number],
  nearbyMobs: NearbyEntityData[],
  nearbyResources: NearbyEntityData[],
  healthPercent: number,
): EmbeddedBehaviorAction | null {
  const goal = state.goal!;
  const activeQuest = input.questState.find((q) => q.questId === goal.questId);

  // Quest not yet accepted
  if (!activeQuest && !state.questsAccepted.includes(goal.questId!)) {
    return moveToNpcOrAccept(
      input,
      position,
      goal.questId!,
      goal.questStartNpc,
    );
  }

  // Ready to complete
  if (activeQuest?.status === "ready_to_complete") {
    return moveToNpcOrComplete(input, position, activeQuest);
  }

  // In progress
  if (activeQuest?.status === "in_progress") {
    const stageType = activeQuest.stageType;
    const stageTarget = activeQuest.stageTarget || "";

    if (stageType === "dialogue") {
      return moveToNpcOrComplete(input, position, activeQuest);
    }

    if (stageType === "kill") {
      const targetMob = findMobForQuest(input, nearbyMobs, stageTarget);
      if (targetMob && healthPercent > 0.4) {
        state.currentTargetId = targetMob.id;
        return { type: "attack", targetId: targetMob.id };
      }
      state.currentTargetId = null;
      return moveTowardSpawn(input, position);
    }

    if (stageType === "gather") {
      const resource = findResourceForQuest(nearbyResources, stageTarget);
      if (resource) {
        const rdx = position[0] - resource.position[0];
        const rdz = position[2] - resource.position[2];
        const dist2d = Math.sqrt(rdx * rdx + rdz * rdz);

        if (dist2d < 4) {
          const GATHER_REQUEUE_COOLDOWN = 30000;
          if (
            state.lastGatherTargetId === resource.id &&
            Date.now() - state.lastGatherQueuedAt < GATHER_REQUEUE_COOLDOWN
          ) {
            return { type: "idle" };
          }
          state.lastGatherTargetId = resource.id;
          state.lastGatherQueuedAt = Date.now();
          return { type: "gather", targetId: resource.id };
        }

        return {
          type: "move",
          target: [resource.position[0], position[1], resource.position[2]],
          runMode: false,
        };
      }
      return moveTowardResourceArea(input, position, stageTarget);
    }

    if (stageType === "interact") {
      if (stageTarget === "fire") {
        const inventory = input.inventoryItems;
        const hasTinderbox = inventory.some((i) => i.itemId === "tinderbox");
        const logTypes = [
          "logs",
          "oak_logs",
          "willow_logs",
          "teak_logs",
          "maple_logs",
        ];
        const logsItem = inventory.find((i) => logTypes.includes(i.itemId));

        if (hasTinderbox && logsItem) {
          return { type: "firemake", logsItemId: logsItem.itemId };
        }

        const tree = findResourceForQuest(nearbyResources, "logs");
        if (tree) {
          const rdx = position[0] - tree.position[0];
          const rdz = position[2] - tree.position[2];
          const dist2d = Math.sqrt(rdx * rdx + rdz * rdz);
          if (dist2d < 4) {
            return { type: "gather", targetId: tree.id };
          }
          return {
            type: "move",
            target: [tree.position[0], position[1], tree.position[2]],
            runMode: false,
          };
        }
        return moveTowardResourceArea(input, position, "logs");
      }
    }
  }

  return null;
}

function findMobForQuest(
  input: AgentTickInput,
  nearbyMobs: NearbyEntityData[],
  stageTarget: string,
): NearbyEntityData | undefined {
  if (nearbyMobs.length === 0) return undefined;

  const target = stageTarget.toLowerCase();

  const matchingMobs = nearbyMobs.filter((m) => {
    const name = (m.name || "").toLowerCase();
    const mType = (m.mobType || "").toLowerCase();
    return (
      name.includes(target) ||
      mType.includes(target) ||
      target.includes(name) ||
      target.includes(mType)
    );
  });
  const candidates = matchingMobs.length > 0 ? matchingMobs : nearbyMobs;

  // Collect mob IDs already targeted by other agents
  const takenTargets = new Set<string>();
  for (const other of input.otherAgentTargets) {
    if (other.targetId) {
      takenTargets.add(other.targetId);
    }
  }

  const untargeted = candidates.find((m) => !takenTargets.has(m.id));
  if (untargeted) return untargeted;

  // All mobs taken — pick least contested
  const targetCounts = new Map<string, number>();
  for (const other of input.otherAgentTargets) {
    if (other.targetId) {
      targetCounts.set(
        other.targetId,
        (targetCounts.get(other.targetId) || 0) + 1,
      );
    }
  }
  candidates.sort(
    (a, b) => (targetCounts.get(a.id) || 0) - (targetCounts.get(b.id) || 0),
  );

  return candidates[0];
}

function findResourceForQuest(
  nearbyResources: NearbyEntityData[],
  stageTarget: string,
): NearbyEntityData | undefined {
  const keywords = getResourceKeywords(stageTarget);
  const matches = nearbyResources.filter((r) => {
    const haystack = `${(r.name || "").toLowerCase()} ${(r.resourceType || "").toLowerCase()}`;
    return keywords.some((kw) => haystack.includes(kw));
  });
  if (matches.length === 0) return undefined;

  const basic = matches.find((r) => {
    const name = (r.name || "").toLowerCase();
    return (
      name === "tree" ||
      name === "rock" ||
      name === "fishing spot" ||
      (r.resourceType || "").includes("normal")
    );
  });
  return basic || matches[0];
}

function moveToNpcOrAccept(
  input: AgentTickInput,
  position: [number, number, number],
  questId: string,
  questStartNpc?: string,
): EmbeddedBehaviorAction {
  if (questStartNpc) {
    const npc = input.npcPositions.find(
      (n) =>
        n.npcId === questStartNpc ||
        n.name
          .toLowerCase()
          .includes(questStartNpc.replace(/_/g, " ").toLowerCase()),
    );
    if (npc) {
      const dx = position[0] - npc.position[0];
      const dz = position[2] - npc.position[2];
      if (Math.sqrt(dx * dx + dz * dz) > 6) {
        return { type: "move", target: npc.position, runMode: false };
      }
    }
  }
  return { type: "questAccept", questId };
}

function moveToNpcOrComplete(
  input: AgentTickInput,
  position: [number, number, number],
  activeQuest: AgentQuestProgress,
): EmbeddedBehaviorAction {
  const startNpc = activeQuest.startNpc;
  const npc = input.npcPositions.find(
    (n) =>
      n.npcId === startNpc ||
      n.name.toLowerCase().includes(startNpc.replace(/_/g, " ").toLowerCase()),
  );
  if (npc) {
    const dx = position[0] - npc.position[0];
    const dz = position[2] - npc.position[2];
    if (Math.sqrt(dx * dx + dz * dz) > 6) {
      return { type: "move", target: npc.position, runMode: false };
    }
  }
  return { type: "questComplete", questId: activeQuest.questId };
}

/**
 * Navigate toward a resource area. Uses pre-computed world resources
 * from the main thread instead of iterating all world entities.
 */
function moveTowardResourceArea(
  input: AgentTickInput,
  position: [number, number, number],
  stageTarget: string,
): EmbeddedBehaviorAction {
  const keywords = getResourceKeywords(stageTarget);
  let bestPos: [number, number, number] | null = null;
  let bestDist = Infinity;

  for (const resource of input.worldResources) {
    if (resource.depleted) continue;
    const haystack =
      `${resource.name.toLowerCase()} ${resource.resourceType.toLowerCase()}`.trim();
    if (!keywords.some((kw) => haystack.includes(kw))) continue;

    const dx = position[0] - resource.position[0];
    const dz = position[2] - resource.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) {
      bestDist = dist;
      bestPos = resource.position;
    }
  }

  if (bestPos) {
    return {
      type: "move",
      target: [bestPos[0], position[1], bestPos[2]],
      runMode: false,
    };
  }

  return moveTowardSpawn(input, position);
}

function pickCombatOrExplore(
  input: AgentTickInput,
  state: AgentState,
  position: [number, number, number],
  nearbyMobs: NearbyEntityData[],
  nearbyResources: NearbyEntityData[],
  healthPercent: number,
): EmbeddedBehaviorAction {
  if (nearbyMobs.length > 0 && healthPercent > 0.5) {
    const target = findMobForQuest(input, nearbyMobs, "goblin");
    if (target) {
      state.currentTargetId = target.id;
      return { type: "attack", targetId: target.id };
    }
    return { type: "attack", targetId: nearbyMobs[0].id };
  }
  if (nearbyResources.length > 0) {
    return { type: "gather", targetId: nearbyResources[0].id };
  }
  return moveTowardSpawn(input, position);
}

// ─── WORLD HELPERS ───────────────────────────────────────────────────────

function findOwnGravestone(
  input: AgentTickInput,
): { id: string; position: [number, number, number] } | null {
  const playerId = input.playerId;
  if (!playerId) return null;

  for (const entity of input.gameState.nearbyEntities) {
    if (entity.type !== "object") continue;
    const name = (entity.name || "").toLowerCase();
    const id = entity.id || "";
    if (
      (id.includes("gravestone") && id.includes(playerId)) ||
      (name.includes("gravestone") && name.includes(playerId))
    ) {
      return { id: entity.id, position: entity.position };
    }
  }

  return null;
}

/**
 * Move toward spawn using pre-computed anchor positions from main thread.
 */
function moveTowardSpawn(
  input: AgentTickInput,
  position: [number, number, number],
): EmbeddedBehaviorAction {
  const [px, , pz] = position;
  let anchor: [number, number, number] | null = null;
  let anchorDist = Infinity;

  for (const a of input.spawnAnchors) {
    const dx = a.position[0] - px;
    const dz = a.position[2] - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < anchorDist) {
      anchorDist = dist;
      anchor = a.position;
    }
  }

  if (anchor && anchorDist > 25) {
    const angle =
      Math.atan2(anchor[2] - pz, anchor[0] - px) + (Math.random() - 0.5) * 0.4;
    const step = Math.min(20, Math.max(10, anchorDist * 0.4));
    return {
      type: "move",
      target: [
        px + Math.cos(angle) * step,
        position[1],
        pz + Math.sin(angle) * step,
      ] as [number, number, number],
      runMode: false,
    };
  }

  if (anchor) {
    return {
      type: "move",
      target: getRandomNearbyTarget([anchor[0], position[1], anchor[2]], 8, 18),
      runMode: false,
    };
  }

  return {
    type: "move",
    target: getRandomNearbyTarget(position, 8, 18),
    runMode: false,
  };
}

function getResourceKeywords(stageTarget: string): string[] {
  const target = stageTarget.toLowerCase();
  const keywords = [target];

  if (target.includes("log") || target.includes("wood")) {
    keywords.push("tree", "oak", "willow", "maple", "yew");
  }
  if (
    target.includes("shrimp") ||
    target.includes("fish") ||
    target.includes("trout") ||
    target.includes("salmon")
  ) {
    keywords.push("fishing", "spot", "fishing_spot");
  }
  if (
    target.includes("ore") ||
    target.includes("copper") ||
    target.includes("tin") ||
    target.includes("iron") ||
    target.includes("coal")
  ) {
    keywords.push("rock", "ore", "mining");
  }
  if (target.includes("essence")) {
    keywords.push("essence", "rune", "altar");
  }

  return keywords;
}

function getRandomNearbyTarget(
  origin: [number, number, number],
  minDistance: number,
  maxDistance: number,
): [number, number, number] {
  const angle = Math.random() * Math.PI * 2;
  const distance = minDistance + Math.random() * (maxDistance - minDistance);
  const x = origin[0] + Math.cos(angle) * distance;
  const z = origin[2] + Math.sin(angle) * distance;
  return [x, origin[1], z];
}

// ─── COMBAT CHAT ─────────────────────────────────────────────────────────

function getCombatChatResponse(reaction: PendingChatReaction): string {
  const responses: Record<CombatChatReactionType, string[]> = {
    critical_hit_dealt: [
      "That's gonna leave a mark!",
      "Feel the power!",
      "You're going down!",
      "How'd you like that one?",
      "Boom! Direct hit!",
    ],
    critical_hit_taken: [
      "Ouch! Lucky shot!",
      "Is that all you got?",
      "This isn't over!",
      "You'll pay for that!",
      "Okay, now I'm mad!",
    ],
    near_death: [
      "I'm not done yet!",
      "Come on, one more hit...",
      "Getting dangerous...",
      "This is intense!",
      "Need to focus...",
    ],
    victory_imminent: [
      "Time to finish this!",
      "Any last words?",
      "GG!",
      "Victory is mine!",
      "Almost there!",
    ],
  };

  const options = responses[reaction.type];
  return options[Math.floor(Math.random() * options.length)];
}
