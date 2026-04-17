/**
 * Default Graph Generator — Auto-generates behavior graphs from entity manifest data.
 *
 * When a manifest entity (mob spawner, NPC, station, resource) has no explicit
 * behaviorGraph, this module generates one that visually represents the entity's
 * existing game behavior. This bridges the gap between manifest-driven systems
 * and the visual scripting editor.
 *
 * The generated graph is a starting point — users can modify, extend, or replace it.
 */

import type { ScriptGraph, ScriptNode, ScriptEdge } from "./types";
import { getNodeType } from "./nodeLibrary";

// ---------------------------------------------------------------------------
// Helpers (same pattern as templates.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Entity type → graph generators
// ---------------------------------------------------------------------------

interface MobSpawnData {
  mobId?: string;
  /** Game world entity userData uses `entityId` to store the mob manifest ID */
  entityId?: string;
  name?: string;
  /** Game world entity userData uses `displayName` */
  displayName?: string;
  spawnRadius?: number;
  maxCount?: number;
  /** Game ticks (600ms each) — from PlacedMobSpawn */
  respawnTicks?: number;
  /** Milliseconds — from CompiledEntityMobSpawn */
  respawnTime?: number;
  /** Mob combat level — resolved from NPC manifest stats.level at call site */
  level?: number;
  properties?: Record<string, unknown>;
}

function generateMobSpawnGraph(data: MobSpawnData): ScriptGraph {
  resetUid();
  const mobId = data.mobId ?? data.entityId ?? "";
  const mobName = data.name ?? data.displayName ?? mobId ?? "mob";
  const count = data.maxCount ?? 1;
  // Resolve mob combat level from manifest stats (fallback 1)
  const level = data.level ?? 1;
  // Resolve respawn seconds: respawnTime (ms) takes priority, then respawnTicks (* 0.6s), fallback 30s
  const respawnSec = data.respawnTime
    ? Math.round(data.respawnTime / 1000)
    : data.respawnTicks
      ? Math.round(data.respawnTicks * 0.6)
      : 30;

  // Row 1: On ready (graph attached) → spawn initial batch at spawner position
  const spawnTrigger = n("trigger/onReady", 0, 0);
  const initialSpawn = n("action/spawnMob", 300, 0, {
    mobType: mobId,
    count,
    level,
  });

  // Row 2: On death → delay → respawn single mob near death location
  const deathTrigger = n("trigger/onEntityDeath", 0, 180, {
    mobType: mobId,
  });
  const delay = n("flow/delay", 300, 180, {
    duration: respawnSec,
  });
  const respawn = n("action/spawnMob", 600, 180, {
    mobType: mobId,
    count: 1,
    level,
  });

  return graph(
    `${mobName} Spawner`,
    "behavior",
    [spawnTrigger, initialSpawn, deathTrigger, delay, respawn],
    [
      e(spawnTrigger, "flow_out", initialSpawn, "flow_in"),
      e(spawnTrigger, "position", initialSpawn, "position"),
      e(deathTrigger, "flow_out", delay, "flow_in"),
      e(delay, "flow_out", respawn, "flow_in"),
    ],
  );
}

interface NPCData {
  /** CompiledEntityNPC.id or PlacedNPC.id */
  id?: string;
  /** CompiledEntityNPC.npcTypeId — the NPC manifest ID (e.g. "goblin", "shopkeeper") */
  npcTypeId?: string;
  name?: string;
  /** NPC manifest category: "mob", "neutral", "boss", "quest" */
  category?: string;
  /** Store ID from NPC manifest (e.g. "general_store") */
  storeId?: string;
  /** Context from compiled manifest */
  context?: { type?: string; townId?: string };
  questId?: string;
  dialogueId?: string;
  /** True if the NPC manifest has a `dialogue` tree — DialogueSystem will auto-start it on interaction */
  hasDialogueTree?: boolean;
  /** Legacy fields for backward compat */
  entityId?: string;
  npcType?: string;
}

