/**
 * Script Templates — Premade ScriptGraph instances for common Hyperia patterns.
 *
 * Each template is a factory function returning a fresh ScriptGraph
 * with wired nodes and edges. Used by the "New from Template" picker.
 *
 * All node types referenced here exist in nodeLibrary.ts.
 */

import type { ScriptGraph, ScriptNode, ScriptEdge } from "./types";
import { getNodeType } from "./nodeLibrary";

// ============== TYPES ==============

export interface ScriptTemplate {
  id: string;
  label: string;
  description: string;
  category:
    | "combat"
    | "npc"
    | "quest"
    | "resource"
    | "zone"
    | "economy"
    | "utility";
  icon: string;
  create: () => ScriptGraph;
}

// ============== HELPERS ==============

let _uid = 0;
function uid(prefix = "n"): string {
  return `${prefix}_${++_uid}_${Date.now().toString(36)}`;
}

function resetUid(): void {
  _uid = 0;
}

function n(
  type: string,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
): ScriptNode {
  const typeDef = getNodeType(type);
  return {
    id: uid("node"),
    type,
    position: { x, y },
    data,
    inputs: typeDef?.inputs ?? [],
    outputs: typeDef?.outputs ?? [],
  };
}

function e(
  src: ScriptNode,
  srcPort: string,
  tgt: ScriptNode,
  tgtPort: string,
): ScriptEdge {
  return {
    id: uid("edge"),
    sourceNodeId: src.id,
    sourcePortId: srcPort,
    targetNodeId: tgt.id,
    targetPortId: tgtPort,
  };
}

function graph(
  name: string,
  graphType: ScriptGraph["graphType"],
  nodes: ScriptNode[],
  edges: ScriptEdge[],
): ScriptGraph {
  return { id: uid("graph"), name, graphType, nodes, edges, variables: [] };
}

// ============== TEMPLATE FACTORIES ==============

function createMobSpawnOnEnter(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
  const spawn = n("action/spawnMob", 300, 0, {
    mobType: "goblin",
    count: 3,
    level: 5,
  });
  const notify = n("action/showNotification", 600, 0, {
    message: "Enemies approach!",
    type: "warning",
  });

  return graph(
    "Mob Spawn on Enter",
    "event",
    [trigger, spawn, notify],
    [
      e(trigger, "flow_out", spawn, "flow_in"),
      e(spawn, "flow_out", notify, "flow_in"),
      e(trigger, "player", notify, "player"),
    ],
  );
}

function createBossFightEncounter(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
  const seq = n("flow/sequence", 300, 0);
  const dialogue = n("action/showDialogue", 600, -120, {
    title: "Dark Wizard",
    text: "You dare enter my domain?!",
  });
  const spawn = n("action/spawnMob", 600, 0, {
    mobType: "dark_wizard",
    count: 1,
    level: 40,
  });
  const music = n("action/playMusic", 600, 120, {
    trackId: "combat_1",
    fadeIn: 1,
  });

  return graph(
    "Boss Fight Encounter",
    "event",
    [trigger, seq, dialogue, spawn, music],
    [
      e(trigger, "flow_out", seq, "flow_in"),
      e(seq, "out_0", dialogue, "flow_in"),
      e(trigger, "player", dialogue, "player"),
      e(seq, "out_1", spawn, "flow_in"),
      e(seq, "out_2", music, "flow_in"),
    ],
  );
}

function createKillCounterXP(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onMobKilled", 0, 0, { mobType: "goblin" });
  const inc = n("action/incrementVariable", 300, 0, {
    variableName: "kills",
    amount: 1,
  });
  const xp = n("action/giveXP", 600, 0, { skillId: "attack", amount: 25 });

  return graph(
    "Kill Counter + XP",
    "event",
    [trigger, inc, xp],
    [
      e(trigger, "flow_out", inc, "flow_in"),
      e(inc, "flow_out", xp, "flow_in"),
      e(trigger, "killer", xp, "player"),
    ],
  );
}

