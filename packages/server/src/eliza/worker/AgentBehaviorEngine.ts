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
  // Operator grace: dashboard command is active — don't override it with
  // autonomous action. Survival tasks above (eat, equip, shop) already ran.
  if (input.operatorGrace) {
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
      ? [
          "lumberjacks_first_lesson",
          "fresh_catch",
          "rune_mysteries",
          "torvins_tools",
          "crafting_basics",
          "fletchers_introduction",
        ]
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
    description: "Train combat (nearby hostile creatures)",
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

    // Buy crafting materials when needed for interact stages
    if (
      stageType === "interact" &&
      (stageTarget === "leather_gloves" || stageTarget === "leather_boots")
    ) {
      const hasLeather = inventory.some((i) => i.itemId === "leather");
      if (!hasLeather) {
        sideEffects.push({
          type: "storeBuy",
          storeId: "crafting_store",
          itemId: "leather",
          quantity: 5,
        });
        return;
      }
      // Also ensure we have needle and thread
      if (!hasItemInInventoryOrEquipped("needle")) {
        sideEffects.push({
          type: "storeBuy",
          storeId: "crafting_store",
          itemId: "needle",
          quantity: 1,
        });
        return;
      }
      if (!inventory.some((i) => i.itemId === "thread")) {
        sideEffects.push({
          type: "storeBuy",
          storeId: "crafting_store",
          itemId: "thread",
          quantity: 5,
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
  if (inventory.length < 15) return;
  if (Date.now() < state.dropCooldownUntil) return;

  let foodCount = 0;
  const dropCandidates: Array<{
    itemId: string;
    slot: number;
    priority: number;
  }> = [];

  // Track which items we've already kept (for dedup)
  const keptItems = new Set<string>();
  const equippedItems = new Set(
    Object.values(input.equippedItems).filter(Boolean) as string[],
  );

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
      "small_fishing_net",
      "rune_essence",
    ];

    // Keep only 1 copy of quest tools
    if (questTools.includes(slot.itemId)) {
      if (keptItems.has(slot.itemId)) {
        dropCandidates.push({
          itemId: slot.itemId,
          slot: slot.slot,
          priority: 3,
        });
      } else {
        keptItems.add(slot.itemId);
      }
      continue;
    }

    // Keep only 1 weapon, 1 armor per slot — drop duplicates
    if (isWeapon || isArmor) {
      const category = itemData?.equipSlot || "weapon";
      const categoryKey = `equip:${category}`;
      if (keptItems.has(categoryKey)) {
        // This is a duplicate — drop candidate (low priority so we keep best)
        dropCandidates.push({
          itemId: slot.itemId,
          slot: slot.slot,
          priority: 3,
        });
      } else {
        keptItems.add(categoryKey);
      }
      continue;
    }

    if (isTool) {
      if (keptItems.has(slot.itemId)) {
        dropCandidates.push({
          itemId: slot.itemId,
          slot: slot.slot,
          priority: 3,
        });
      } else {
        keptItems.add(slot.itemId);
      }
      continue;
    }

    // Raw food — keep for cooking quests
    if (COOKABLE_ITEMS[slot.itemId]) continue;

    // Quest crafting/processing materials — keep for quests
    const questMaterials = [
      "cowhide",
      "leather",
      "thread",
      "needle",
      "knife",
      "bowstring",
      "feather",
      "feathers",
      "arrow_shaft",
      "headless_arrow",
      "shortbow_u",
      "logs",
      "copper_ore",
      "tin_ore",
      "bronze_bar",
      "hammer",
    ];
    if (questMaterials.includes(slot.itemId)) continue;

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

  // Drop more aggressively when inventory is very full
  const dropCount =
    inventory.length >= 25
      ? Math.min(5, dropCandidates.length)
      : inventory.length >= 22
        ? Math.min(3, dropCandidates.length)
        : 1;
  for (let i = 0; i < dropCount; i++) {
    const toDrop = dropCandidates[i];
    sideEffects.push({ type: "drop", itemId: toDrop.itemId, quantity: 1 });
  }

  // Shorter cooldown when inventory is critically full
  state.dropCooldownUntil =
    Date.now() + (inventory.length >= 25 ? 8000 : 25000);
}

// ─── CRAFTING & BANKING ─────────────────────────────────────────────────

/** Raw items that can be cooked and their cooked counterparts */
const COOKABLE_ITEMS: Record<string, string> = {
  raw_shrimp: "shrimp",
  raw_sardine: "sardine",
  raw_herring: "herring",
  raw_trout: "trout",
  raw_salmon: "salmon",
  raw_tuna: "tuna",
  raw_lobster: "lobster",
  raw_swordfish: "swordfish",
  raw_shark: "shark",
  raw_chicken: "cooked_chicken",
  raw_beef: "cooked_meat",
};

/** Ores that can be smelted and their bar recipe IDs */
const SMELTABLE_ORES: Record<string, string> = {
  copper_ore: "bronze_bar",
  tin_ore: "bronze_bar",
  iron_ore: "iron_bar",
  coal: "steel_bar",
  gold_ore: "gold_bar",
  mithril_ore: "mithril_bar",
};

function isNearbyObject(
  entities: NearbyEntityData[],
  keyword: string,
  maxDist = 10,
): boolean {
  return entities.some(
    (e) =>
      e.type === "object" &&
      e.distance <= maxDist &&
      `${e.id} ${e.name}`.toLowerCase().includes(keyword),
  );
}

/**
 * If the agent's inventory is filling up and they're near a relevant station,
 * cook raw food, smelt ore, or deposit at a bank.
 */
function pickCraftOrBankAction(
  input: AgentTickInput,
  nearbyEntities: NearbyEntityData[],
): EmbeddedBehaviorAction | null {
  const inventory = input.inventoryItems;
  if (inventory.length < 15) return null; // plenty of space, skip

  // --- Cook raw food if near a cooking range/fire ---
  const nearRange =
    isNearbyObject(nearbyEntities, "range") ||
    isNearbyObject(nearbyEntities, "fire") ||
    isNearbyObject(nearbyEntities, "cooking");
  if (nearRange) {
    const rawFood = inventory.find((i) => COOKABLE_ITEMS[i.itemId]);
    if (rawFood) {
      return { type: "cook", itemId: rawFood.itemId };
    }
  }

  // --- Smelt ore if near a furnace ---
  const nearFurnace = isNearbyObject(nearbyEntities, "furnace");
  if (nearFurnace) {
    const ore = inventory.find((i) => SMELTABLE_ORES[i.itemId]);
    if (ore) {
      return { type: "smelt", recipe: SMELTABLE_ORES[ore.itemId] };
    }
  }

  // --- Runecraft if near an altar and have rune essence ---
  const nearAltar = isNearbyObject(nearbyEntities, "altar");
  if (nearAltar) {
    const hasEssence = inventory.some((i) => i.itemId === "rune_essence");
    if (hasEssence) {
      return { type: "runecraft", runeType: "air_rune" };
    }
  }

  // --- Bank deposit if near a bank and inventory is nearly full ---
  if (inventory.length >= 24) {
    const nearBank = isNearbyObject(nearbyEntities, "bank");
    if (nearBank) {
      return { type: "bankDepositAll" };
    }
  }

  return null;
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

  // === CRAFTING & BANKING (when inventory is filling up) ===
  const craftAction = pickCraftOrBankAction(input, gameState.nearbyEntities);
  if (craftAction) return craftAction;

  const goal = state.goal;

  // === QUEST-DRIVEN BEHAVIOR (with stall detection) ===
  if (goal?.type === "questing" && goal.questId) {
    const stalled = isQuestStalled(input, goal);
    if (!stalled) {
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
    // Quest is stalled or pickQuestAction returned null — clear the questing goal
    // so the planner can set a new one (combat, gathering, etc.)
    state.goal = null;
  }

  // === DEFAULT: autonomous activity planner ===
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
      // Runecrafting quest stages (e.g. craft_air_runes)
      if (stageTarget.includes("rune")) {
        const inventory = input.inventoryItems;
        const hasEssence = inventory.some((i) => i.itemId === "rune_essence");

        if (hasEssence) {
          // stageTarget is "air_rune" → runeType is "air"
          const runeType = stageTarget.replace(/_rune$/, "");
          // Check if near the CORRECT runecrafting altar (e.g. "air_altar")
          const nearAltar = input.gameState.nearbyEntities.find(
            (e) =>
              e.type === "object" &&
              e.distance <= 8 &&
              (e.id || "").toLowerCase().includes(`${runeType}_altar`),
          );
          if (nearAltar) {
            return { type: "runecraft", runeType };
          }
          // Walk to the specific altar — find station whose name/id contains the rune type
          let altarPos: [number, number, number] | null = null;
          let bestDist = Infinity;
          for (const station of input.stationPositions) {
            if (!station.stationType.includes("runecrafting")) continue;
            if (!station.name.includes(runeType)) continue;
            const dx = position[0] - station.position[0];
            const dz = position[2] - station.position[2];
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < bestDist) {
              bestDist = dist;
              altarPos = station.position;
            }
          }
          if (altarPos) {
            return {
              type: "move",
              target: [altarPos[0], position[1], altarPos[2]],
              runMode: true,
            };
          }
          // Fallback: any runecrafting altar
          const anyAltarPos = findNearestStation(
            input,
            position,
            "runecrafting",
          );
          if (anyAltarPos) {
            return {
              type: "move",
              target: [anyAltarPos[0], position[1], anyAltarPos[2]],
              runMode: true,
            };
          }
        } else {
          // Need to gather rune essence first
          const essenceRock = findResourceForQuest(
            nearbyResources,
            "rune_essence",
          );
          if (essenceRock) {
            const rdx = position[0] - essenceRock.position[0];
            const rdz = position[2] - essenceRock.position[2];
            const dist2d = Math.sqrt(rdx * rdx + rdz * rdz);
            if (dist2d < 4) {
              return { type: "gather", targetId: essenceRock.id };
            }
            return {
              type: "move",
              target: [
                essenceRock.position[0],
                position[1],
                essenceRock.position[2],
              ],
              runMode: false,
            };
          }
          return moveTowardResourceArea(input, position, "rune_essence");
        }
      }

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

      // Cooking quest stages (e.g. cook_shrimp → target "shrimp")
      // Find the raw item that cooks into the stage target
      const rawItemId = Object.entries(COOKABLE_ITEMS).find(
        ([, cooked]) => cooked === stageTarget,
      )?.[0];
      if (rawItemId) {
        const inventory = input.inventoryItems;
        const hasRawItem = inventory.some((i) => i.itemId === rawItemId);

        if (hasRawItem) {
          // Always try cook first — the ticker handles firemake fallback.
          // executeCook checks ProcessingSystem for player-lit fires that
          // don't appear in nearbyEntities.
          return { type: "cook", itemId: rawItemId };
        } else {
          // Need to gather the raw item (e.g. fish for raw_shrimp)
          const fishingSpot = findResourceForQuest(
            nearbyResources,
            rawItemId.replace("raw_", ""),
          );
          if (fishingSpot) {
            const rdx = position[0] - fishingSpot.position[0];
            const rdz = position[2] - fishingSpot.position[2];
            const dist2d = Math.sqrt(rdx * rdx + rdz * rdz);
            if (dist2d < 4) {
              return { type: "gather", targetId: fishingSpot.id };
            }
            return {
              type: "move",
              target: [
                fishingSpot.position[0],
                position[1],
                fishingSpot.position[2],
              ],
              runMode: false,
            };
          }
          // Try fishing spots specifically
          const fishSpot = input.gameState.nearbyEntities.find(
            (e) =>
              e.type === "resource" &&
              (e.name || e.resourceType || "")
                .toLowerCase()
                .includes("fishing"),
          );
          if (fishSpot) {
            if (fishSpot.distance < 4) {
              return { type: "gather", targetId: fishSpot.id };
            }
            return {
              type: "move",
              target: [fishSpot.position[0], position[1], fishSpot.position[2]],
              runMode: false,
            };
          }
          return moveTowardResourceArea(input, position, "fishing");
        }
      }
    }

    // Smelting quest stages (e.g. bronze_bar)
    if (
      SMELTABLE_ORES[stageTarget] ||
      Object.values(SMELTABLE_ORES).includes(stageTarget)
    ) {
      const barId = Object.values(SMELTABLE_ORES).includes(stageTarget)
        ? stageTarget
        : SMELTABLE_ORES[stageTarget];
      const inventory = input.inventoryItems;
      // For bronze_bar, need both copper_ore and tin_ore
      const oresForBar = Object.entries(SMELTABLE_ORES)
        .filter(([, bar]) => bar === barId)
        .map(([ore]) => ore);
      const hasAllOres = oresForBar.every((ore) =>
        inventory.some((i) => i.itemId === ore),
      );

      if (hasAllOres) {
        const nearFurnace = isNearbyObject(
          input.gameState.nearbyEntities,
          "furnace",
        );
        if (nearFurnace) {
          return { type: "smelt", recipe: barId };
        }
        const furnacePos = findNearestStation(input, position, "furnace");
        if (furnacePos) {
          return {
            type: "move",
            target: [furnacePos[0], position[1], furnacePos[2]],
            runMode: true,
          };
        }
      } else {
        // Need to mine missing ores
        for (const ore of oresForBar) {
          if (!inventory.some((i) => i.itemId === ore)) {
            const resource = findResourceForQuest(nearbyResources, ore);
            if (resource) {
              const rdx = position[0] - resource.position[0];
              const rdz = position[2] - resource.position[2];
              if (Math.sqrt(rdx * rdx + rdz * rdz) < 4) {
                return { type: "gather", targetId: resource.id };
              }
              return {
                type: "move",
                target: [
                  resource.position[0],
                  position[1],
                  resource.position[2],
                ],
                runMode: false,
              };
            }
            return moveTowardResourceArea(input, position, ore);
          }
        }
      }
    }

    // Smithing quest stages (e.g. bronze_shortsword, bronze_hatchet, bronze_pickaxe)
    if (stageTarget.startsWith("bronze_") && stageTarget !== "bronze_bar") {
      const inventory = input.inventoryItems;
      const hasBars = inventory.some((i) => i.itemId === "bronze_bar");

      if (hasBars) {
        const nearAnvil = isNearbyObject(
          input.gameState.nearbyEntities,
          "anvil",
        );
        if (nearAnvil) {
          return { type: "smith", recipe: stageTarget };
        }
        const anvilPos = findNearestStation(input, position, "anvil");
        if (anvilPos) {
          return {
            type: "move",
            target: [anvilPos[0], position[1], anvilPos[2]],
            runMode: true,
          };
        }
      } else {
        // Need bronze bars — smelt them first
        const hasCopper = inventory.some((i) => i.itemId === "copper_ore");
        const hasTin = inventory.some((i) => i.itemId === "tin_ore");
        if (hasCopper && hasTin) {
          const nearFurnace = isNearbyObject(
            input.gameState.nearbyEntities,
            "furnace",
          );
          if (nearFurnace) {
            return { type: "smelt", recipe: "bronze_bar" };
          }
          const furnacePos = findNearestStation(input, position, "furnace");
          if (furnacePos) {
            return {
              type: "move",
              target: [furnacePos[0], position[1], furnacePos[2]],
              runMode: true,
            };
          }
        }
        // Mine missing ores
        for (const ore of ["copper_ore", "tin_ore"]) {
          if (!inventory.some((i) => i.itemId === ore)) {
            const resource = findResourceForQuest(nearbyResources, ore);
            if (resource) {
              const rdx = position[0] - resource.position[0];
              const rdz = position[2] - resource.position[2];
              if (Math.sqrt(rdx * rdx + rdz * rdz) < 4) {
                return { type: "gather", targetId: resource.id };
              }
              return {
                type: "move",
                target: [
                  resource.position[0],
                  position[1],
                  resource.position[2],
                ],
                runMode: false,
              };
            }
            return moveTowardResourceArea(input, position, ore);
          }
        }
      }
    }

    // Crafting quest stages (e.g. leather_gloves, leather_boots)
    const CRAFTABLE_ITEMS: Record<
      string,
      { recipeId: string; material: string; fallback?: string }
    > = {
      leather_gloves: { recipeId: "leather_gloves", material: "leather" },
      leather_boots: {
        recipeId: "leather_boots",
        material: "leather",
        fallback: "leather_gloves",
      },
    };
    if (CRAFTABLE_ITEMS[stageTarget]) {
      const { recipeId, material, fallback } = CRAFTABLE_ITEMS[stageTarget];
      const inventory = input.inventoryItems;
      const hasMaterial = inventory.some((i) => i.itemId === material);
      const hasCowhide = inventory.some((i) => i.itemId === "cowhide");
      if (hasMaterial) {
        // If the target recipe requires a higher level (e.g. leather_boots
        // needs level 7), try the target first. If it keeps failing (no
        // progress after 2 attempts), craft the lower-level fallback item
        // for XP. Periodically retry the target (every 3rd tick) so that
        // once the level is sufficient, boots will start succeeding.
        const stageProgress = activeQuest.stageProgress[stageTarget] || 0;
        if (fallback && stageProgress === 0) {
          const fbKey = `${input.characterId}:${stageTarget}:craftAttempts`;
          const attempts = (craftAttemptCounter.get(fbKey) || 0) + 1;
          craftAttemptCounter.set(fbKey, attempts);
          // First 2 attempts: try the real recipe. After that, alternate:
          // every 3rd attempt try the real recipe, otherwise fallback.
          if (attempts > 2 && attempts % 3 !== 0) {
            return { type: "craft", recipeId: fallback, quantity: 1 };
          }
        }
        return { type: "craft", recipeId, quantity: 1 };
      }
      // Material acquisition: manageShopping will auto-buy leather from crafting_store.
      // If we have cowhide from loot, tan it for free leather.
      if (material === "leather") {
        const hasCowhide = inventory.some((i) => i.itemId === "cowhide");
        if (hasCowhide) {
          return { type: "tan", inputItemId: "cowhide", quantity: 1 };
        }
        // manageShopping will buy leather on next tick — idle to wait for it
        return { type: "idle" };
      }
    }

    // Fletching quest stages (arrow_shaft, headless_arrow, shortbow)
    const FLETCHABLE_ITEMS: Record<
      string,
      { recipeId: string; materials: string[] }
    > = {
      arrow_shaft: { recipeId: "arrow_shaft:logs", materials: ["logs"] },
      headless_arrow: {
        recipeId: "headless_arrow:arrow_shaft",
        materials: ["arrow_shaft", "feathers"],
      },
      shortbow_u: { recipeId: "shortbow_u:logs", materials: ["logs"] },
      shortbow: {
        recipeId: "shortbow:bowstring",
        materials: ["bowstring", "shortbow_u"],
      },
    };
    if (FLETCHABLE_ITEMS[stageTarget]) {
      const { recipeId, materials } = FLETCHABLE_ITEMS[stageTarget];
      const inventory = input.inventoryItems;
      const hasAllMaterials = materials.every((m) =>
        inventory.some((i) => i.itemId === m),
      );
      if (hasAllMaterials) {
        return { type: "fletch", recipeId, quantity: 1 };
      }
      // If we need logs for any fletching recipe (arrow_shaft, shortbow_u), chop a tree
      if (
        materials.includes("logs") &&
        !inventory.some((i) => i.itemId === "logs")
      ) {
        const tree = findResourceForQuest(nearbyResources, "logs");
        if (tree) {
          const rdx = position[0] - tree.position[0];
          const rdz = position[2] - tree.position[2];
          if (Math.sqrt(rdx * rdx + rdz * rdz) < 4) {
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
      // If we need arrow_shaft but don't have them, chop logs first
      if (
        stageTarget === "headless_arrow" &&
        !inventory.some((i) => i.itemId === "arrow_shaft")
      ) {
        const hasLogs = inventory.some((i) => i.itemId === "logs");
        if (hasLogs) {
          return { type: "fletch", recipeId: "arrow_shaft:logs", quantity: 1 };
        }
        // Need logs — chop a tree
        const tree = findResourceForQuest(nearbyResources, "logs");
        if (tree) {
          const rdx = position[0] - tree.position[0];
          const rdz = position[2] - tree.position[2];
          if (Math.sqrt(rdx * rdx + rdz * rdz) < 4) {
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
      // If we need shortbow but don't have shortbow_u, fletch it first
      if (
        stageTarget === "shortbow" &&
        !inventory.some((i) => i.itemId === "shortbow_u")
      ) {
        const hasLogs = inventory.some((i) => i.itemId === "logs");
        if (hasLogs) {
          return { type: "fletch", recipeId: "shortbow_u:logs", quantity: 1 };
        }
        const tree = findResourceForQuest(nearbyResources, "logs");
        if (tree) {
          const rdx = position[0] - tree.position[0];
          const rdz = position[2] - tree.position[2];
          if (Math.sqrt(rdx * rdx + rdz * rdz) < 4) {
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

    // Fallback: the interact stage wasn't handled by any specific handler.
    // Rather than returning null (which clears the quest goal), try to
    // navigate toward the quest's start NPC for dialogue.
    return moveToNpcOrComplete(input, position, activeQuest);
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

  // For ore targets like "tin_ore", prefer rocks whose name matches specifically
  // e.g. "Tin Rock" for tin_ore, "Copper Rock" for copper_ore
  const orePrefix = stageTarget.replace(/_ore$/, "");
  if (stageTarget.endsWith("_ore")) {
    const specificMatch = matches.find((r) => {
      const name = (r.name || "").toLowerCase();
      return name.includes(orePrefix);
    });
    if (specificMatch) return specificMatch;
  }

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

  // For ore targets, prefer specific ore rocks (e.g. "Tin Rock" for tin_ore)
  const orePrefix = stageTarget.endsWith("_ore")
    ? stageTarget.replace(/_ore$/, "")
    : null;

  for (const resource of input.worldResources) {
    if (resource.depleted) continue;
    const haystack =
      `${resource.name.toLowerCase()} ${resource.resourceType.toLowerCase()}`.trim();
    if (!keywords.some((kw) => haystack.includes(kw))) continue;

    // Skip non-matching ore rocks when looking for a specific ore type
    if (orePrefix && haystack.includes("rock") && !haystack.includes(orePrefix))
      continue;

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

/** Tracks craft attempts per agent+target to decide when to fallback to lower-level recipe */
const craftAttemptCounter = new Map<string, number>();

// ─── QUEST STALL DETECTION ───────────────────────────────────────────────
//
// If the agent hasn't made progress on a quest stage for QUEST_STALL_TICKS,
// temporarily shelve the quest and let the autonomous planner run instead.
// After QUEST_STALL_COOLDOWN_MS, the quest becomes eligible again.

/** Tracks per-agent quest progress for stall detection */
const questStallTracker = new Map<
  string,
  {
    questId: string;
    /** Snapshot of quest progress to detect changes */
    stageKey: string;
    /** Number of ticks with no progress */
    stallTicks: number;
    /** When the quest was shelved (0 = not shelved) */
    shelvedUntil: number;
  }
>();

/** Ticks with no quest progress before shelving (~96s at 8s ticks).
 *  Set high because multi-step quests (fish → cook) need many ticks for
 *  intermediate steps that don't change quest progress directly. */
const QUEST_STALL_TICKS = 12;
/** How long to shelve a stalled quest before retrying (1 min) */
const QUEST_STALL_COOLDOWN_MS = 60_000;

/**
 * Build a key representing current quest progress state.
 * If this key doesn't change between ticks, the quest is stalling.
 * Includes inventory counts for quest-related items so intermediate
 * steps (fishing for raw_shrimp to cook later) count as progress.
 */
function buildQuestStageKey(input: AgentTickInput, questId: string): string {
  const quest = input.questState.find((q) => q.questId === questId);
  if (!quest) return `not_active:${questId}`;
  const progressStr = JSON.stringify(quest.stageProgress);

  // Include inventory counts for relevant items to detect intermediate progress.
  // e.g. for cook_shrimp quest, picking up raw_shrimp counts as progress.
  let inventoryKey = "";
  if (quest.stageType === "interact" && quest.stageTarget) {
    const target = quest.stageTarget;
    const rawItemId = Object.entries(COOKABLE_ITEMS).find(
      ([, cooked]) => cooked === target,
    )?.[0];
    if (rawItemId) {
      const rawCount = input.inventoryItems
        .filter((i) => i.itemId === rawItemId)
        .reduce((sum, i) => sum + i.quantity, 0);
      inventoryKey = `:inv_${rawItemId}=${rawCount}`;
    }
    // Also track rune essence for runecrafting quests
    if (target.includes("rune")) {
      const essenceCount = input.inventoryItems
        .filter((i) => i.itemId === "rune_essence")
        .reduce((sum, i) => sum + i.quantity, 0);
      inventoryKey = `:inv_rune_essence=${essenceCount}`;
    }
  }

  // Include rounded position so movement (walking to mine, to altar, etc.) counts as progress
  const pos = input.gameState.position;
  const posKey = pos
    ? `:pos=${Math.round(pos[0] / 5)},${Math.round(pos[2] / 5)}`
    : "";

  return `${quest.status}:${quest.stageType}:${quest.stageTarget}:${progressStr}${inventoryKey}${posKey}`;
}

/**
 * Returns true if the quest is stalled and should be temporarily shelved.
 */
function isQuestStalled(input: AgentTickInput, goal: AgentGoal): boolean {
  const agentId = input.characterId;
  const questId = goal.questId!;

  let tracker = questStallTracker.get(agentId);

  // Quest changed — reset tracker
  if (!tracker || tracker.questId !== questId) {
    tracker = { questId, stageKey: "", stallTicks: 0, shelvedUntil: 0 };
    questStallTracker.set(agentId, tracker);
  }

  // If currently shelved, check if cooldown expired
  if (tracker.shelvedUntil > 0) {
    if (Date.now() < tracker.shelvedUntil) {
      return true; // Still shelved
    }
    // Cooldown expired — retry the quest
    tracker.shelvedUntil = 0;
    tracker.stallTicks = 0;
  }

  const currentKey = buildQuestStageKey(input, questId);

  if (currentKey === tracker.stageKey) {
    // No progress since last tick
    tracker.stallTicks++;
  } else {
    // Progress! Reset stall counter
    tracker.stageKey = currentKey;
    tracker.stallTicks = 0;
  }

  if (tracker.stallTicks >= QUEST_STALL_TICKS) {
    // Shelve this quest temporarily
    tracker.shelvedUntil = Date.now() + QUEST_STALL_COOLDOWN_MS;
    tracker.stallTicks = 0;
    return true;
  }

  return false;
}

// ─── AUTONOMOUS ACTIVITY PLANNER ─────────────────────────────────────────
//
// When no quest is active, rotate between meaningful activities:
// combat → gather → process (cook/smelt) → bank → explore → repeat
//
// The planner checks inventory contents, nearby entities, and known station
// locations to decide the most productive next step.

/** Per-agent activity rotation state (keyed by characterId) */
const activityRotation = new Map<
  string,
  {
    lastActivity: string;
    lastActivityAt: number;
    /** How many consecutive ticks doing the same goal type */
    sameGoalTicks: number;
  }
>();

/** Maximum ticks before forcing a goal rotation (~40s at 8s ticks) */
const MAX_SAME_GOAL_TICKS = 5;

function findNearestStation(
  input: AgentTickInput,
  position: [number, number, number],
  stationType: string,
): [number, number, number] | null {
  let bestPos: [number, number, number] | null = null;
  let bestDist = Infinity;
  for (const station of input.stationPositions) {
    if (!station.stationType.includes(stationType)) continue;
    const dx = position[0] - station.position[0];
    const dz = position[2] - station.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) {
      bestDist = dist;
      bestPos = station.position;
    }
  }
  return bestPos;
}

function countInventoryItems(
  inventory: Array<{ itemId: string; quantity: number }>,
  predicate: (itemId: string) => boolean,
): number {
  return inventory
    .filter((i) => predicate(i.itemId))
    .reduce((sum, i) => sum + i.quantity, 0);
}

function pickCombatOrExplore(
  input: AgentTickInput,
  state: AgentState,
  position: [number, number, number],
  nearbyMobs: NearbyEntityData[],
  nearbyResources: NearbyEntityData[],
  healthPercent: number,
): EmbeddedBehaviorAction {
  const inventory = input.inventoryItems;
  const invCount = inventory.length;

  // Track rotation state
  let rotation = activityRotation.get(input.characterId);
  if (!rotation) {
    rotation = { lastActivity: "", lastActivityAt: 0, sameGoalTicks: 0 };
    activityRotation.set(input.characterId, rotation);
  }

  const currentGoalType = state.goal?.type || "idle";
  if (currentGoalType === rotation.lastActivity) {
    rotation.sameGoalTicks++;
  } else {
    rotation.lastActivity = currentGoalType;
    rotation.sameGoalTicks = 0;
    rotation.lastActivityAt = Date.now();
  }

  const stale = rotation.sameGoalTicks >= MAX_SAME_GOAL_TICKS;

  // --- CHECK INVENTORY CONTENTS ---
  const rawFoodCount = countInventoryItems(inventory, (id) =>
    id.startsWith("raw_"),
  );
  const oreCount = countInventoryItems(
    inventory,
    (id) =>
      id.endsWith("_ore") ||
      id === "coal" ||
      id === "tin_ore" ||
      id === "copper_ore",
  );
  const barCount = countInventoryItems(inventory, (id) => id.endsWith("_bar"));
  const inventoryFull = invCount >= 25;

  // === PRIORITY 1: BANK when inventory is nearly full and near a bank ===
  if (inventoryFull) {
    const bankPos = findNearestStation(input, position, "bank");
    if (bankPos) {
      const dx = position[0] - bankPos[0];
      const dz = position[2] - bankPos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 12) {
        state.goal = {
          type: "banking",
          description: "Depositing items at bank",
        };
        return { type: "bankDepositAll" };
      }
      state.goal = {
        type: "banking",
        description: "Walking to bank to deposit",
      };
      return {
        type: "move",
        target: [bankPos[0], position[1], bankPos[2]],
        runMode: true,
      };
    }
  }

  // === PRIORITY 2: COOK raw food if we have 5+ and a range exists ===
  if (rawFoodCount >= 5 && !stale) {
    const rangePos = findNearestStation(input, position, "range");
    if (rangePos) {
      const dx = position[0] - rangePos[0];
      const dz = position[2] - rangePos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 12) {
        const rawItem = inventory.find((i) => i.itemId.startsWith("raw_"));
        if (rawItem) {
          state.goal = {
            type: "cooking",
            description: `Cooking ${rawItem.itemId}`,
          };
          return { type: "cook", itemId: rawItem.itemId };
        }
      }
      state.goal = { type: "cooking", description: "Walking to cooking range" };
      return {
        type: "move",
        target: [rangePos[0], position[1], rangePos[2]],
        runMode: true,
      };
    }
  }

  // === PRIORITY 3: SMELT ore if we have 5+ and a furnace exists ===
  if (oreCount >= 5 && !stale) {
    const furnacePos = findNearestStation(input, position, "furnace");
    if (furnacePos) {
      const dx = position[0] - furnacePos[0];
      const dz = position[2] - furnacePos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 12) {
        const ore = inventory.find(
          (i) =>
            i.itemId.endsWith("_ore") ||
            i.itemId === "coal" ||
            i.itemId === "tin_ore" ||
            i.itemId === "copper_ore",
        );
        if (ore) {
          const recipe = SMELTABLE_ORES[ore.itemId] || "bronze_bar";
          state.goal = { type: "smelting", description: `Smelting ${recipe}` };
          return { type: "smelt", recipe };
        }
      }
      state.goal = { type: "smelting", description: "Walking to furnace" };
      return {
        type: "move",
        target: [furnacePos[0], position[1], furnacePos[2]],
        runMode: true,
      };
    }
  }

  // === PRIORITY 4: SMITH bars if we have 5+ and an anvil exists ===
  if (barCount >= 5 && !stale) {
    const anvilPos = findNearestStation(input, position, "anvil");
    if (anvilPos) {
      const dx = position[0] - anvilPos[0];
      const dz = position[2] - anvilPos[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 12) {
        state.goal = {
          type: "smithing",
          description: "Smithing bars into items",
        };
        return { type: "smith", recipe: "bronze_dagger" };
      }
      state.goal = { type: "smithing", description: "Walking to anvil" };
      return {
        type: "move",
        target: [anvilPos[0], position[1], anvilPos[2]],
        runMode: true,
      };
    }
  }

  // === PRIORITY 5: COMBAT (default if mobs nearby and healthy) ===
  if (
    nearbyMobs.length > 0 &&
    healthPercent > 0.5 &&
    (!stale || currentGoalType !== "combat")
  ) {
    const target = findMobForQuest(input, nearbyMobs, "");
    if (target) {
      state.goal = {
        type: "combat",
        description: `Fighting ${target.name || "mobs"}`,
      };
      state.currentTargetId = target.id;
      return { type: "attack", targetId: target.id };
    }
    state.goal = { type: "combat", description: "Fighting nearby mobs" };
    return { type: "attack", targetId: nearbyMobs[0].id };
  }

  // === PRIORITY 6: GATHER nearby resources ===
  if (
    nearbyResources.length > 0 &&
    !inventoryFull &&
    (!stale || currentGoalType !== "gathering")
  ) {
    const resource = nearbyResources[0];
    state.goal = {
      type: "gathering",
      description: `Gathering ${resource.name || "resources"}`,
    };
    return { type: "gather", targetId: resource.id };
  }

  // === PRIORITY 7: EXPLORE — move toward different activity areas ===
  // If stale or nothing nearby, pick a random activity area to explore
  const explorationTargets = [
    ...input.worldResources
      .filter((r) => !r.depleted)
      .map((r) => ({
        pos: r.position,
        name: r.name,
        type: "gathering" as const,
      })),
    ...input.spawnAnchors.map((a) => ({
      pos: a.position,
      name: a.name,
      type: "combat" as const,
    })),
  ];

  if (explorationTargets.length > 0) {
    // Pick a target that's not too close (>30m) to encourage exploration
    const farTargets = explorationTargets.filter((t) => {
      const dx = position[0] - t.pos[0];
      const dz = position[2] - t.pos[2];
      return Math.sqrt(dx * dx + dz * dz) > 30;
    });
    const targets = farTargets.length > 0 ? farTargets : explorationTargets;
    const pick = targets[Math.floor(Math.random() * targets.length)];
    state.goal = {
      type: "exploring",
      description: `Exploring toward ${pick.name}`,
    };
    return {
      type: "move",
      target: [pick.pos[0], position[1], pick.pos[2]],
      runMode: true,
    };
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