function generateNPCGraph(data: NPCData): ScriptGraph {
  resetUid();
  const npcName = data.name ?? data.npcTypeId ?? "NPC";
  const entityId = data.id ?? data.entityId ?? "";
  const category = data.category ?? data.npcType ?? "neutral";

  // When the NPC has a dialogue tree in its manifest, DialogueSystem handles
  // the conversation automatically. The behavior graph's job is to REACT to
  // dialogue responses (open shop/bank, start quest, etc.) via
  // `trigger/onDialogueResponse` — fill in the Response ID on the trigger node
  // to match a response in your dialogue tree.
  if (data.hasDialogueTree) {
    // Hostile mobs with dialogue (rare) still need combat behavior.
    if (category === "mob" || category === "boss") {
      const deathTrigger = n("trigger/onEntityDeath", 0, 0);
      const xp = n("action/giveXP", 300, 0, {
        skillId: "attack",
        amount: 25,
      });
      return graph(
        `${npcName} — Combat`,
        "event",
        [deathTrigger, xp],
        [
          e(deathTrigger, "flow_out", xp, "flow_in"),
          e(deathTrigger, "killer", xp, "player"),
        ],
      );
    }

    // Shopkeeper with dialogue tree — react to a dialogue response to open shop.
    if (data.storeId) {
      const trigger = n("trigger/onDialogueResponse", 0, 0, {
        npcId: entityId,
      });
      const shop = n("action/openShop", 300, 0, {
        storeId: data.storeId,
      });
      return graph(
        `${npcName} — Shop Reactions`,
        "event",
        [trigger, shop],
        [
          e(trigger, "flow_out", shop, "flow_in"),
          e(trigger, "player", shop, "player"),
        ],
      );
    }

    // Banker with dialogue tree — react to a dialogue response to open bank.
    if (
      data.npcTypeId === "bank_clerk" ||
      data.npcType === "bank" ||
      data.npcType === "banker"
    ) {
      const trigger = n("trigger/onDialogueResponse", 0, 0, {
        npcId: entityId,
      });
      const bank = n("action/openBank", 300, 0);
      return graph(
        `${npcName} — Bank Reactions`,
        "event",
        [trigger, bank],
        [
          e(trigger, "flow_out", bank, "flow_in"),
          e(trigger, "player", bank, "player"),
        ],
      );
    }

    // Quest giver with dialogue tree — react to accept response to start quest.
    if (category === "quest" || data.npcType === "quest_giver") {
      const trigger = n("trigger/onDialogueResponse", 0, 0, {
        npcId: entityId,
      });
      const start = n("action/startQuest", 300, 0, {
        questId: data.questId ?? "",
      });
      return graph(
        `${npcName} — Quest Reactions`,
        "event",
        [trigger, start],
        [
          e(trigger, "flow_out", start, "flow_in"),
          e(trigger, "player", start, "player"),
        ],
      );
    }

    // Default: minimal stub — DialogueSystem auto-handles the tree; user can
    // wire additional reactions to specific response IDs.
    const trigger = n("trigger/onDialogueResponse", 0, 0, {
      npcId: entityId,
    });
    const log = n("action/log", 300, 0, {
      message: `${npcName} dialogue response received — DialogueSystem handles the tree from the manifest`,
    });
    return graph(
      `${npcName} — Dialogue Reactions`,
      "event",
      [trigger, log],
      [e(trigger, "flow_out", log, "flow_in")],
    );
  }

  // ---- No dialogue tree in manifest — use inline dialogue boxes ----

  // Shopkeeper NPC
  if (data.storeId) {
    const trigger = n("trigger/onNPCInteraction", 0, 0, {
      npcId: entityId,
    });
    const dialogue = n("action/showDialogue", 300, -40, {
      title: npcName,
      text: "Welcome! Browse my wares.",
    });
    const shop = n("action/openShop", 600, -40, {
      storeId: data.storeId,
    });

    return graph(
      `${npcName} — Shop`,
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

  // Banker NPC
  if (
    data.npcTypeId === "bank_clerk" ||
    data.npcType === "bank" ||
    data.npcType === "banker"
  ) {
    const trigger = n("trigger/onNPCInteraction", 0, 0, {
      npcId: entityId,
    });
    const dialogue = n("action/showDialogue", 300, 0, {
      title: npcName,
      text: "Welcome to the bank.",
    });
    const bank = n("action/openBank", 600, 0);

    return graph(
      `${npcName} — Bank`,
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

  // Quest giver NPC
  if (category === "quest" || data.npcType === "quest_giver") {
    const trigger = n("trigger/onNPCInteraction", 0, 0, {
      npcId: entityId,
    });
    const check = n("condition/questState", 300, 0, {
      questId: data.questId ?? "",
      state: "not_started",
    });
    const start = n("action/startQuest", 600, -60, {
      questId: data.questId ?? "",
    });
    const greetNew = n("action/showDialogue", 900, -60, {
      title: npcName,
      text: "I have a task for you, adventurer!",
    });
    const greetOld = n("action/showDialogue", 600, 80, {
      title: npcName,
      text: "How goes your quest?",
    });

    return graph(
      `${npcName} — Quest`,
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

  // Hostile mob NPC
  if (category === "mob" || category === "boss") {
    const enterTrigger = n("trigger/onPlayerEnterZone", 0, 0, { zoneId: "" });
    const combat = n("action/startCombat", 300, 0);
    const deathTrigger = n("trigger/onEntityDeath", 0, 160);
    const xp = n("action/giveXP", 300, 160, {
      skillId: "attack",
      amount: 25,
    });

    return graph(
      `${npcName} — Combat`,
      "event",
      [enterTrigger, combat, deathTrigger, xp],
      [
        e(enterTrigger, "flow_out", combat, "flow_in"),
        e(enterTrigger, "player", combat, "target"),
        e(deathTrigger, "flow_out", xp, "flow_in"),
        e(deathTrigger, "killer", xp, "player"),
      ],
    );
  }

  // Default neutral NPC — simple greeting
  const trigger = n("trigger/onNPCInteraction", 0, 0, {
    npcId: entityId,
  });
  const dialogue = n("action/showDialogue", 300, 0, {
    title: npcName,
    text: "Hello, adventurer!",
  });

  return graph(
    `${npcName} — Greeting`,
    "event",
    [trigger, dialogue],
    [
      e(trigger, "flow_out", dialogue, "flow_in"),
      e(trigger, "player", dialogue, "player"),
    ],
  );
}

interface StationData {
  stationType?: string;
  name?: string;
  bankId?: string;
  runeType?: string;
}

function generateStationGraph(data: StationData): ScriptGraph {
  resetUid();
  const stationName = data.name ?? data.stationType ?? "Station";
  const stationType = data.stationType ?? "";

  // Bank station
  if (stationType === "bank" || data.bankId) {
    const trigger = n("trigger/onInteract", 0, 0);
    const bank = n("action/openBank", 300, 0);

    return graph(
      `${stationName} — Bank`,
      "event",
      [trigger, bank],
      [
        e(trigger, "flow_out", bank, "flow_in"),
        e(trigger, "player", bank, "player"),
      ],
    );
  }

  // Crafting station — determine skill from type
  const skillMap: Record<string, string> = {
    anvil: "smithing",
    furnace: "smithing",
    spinning_wheel: "crafting",
    pottery_wheel: "crafting",
    loom: "crafting",
    range: "cooking",
    fire: "cooking",
    altar: "prayer",
    runecrafting_altar: "runecrafting",
    fletching_table: "fletching",
  };

  const skill = skillMap[stationType] ?? "crafting";

  const trigger = n("trigger/onInteract", 0, 0);
  const skillCheck = n("condition/skillLevel", 300, 0, {
    skillId: skill,
    minLevel: 1,
  });
  const ok = n("action/showDialogue", 600, -60, {
    title: stationName,
    text: `You begin ${skill}...`,
  });
  const noSkill = n("action/showNotification", 600, 80, {
    message: `You need a higher ${skill} level.`,
    type: "error",
  });

  return graph(
    `${stationName} — Craft`,
    "event",
    [trigger, skillCheck, ok, noSkill],
    [
      e(trigger, "flow_out", skillCheck, "flow_in"),
      e(trigger, "player", skillCheck, "player"),
      e(skillCheck, "true", ok, "flow_in"),
      e(trigger, "player", ok, "player"),
      e(skillCheck, "false", noSkill, "flow_in"),
      e(trigger, "player", noSkill, "player"),
    ],
  );
}

interface ResourceData {
  resourceId?: string;
  resourceType?: string;
  name?: string;
}

function generateResourceGraph(data: ResourceData): ScriptGraph {
  resetUid();
  const resourceName = data.name ?? data.resourceId ?? "Resource";

  const skillMap: Record<string, string> = {
    mining: "mining",
    woodcutting: "woodcutting",
    fishing: "fishing",
    farming: "farming",
  };

  const skill = skillMap[data.resourceType ?? ""] ?? "gathering";

  const interact = n("trigger/onInteract", 0, 0);
  const skillCheck = n("condition/skillLevel", 300, 0, {
    skillId: skill,
    minLevel: 1,
  });
  const gather = n("action/giveXP", 600, -60, {
    skillId: skill,
    amount: 10,
  });
  const noSkill = n("action/showNotification", 600, 80, {
    message: `You need a higher ${skill} level.`,
    type: "error",
  });

  // Depletion → respawn
  const depleted = n("trigger/onResourceDepleted", 0, 240);
  const delay = n("flow/delay", 300, 240, { duration: 30 });
  const respawnFx = n("action/spawnParticle", 600, 240, {
    effect: "respawn_glow",
    duration: 2,
  });

  return graph(
    `${resourceName} — Gather`,
    "event",
    [interact, skillCheck, gather, noSkill, depleted, delay, respawnFx],
    [
      e(interact, "flow_out", skillCheck, "flow_in"),
      e(interact, "player", skillCheck, "player"),
      e(skillCheck, "true", gather, "flow_in"),
      e(interact, "player", gather, "player"),
      e(skillCheck, "false", noSkill, "flow_in"),
      e(interact, "player", noSkill, "player"),
      e(depleted, "flow_out", delay, "flow_in"),
      e(delay, "flow_out", respawnFx, "flow_in"),
    ],
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type EntityCategory =
  | "mobSpawn"
  | "gameMobSpawn"
  | "npc"
  | "gameNPC"
  | "station"
  | "gameStation"
  | "resource"
  | "gameResource"
  | "store";

/**
 * Generate a default behavior graph for a manifest entity.
 * Returns a pre-populated ScriptGraph based on the entity's type and data,
 * or undefined if no sensible default exists.
 */
export function generateDefaultGraph(
  entityCategory: EntityCategory,
  entityData: Record<string, unknown>,
): ScriptGraph | undefined {
  switch (entityCategory) {
    case "mobSpawn":
    case "gameMobSpawn":
      return generateMobSpawnGraph(entityData as MobSpawnData);

    case "npc":
    case "gameNPC":
      return generateNPCGraph(entityData as NPCData);

    case "station":
    case "gameStation":
      return generateStationGraph(entityData as StationData);

    case "resource":
    case "gameResource":
      return generateResourceGraph(entityData as ResourceData);

    case "store":
      return generateNPCGraph(entityData as NPCData);

    default:
      return undefined;
  }
}