function createDangerZone(): ScriptGraph {
  resetUid();
  const enter = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
  const leave = n("trigger/onPlayerLeaveZone", 0, 160, { zoneId: "" });
  const warn = n("action/showNotification", 350, 0, {
    message: "You enter dangerous territory!",
    type: "warning",
  });
  const spawn = n("action/spawnMob", 650, 0, {
    mobType: "bandit",
    count: 2,
    level: 20,
  });
  const safe = n("action/showNotification", 350, 160, {
    message: "You return to safety.",
    type: "info",
  });

  return graph(
    "Danger Zone",
    "event",
    [enter, leave, warn, spawn, safe],
    [
      e(enter, "flow_out", warn, "flow_in"),
      e(enter, "player", warn, "player"),
      e(warn, "flow_out", spawn, "flow_in"),
      e(leave, "flow_out", safe, "flow_in"),
      e(leave, "player", safe, "player"),
    ],
  );
}

function createNPCShopKeeper(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onNPCInteraction", 0, 0, { npcId: "" });
  const dialogue = n("action/showDialogue", 300, -40, {
    title: "Shopkeeper",
    text: "Welcome! Have a look at my wares.",
  });
  const shop = n("action/openShop", 600, -40, { storeId: "general_store" });

  return graph(
    "NPC Shop Keeper",
    "event",
    [trigger, dialogue, shop],
    [
      e(trigger, "flow_out", dialogue, "flow_in"),
      e(trigger, "player", dialogue, "player"),
      e(dialogue, "flow_out", shop, "flow_in"),
      e(trigger, "player", shop, "player"),
    ],
  );
}

function createQuestGiver(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onNPCInteraction", 0, 0, { npcId: "" });
  const check = n("condition/questState", 300, 0, {
    questId: "goblin_slayer",
    state: "not_started",
  });
  const start = n("action/startQuest", 600, -60, { questId: "goblin_slayer" });
  const greetNew = n("action/showDialogue", 900, -60, {
    title: "Quest Giver",
    text: "I have a task for you!",
  });
  const greetOld = n("action/showDialogue", 600, 80, {
    title: "Quest Giver",
    text: "How goes your quest?",
  });

  return graph(
    "Quest Giver NPC",
    "event",
    [trigger, check, start, greetNew, greetOld],
    [
      e(trigger, "flow_out", check, "flow_in"),
      e(trigger, "player", check, "player"),
      e(check, "true", start, "flow_in"),
      e(trigger, "player", start, "player"),
      e(start, "flow_out", greetNew, "flow_in"),
      e(trigger, "player", greetNew, "player"),
      e(check, "false", greetOld, "flow_in"),
      e(trigger, "player", greetOld, "player"),
    ],
  );
}

function createHealerNPC(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onNPCInteraction", 0, 0, { npcId: "" });
  const hp = n("condition/healthCheck", 300, 0, {
    threshold: 100,
    comparison: "below",
  });
  const heal = n("action/healEntity", 600, -60, { percentage: 100 });
  const msg = n("action/showDialogue", 900, -60, {
    title: "Healer",
    text: "You have been restored.",
  });
  const full = n("action/showDialogue", 600, 80, {
    title: "Healer",
    text: "You look healthy!",
  });

  return graph(
    "Healer NPC",
    "event",
    [trigger, hp, heal, msg, full],
    [
      e(trigger, "flow_out", hp, "flow_in"),
      e(trigger, "player", hp, "entity"),
      e(hp, "true", heal, "flow_in"),
      e(trigger, "player", heal, "entity"),
      e(heal, "flow_out", msg, "flow_in"),
      e(trigger, "player", msg, "player"),
      e(hp, "false", full, "flow_in"),
      e(trigger, "player", full, "player"),
    ],
  );
}

function createTreasureChest(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onNPCInteraction", 0, 0, { npcId: "" });
  const check = n("condition/compareNumber", 300, 0, {
    variableA: "chest_opened",
    operator: "==",
    valueB: 0,
  });
  const markOpened = n("action/setVariable", 600, 0, {
    variableName: "chest_opened",
    value: 1,
  });
  const seq = n("flow/sequence", 900, 0);
  const give = n("action/giveItem", 1200, -60, {
    itemId: "coins",
    quantity: 100,
  });
  const fx = n("action/spawnParticle", 1200, 60, {
    effect: "loot_sparkle",
    duration: 1500,
  });
  const msg = n("action/showNotification", 1500, -60, {
    message: "You found 100 coins!",
    type: "success",
  });
  const alreadyMsg = n("action/showNotification", 600, 120, {
    message: "The chest is empty.",
    type: "info",
  });

  return graph(
    "Treasure Chest",
    "event",
    [trigger, check, markOpened, seq, give, fx, msg, alreadyMsg],
    [
      e(trigger, "flow_out", check, "flow_in"),
      e(check, "true", markOpened, "flow_in"),
      e(markOpened, "flow_out", seq, "flow_in"),
      e(seq, "out_0", give, "flow_in"),
      e(trigger, "player", give, "player"),
      e(seq, "out_1", fx, "flow_in"),
      e(give, "flow_out", msg, "flow_in"),
      e(trigger, "player", msg, "player"),
      e(check, "false", alreadyMsg, "flow_in"),
      e(trigger, "player", alreadyMsg, "player"),
    ],
  );
}

function createResourceRespawn(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onResourceDepleted", 0, 0);
  const delay = n("flow/delay", 300, 0, { delayMs: 30000 });
  const notify = n("action/showNotification", 600, 0, {
    message: "The resource begins to regrow...",
    type: "info",
  });

  return graph(
    "Resource Respawn",
    "event",
    [trigger, delay, notify],
    [
      e(trigger, "flow_out", delay, "flow_in"),
      e(delay, "flow_out", notify, "flow_in"),
    ],
  );
}

function createZoneWelcome(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
  const notify = n("action/showNotification", 300, -40, {
    message: "Welcome to Central Haven",
    type: "info",
  });
  const music = n("action/playMusic", 300, 60, {
    trackId: "normal_1",
    fadeIn: 2,
  });

  return graph(
    "Zone Welcome",
    "event",
    [trigger, notify, music],
    [
      e(trigger, "flow_out", notify, "flow_in"),
      e(trigger, "player", notify, "player"),
      e(notify, "flow_out", music, "flow_in"),
    ],
  );
}

function createCraftingStation(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onNPCInteraction", 0, 0, { npcId: "" });
  const skill = n("condition/skillLevel", 300, 0, {
    skillId: "smithing",
    minLevel: 10,
  });
  const ok = n("action/showDialogue", 600, -60, {
    title: "Anvil",
    text: "You begin smithing...",
  });
  const no = n("action/showNotification", 600, 80, {
    message: "You need Smithing level 10.",
    type: "error",
  });

  return graph(
    "Crafting Station",
    "event",
    [trigger, skill, ok, no],
    [
      e(trigger, "flow_out", skill, "flow_in"),
      e(trigger, "player", skill, "player"),
      e(skill, "true", ok, "flow_in"),
      e(trigger, "player", ok, "player"),
      e(skill, "false", no, "flow_in"),
      e(trigger, "player", no, "player"),
    ],
  );
}

function createPatrolGuard(): ScriptGraph {
  resetUid();
  const timer = n("trigger/onTimer", 0, 0, { delay: 10, repeat: true });
  const check = n("flow/branch", 300, 0, { condition: "patrol_direction" });
  const moveA = n("action/moveEntity", 600, -60, {
    x: 10,
    y: 0,
    z: 0,
    speed: 1,
  });
  const toggleA = n("action/setVariable", 900, -60, {
    variableName: "patrol_direction",
    value: false,
  });
  const moveB = n("action/moveEntity", 600, 60, {
    x: -10,
    y: 0,
    z: 0,
    speed: 1,
  });
  const toggleB = n("action/setVariable", 900, 60, {
    variableName: "patrol_direction",
    value: true,
  });

  return graph(
    "Patrol Guard",
    "behavior",
    [timer, check, moveA, toggleA, moveB, toggleB],
    [
      e(timer, "flow_out", check, "flow_in"),
      e(check, "true", moveA, "flow_in"),
      e(moveA, "flow_out", toggleA, "flow_in"),
      e(check, "false", moveB, "flow_in"),
      e(moveB, "flow_out", toggleB, "flow_in"),
    ],
  );
}

// ============== NEW TEMPLATE FACTORIES ==============

function createLevelGatedArea(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
  const check = n("condition/skillLevel", 300, 0, {
    skillId: "combat",
    minLevel: 30,
  });
  const welcome = n("action/showNotification", 600, -80, {
    message: "Welcome, warrior!",
    type: "info",
  });
  const reject = n("action/showDialogue", 600, 80, {
    title: "Gate Guard",
    text: "You need level 30 Combat to enter.",
  });
  const teleport = n("action/teleportPlayer", 900, 80, {
    position: { x: 0, y: 0, z: 0 },
  });

  return graph(
    "Level-Gated Area",
    "event",
    [trigger, check, welcome, reject, teleport],
    [
      e(trigger, "flow_out", check, "flow_in"),
      e(trigger, "player", check, "player"),
      e(check, "true", welcome, "flow_in"),
      e(trigger, "player", welcome, "player"),
      e(check, "false", reject, "flow_in"),
      e(trigger, "player", reject, "player"),
      e(reject, "flow_out", teleport, "flow_in"),
      e(trigger, "player", teleport, "player"),
    ],
  );
}

function createRespawnOnDeath(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onEntityDeath", 0, 0);
  const delay = n("flow/delay", 300, 0, { duration: 30 });
  const spawn = n("action/spawnMob", 600, 0, { mobType: "", count: 1 });
  const particle = n("action/spawnParticle", 600, 120, {
    effect: "respawn_glow",
    duration: 2,
  });

  return graph(
    "Respawn on Death",
    "event",
    [trigger, delay, spawn, particle],
    [
      e(trigger, "flow_out", delay, "flow_in"),
      e(delay, "flow_out", spawn, "flow_in"),
      e(delay, "flow_out", particle, "flow_in"),
    ],
  );
}

function createQuestItemCollector(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onItemPickup", 0, 0, { itemId: "" });
  const hasAll = n("condition/hasItem", 300, 0, {
    itemId: "quest_item",
    quantity: 5,
  });
  const progress = n("action/progressQuest", 600, -80, { questId: "" });
  const notify = n("action/showNotification", 600, 80, {
    message: "Keep collecting!",
    type: "info",
  });
  const complete = n("action/completeQuest", 900, -80, { questId: "" });

  return graph(
    "Quest Item Collector",
    "event",
    [trigger, hasAll, progress, notify, complete],
    [
      e(trigger, "flow_out", hasAll, "flow_in"),
      e(hasAll, "true", progress, "flow_in"),
      e(progress, "flow_out", complete, "flow_in"),
      e(hasAll, "false", notify, "flow_in"),
    ],
  );
}

function createTeleportHub(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onInteract", 0, 0);
  const dialogue = n("action/showDialogue", 300, 0, {
    title: "Teleport Stone",
    text: "Teleporting you to town...",
  });
  const sound = n("action/playSound", 600, -80, { soundId: "teleport_whoosh" });
  const teleport = n("action/teleportPlayer", 600, 80, {
    position: { x: 100, y: 0, z: 50 },
  });

  return graph(
    "Teleport Hub",
    "event",
    [trigger, dialogue, sound, teleport],
    [
      e(trigger, "flow_out", dialogue, "flow_in"),
      e(dialogue, "flow_out", sound, "flow_in"),
      e(dialogue, "flow_out", teleport, "flow_in"),
      e(trigger, "player", teleport, "player"),
    ],
  );
}

function createAmbushTrap(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
  const gate = n("flow/doN", 300, 0, { count: 1 });
  const seq = n("flow/sequence", 600, 0);
  const music = n("action/playMusic", 900, -120, {
    trackId: "ambush_theme",
    fadeIn: 0.5,
  });
  const notify = n("action/showNotification", 900, -40, {
    message: "Ambush!",
    type: "warning",
  });
  const spawn1 = n("action/spawnMob", 900, 40, {
    mobType: "bandit",
    count: 3,
    level: 15,
  });
  const spawn2 = n("action/spawnMob", 900, 120, {
    mobType: "bandit_chief",
    count: 1,
    level: 25,
  });

  return graph(
    "Ambush Trap",
    "event",
    [trigger, gate, seq, music, notify, spawn1, spawn2],
    [
      e(trigger, "flow_out", gate, "flow_in"),
      e(gate, "flow_out", seq, "flow_in"),
      e(seq, "out_0", music, "flow_in"),
      e(seq, "out_1", notify, "flow_in"),
      e(trigger, "player", notify, "player"),
      e(seq, "out_2", spawn1, "flow_in"),
      e(seq, "out_3", spawn2, "flow_in"),
    ],
  );
}

function createTimedChallenge(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onInteract", 0, 0);
  const gate = n("flow/gate", 300, 0, { startOpen: true });
  const setVar = n("variable/set", 600, 0, {
    variableName: "timer_active",
    value: true,
  });
  const notify = n("action/showNotification", 900, -80, {
    message: "You have 60 seconds! Go!",
    type: "warning",
  });
  const delay = n("flow/delay", 900, 80, { duration: 60 });
  const timeout = n("action/showNotification", 1200, 80, {
    message: "Time's up!",
    type: "error",
  });

  return graph(
    "Timed Challenge",
    "event",
    [trigger, gate, setVar, notify, delay, timeout],
    [
      e(trigger, "flow_out", gate, "flow_in"),
      e(gate, "flow_out", setVar, "flow_in"),
      e(setVar, "flow_out", notify, "flow_in"),
      e(setVar, "flow_out", delay, "flow_in"),
      e(delay, "flow_out", timeout, "flow_in"),
      e(trigger, "player", notify, "player"),
      e(trigger, "player", timeout, "player"),
    ],
  );
}

function createDialogueBranching(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onInteract", 0, 0);
  const greet = n("action/showDialogue", 300, 0, {
    title: "Elder",
    text: "Greetings, adventurer. Do you seek wisdom or gold?",
  });
  const branch = n("flow/branch", 600, 0, { condition: "chose_wisdom" });
  const wisdom = n("action/giveXP", 900, -80, {
    skillId: "magic",
    amount: 100,
  });
  const gold = n("action/giveCoins", 900, 80, { amount: 500 });

  return graph(
    "Branching Dialogue",
    "event",
    [trigger, greet, branch, wisdom, gold],
    [
      e(trigger, "flow_out", greet, "flow_in"),
      e(trigger, "player", greet, "player"),
      e(greet, "flow_out", branch, "flow_in"),
      e(branch, "true", wisdom, "flow_in"),
      e(trigger, "player", wisdom, "player"),
      e(branch, "false", gold, "flow_in"),
      e(trigger, "player", gold, "player"),
    ],
  );
}

function createAggroZone(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
  const spawn = n("action/spawnMob", 300, 0, {
    mobType: "wolf",
    count: 2,
    level: 10,
  });
  const combat = n("action/startCombat", 300, 120);

  return graph(
    "Aggro Zone",
    "event",
    [trigger, spawn, combat],
    [
      e(trigger, "flow_out", spawn, "flow_in"),
      e(trigger, "flow_out", combat, "flow_in"),
      e(trigger, "player", combat, "target"),
    ],
  );
}

function createDamageBuffZone(): ScriptGraph {
  resetUid();
  const enter = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
  const notify = n("action/showNotification", 300, 0, {
    message: "2x damage zone!",
    type: "warning",
  });
  const buff = n("action/applyBuff", 600, 0, {
    buffId: "double_damage",
    duration: 0,
  });
  const leave = n("trigger/onPlayerLeaveZone", 0, 200, { zoneId: "" });
  const removeBuff = n("action/removeBuff", 300, 200, {
    buffId: "double_damage",
  });

  return graph(
    "Damage Buff Zone",
    "event",
    [enter, notify, buff, leave, removeBuff],
    [
      e(enter, "flow_out", notify, "flow_in"),
      e(notify, "flow_out", buff, "flow_in"),
      e(enter, "player", buff, "player"),
      e(leave, "flow_out", removeBuff, "flow_in"),
      e(leave, "player", removeBuff, "player"),
    ],
  );
}

function createBankNPC(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onNPCInteraction", 0, 0, { npcId: "" });
  const dialogue = n("action/showDialogue", 300, 0, {
    title: "Banker",
    text: "Welcome to the bank!",
  });
  const bank = n("action/openBank", 600, 0);

  return graph(
    "Bank NPC",
    "event",
    [trigger, dialogue, bank],
    [
      e(trigger, "flow_out", dialogue, "flow_in"),
      e(trigger, "player", dialogue, "player"),
      e(dialogue, "flow_out", bank, "flow_in"),
      e(trigger, "player", bank, "player"),
    ],
  );
}

function createWaveSpawner(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
  const incVar = n("variable/increment", 300, 0, {
    variableName: "wave",
    amount: 1,
  });
  const spawn = n("action/spawnMob", 600, 0, { mobType: "skeleton", count: 5 });
  const notify = n("action/showNotification", 600, 120, {
    message: "Wave incoming!",
    type: "warning",
  });
  const delay = n("flow/delay", 900, 0, { duration: 30 });
  const nextWave = n("action/spawnMob", 1200, 0, {
    mobType: "skeleton_warrior",
    count: 3,
    level: 20,
  });

  return graph(
    "Wave Spawner",
    "event",
    [trigger, incVar, spawn, notify, delay, nextWave],
    [
      e(trigger, "flow_out", incVar, "flow_in"),
      e(incVar, "flow_out", spawn, "flow_in"),
      e(incVar, "flow_out", notify, "flow_in"),
      e(trigger, "player", notify, "player"),
      e(spawn, "flow_out", delay, "flow_in"),
      e(delay, "flow_out", nextWave, "flow_in"),
    ],
  );
}

function createXPRewardZone(): ScriptGraph {
  resetUid();
  const trigger = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
  const doOnce = n("flow/doN", 300, 0, { count: 1 });
  const xp = n("action/giveXP", 600, -60, {
    skillId: "exploration",
    amount: 200,
  });
  const notify = n("action/showNotification", 600, 60, {
    message: "+200 Exploration XP!",
    type: "success",
  });

  return graph(
    "XP Reward Zone",
    "event",
    [trigger, doOnce, xp, notify],
    [
      e(trigger, "flow_out", doOnce, "flow_in"),
      e(doOnce, "flow_out", xp, "flow_in"),
      e(trigger, "player", xp, "player"),
      e(doOnce, "flow_out", notify, "flow_in"),
      e(trigger, "player", notify, "player"),
    ],
  );
}

function createBossPhaseTransition(): ScriptGraph {
  resetUid();
  // Phase 7.8 — Boss phase transition: on damage, if HP crosses 50%
  // threshold, enrage (faster movement + emit phase event + warn players).
  // Once-only: a local variable gate prevents re-triggering each tick.
  const trigger = n("trigger/onEntityDamaged", 0, 0);
  const alreadyRaged = n("condition/variableExists", 280, 0, {
    variableName: "phase2_triggered",
  });
  const hp = n("condition/healthCheck", 560, 0, {
    threshold: 50,
    comparison: "below",
  });
  const mark = n("variable/set", 840, -120, {
    name: "phase2_triggered",
    value: true,
  });
  const emit = n("action/emitCustomEvent", 840, 0, {
    eventName: "boss:phase2",
  });
  const speed = n("action/setMovementSpeed", 840, 120, { speed: 1.6 });
  const warn = n("action/showNotification", 1120, 60, {
    message: "The boss enrages!",
    type: "warning",
  });

  return graph(
    "Boss Phase Transition",
    "event",
    [trigger, alreadyRaged, hp, mark, emit, speed, warn],
    [
      e(trigger, "flow_out", alreadyRaged, "flow_in"),
      // Only proceed if phase2 hasn't triggered yet.
      e(alreadyRaged, "false", hp, "flow_in"),
      // HP below 50% → enrage.
      e(hp, "true", mark, "flow_in"),
      e(hp, "true", emit, "flow_in"),
      e(hp, "true", speed, "flow_in"),
      e(emit, "flow_out", warn, "flow_in"),
      // Wire the damaged entity through so setMovementSpeed/healthCheck
      // resolve against the boss itself (the owning entity).
      e(trigger, "entity", hp, "entity"),
      e(trigger, "entity", speed, "entity"),
    ],
  );
}

// ============== TEMPLATE REGISTRY ==============

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: "mob_spawn",
    label: "Mob Spawn on Enter",
    description: "Spawns mobs when a player enters a zone",
    category: "combat",
    icon: "Bug",
    create: createMobSpawnOnEnter,
  },
  {
    id: "boss_fight",
    label: "Boss Fight Encounter",
    description: "Dialogue + boss spawn + battle music on zone entry",
    category: "combat",
    icon: "Skull",
    create: createBossFightEncounter,
  },
  {
    id: "kill_counter",
    label: "Kill Counter + XP",
    description: "Tracks mob kills and awards XP per kill",
    category: "combat",
    icon: "Crosshair",
    create: createKillCounterXP,
  },
  {
    id: "danger_zone",
    label: "Danger Zone",
    description: "Warns players and spawns mobs in dangerous areas",
    category: "zone",
    icon: "AlertTriangle",
    create: createDangerZone,
  },
  {
    id: "npc_shop",
    label: "NPC Shop Keeper",
    description: "Greeting dialogue then opens a store",
    category: "npc",
    icon: "ShoppingCart",
    create: createNPCShopKeeper,
  },
  {
    id: "quest_giver",
    label: "Quest Giver NPC",
    description: "Offers quest if not started, checks progress",
    category: "quest",
    icon: "ScrollText",
    create: createQuestGiver,
  },
  {
    id: "healer_npc",
    label: "Healer NPC",
    description: "Heals player to full HP if damaged",
    category: "npc",
    icon: "HeartPulse",
    create: createHealerNPC,
  },
  {
    id: "treasure_chest",
    label: "Treasure Chest",
    description: "One-time reward with sparkle effect",
    category: "resource",
    icon: "Gift",
    create: createTreasureChest,
  },
  {
    id: "resource_respawn",
    label: "Resource Respawn",
    description: "Plays respawn effect after resource is depleted",
    category: "resource",
    icon: "TreeDeciduous",
    create: createResourceRespawn,
  },
  {
    id: "zone_welcome",
    label: "Zone Welcome",
    description: "Notification + music when entering a zone",
    category: "zone",
    icon: "MapPin",
    create: createZoneWelcome,
  },
  {
    id: "crafting_station",
    label: "Crafting Station",
    description: "Skill-gated crafting interaction with level check",
    category: "economy",
    icon: "Hammer",
    create: createCraftingStation,
  },
  {
    id: "patrol_guard",
    label: "Patrol Guard",
    description: "NPC paces back and forth on a timer",
    category: "npc",
    icon: "Shield",
    create: createPatrolGuard,
  },
  {
    id: "level_gate",
    label: "Level-Gated Area",
    description: "Blocks entry unless player meets skill level",
    category: "zone",
    icon: "Lock",
    create: createLevelGatedArea,
  },
  {
    id: "respawn_death",
    label: "Respawn on Death",
    description: "Auto-respawns mob after 30s death delay",
    category: "combat",
    icon: "RotateCcw",
    create: createRespawnOnDeath,
  },
  {
    id: "quest_items",
    label: "Quest Item Collector",
    description: "Tracks item pickups and completes quest",
    category: "quest",
    icon: "Package",
    create: createQuestItemCollector,
  },
  {
    id: "teleport_hub",
    label: "Teleport Hub",
    description: "Interaction-triggered teleport with effects",
    category: "utility",
    icon: "Zap",
    create: createTeleportHub,
  },
  {
    id: "ambush_trap",
    label: "Ambush Trap",
    description: "One-time ambush with multiple mob waves",
    category: "combat",
    icon: "Swords",
    create: createAmbushTrap,
  },
  {
    id: "timed_challenge",
    label: "Timed Challenge",
    description: "60-second countdown challenge with timeout",
    category: "utility",
    icon: "Timer",
    create: createTimedChallenge,
  },
  {
    id: "dialogue_branch",
    label: "Branching Dialogue",
    description: "NPC dialogue with player choice branch",
    category: "npc",
    icon: "MessageSquare",
    create: createDialogueBranching,
  },
  {
    id: "aggro_zone",
    label: "Aggro Zone",
    description: "Zone-triggered mob spawn with auto-combat",
    category: "combat",
    icon: "Target",
    create: createAggroZone,
  },
  {
    id: "damage_zone",
    label: "Damage Buff Zone",
    description: "Applies buff on enter, removes on leave",
    category: "zone",
    icon: "FlameKindling",
    create: createDamageBuffZone,
  },
  {
    id: "bank_npc",
    label: "Bank NPC",
    description: "Banker dialogue then opens bank interface",
    category: "economy",
    icon: "Landmark",
    create: createBankNPC,
  },
  {
    id: "wave_spawner",
    label: "Wave Spawner",
    description: "Multi-wave mob spawner with delays",
    category: "combat",
    icon: "Waves",
    create: createWaveSpawner,
  },
  {
    id: "xp_reward",
    label: "XP Reward Zone",
    description: "One-time XP award on zone entry",
    category: "zone",
    icon: "Star",
    create: createXPRewardZone,
  },
  {
    id: "boss_phase",
    label: "Boss Phase Transition",
    description:
      "On damage, enrages boss once HP crosses 50% (faster movement + phase event + warning)",
    category: "combat",
    icon: "Flame",
    create: createBossPhaseTransition,
  },
];

/** Get templates filtered by category. */
export function getTemplatesByCategory(category: string): ScriptTemplate[] {
  return SCRIPT_TEMPLATES.filter((t) => t.category === category);
}

/** Get all unique template categories. */
export function getTemplateCategories(): string[] {
  return Array.from(new Set(SCRIPT_TEMPLATES.map((t) => t.category)));
}
