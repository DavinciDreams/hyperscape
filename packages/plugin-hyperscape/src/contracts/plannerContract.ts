import type {
  HyperscapeDecisionTrace,
  HyperscapeEntitySnapshot,
  HyperscapePlayerSnapshot,
  HyperscapeWorldSnapshot,
} from "../types.js";

export const EMBODIED_PLANNER_SCHEMA_VERSION = "embodied-planner-v1";

export type CanonicalPlannerIntentType =
  | "NAVIGATE_TO_ENTITY"
  | "NAVIGATE_TO_POSITION"
  | "FACE_ENTITY"
  | "PICKUP_ENTITY"
  | "EMOTE"
  | "SPEAK"
  | "IDLE"
  | "ABORT";

export type CanonicalPlannerEntityType =
  | "player"
  | "npc"
  | "mob"
  | "resource"
  | "item"
  | "object"
  | "landmark"
  | "unknown";

export interface CanonicalPlannerEntity {
  entityId: string;
  label: string;
  type: CanonicalPlannerEntityType;
  position: [number, number, number];
  rotation: [number, number, number, number] | null;
  sourceEntityType: string;
  confidence: number;
  affordances: string[];
  attributes: {
    alive: boolean | null;
    level: number | null;
    mobType: string | null;
    resourceType: string | null;
    itemId: string | null;
    playerId: string | null;
    playerName: string | null;
    npcType: string | null;
  };
}

export interface CanonicalPlannerActionCandidate {
  intent: CanonicalPlannerIntentType;
  sourceActionName: string;
  reason: string;
  targetEntityId: string | null;
  targetEntityLabel: string | null;
}

export interface CanonicalPlannerPlayerState {
  entityId: string;
  playerId: string;
  playerName: string;
  position: [number, number, number];
  rotation: [number, number, number, number] | null;
  healthCurrent: number;
  healthMax: number;
  staminaCurrent: number;
  staminaMax: number;
  alive: boolean;
  inCombat: boolean;
  combatTarget: string | null;
  coins: number;
  inventoryCount: number;
}

export interface CanonicalPlannerContext {
  schemaVersion: typeof EMBODIED_PLANNER_SCHEMA_VERSION;
  source: "hyperscape";
  capturedAt: number;
  worldId: string | null;
  roomId: string | null;
  player: CanonicalPlannerPlayerState | null;
  entities: CanonicalPlannerEntity[];
  actionCandidates: CanonicalPlannerActionCandidate[];
  recentDecisionTrace: HyperscapeDecisionTrace[];
  metadata: {
    localChatCount: number;
    questCount: number;
    bankItemCount: number;
    availableGoalTypes: string[];
  };
}

function inferEntityType(
  entity: HyperscapeEntitySnapshot,
): CanonicalPlannerEntityType {
  if (entity.playerId || entity.playerName || entity.entityType === "player") {
    return "player";
  }
  if (entity.itemId) {
    return "item";
  }
  if (entity.npcType || entity.entityType === "npc") {
    return "npc";
  }
  if (entity.mobType || entity.entityType === "mob") {
    return "mob";
  }
  if (entity.resourceType) {
    return "resource";
  }
  if (
    entity.entityType === "bank" ||
    entity.entityType === "anvil" ||
    entity.entityType === "furnace"
  ) {
    return "landmark";
  }
  if (entity.entityType.length > 0) {
    return "object";
  }
  return "unknown";
}

function inferAffordances(entity: HyperscapeEntitySnapshot): string[] {
  const affordances: string[] = ["navigate_to"];

  if (entity.itemId) {
    affordances.push("pickup");
  }
  if (entity.playerId || entity.playerName || entity.npcType) {
    affordances.push("speak_to");
    affordances.push("face");
  }
  if (entity.mobType) {
    affordances.push("face");
  }
  if (entity.resourceType && entity.depleted !== true) {
    affordances.push("interact");
  }
  if (
    entity.entityType === "bank" ||
    entity.entityType === "anvil" ||
    entity.entityType === "furnace"
  ) {
    affordances.push("approach");
  }

  return affordances;
}

function toCanonicalEntity(
  entity: HyperscapeEntitySnapshot,
): CanonicalPlannerEntity {
  return {
    entityId: entity.id,
    label: entity.name,
    type: inferEntityType(entity),
    position: entity.position,
    rotation: entity.rotation,
    sourceEntityType: entity.entityType,
    confidence: 1,
    affordances: inferAffordances(entity),
    attributes: {
      alive: entity.alive,
      level: entity.level,
      mobType: entity.mobType,
      resourceType: entity.resourceType,
      itemId: entity.itemId,
      playerId: entity.playerId,
      playerName: entity.playerName,
      npcType: entity.npcType,
    },
  };
}

function toCanonicalPlayerState(
  player: HyperscapePlayerSnapshot | null,
): CanonicalPlannerPlayerState | null {
  if (!player) {
    return null;
  }

  return {
    entityId: player.id,
    playerId: player.playerId,
    playerName: player.playerName,
    position: player.position,
    rotation: player.rotation,
    healthCurrent: player.healthCurrent,
    healthMax: player.healthMax,
    staminaCurrent: player.staminaCurrent,
    staminaMax: player.staminaMax,
    alive: player.alive,
    inCombat: player.inCombat,
    combatTarget: player.combatTarget,
    coins: player.coins,
    inventoryCount: player.inventory.length,
  };
}

function addActionCandidate(
  actions: CanonicalPlannerActionCandidate[],
  candidate: CanonicalPlannerActionCandidate,
): void {
  const duplicate = actions.some(
    (existing) =>
      existing.intent === candidate.intent &&
      existing.targetEntityId === candidate.targetEntityId &&
      existing.sourceActionName === candidate.sourceActionName,
  );

  if (!duplicate) {
    actions.push(candidate);
  }
}

function deriveActionCandidates(
  snapshot: HyperscapeWorldSnapshot,
): CanonicalPlannerActionCandidate[] {
  const actions: CanonicalPlannerActionCandidate[] = [];

  addActionCandidate(actions, {
    intent: "IDLE",
    sourceActionName: "IDLE",
    reason: "A safe no-op option should always be available.",
    targetEntityId: null,
    targetEntityLabel: null,
  });

  addActionCandidate(actions, {
    intent: "EMOTE",
    sourceActionName: "CHAT_MESSAGE",
    reason:
      "Social/emote behavior can be mapped into robot-safe expressive actions.",
    targetEntityId: null,
    targetEntityLabel: null,
  });

  for (const entity of snapshot.nearbyEntities) {
    addActionCandidate(actions, {
      intent: "NAVIGATE_TO_ENTITY",
      sourceActionName: "MOVE_TO",
      reason: "Nearby entities can be used as navigation targets.",
      targetEntityId: entity.id,
      targetEntityLabel: entity.name,
    });

    addActionCandidate(actions, {
      intent: "FACE_ENTITY",
      sourceActionName: "MOVE_TO",
      reason: "Nearby entities can be treated as orientation targets.",
      targetEntityId: entity.id,
      targetEntityLabel: entity.name,
    });

    if (entity.itemId) {
      addActionCandidate(actions, {
        intent: "PICKUP_ENTITY",
        sourceActionName: "PICKUP_ITEM",
        reason: "Ground items are the closest analog to robot pick-up tasks.",
        targetEntityId: entity.id,
        targetEntityLabel: entity.name,
      });
    }

    if (entity.playerId || entity.playerName || entity.npcType) {
      addActionCandidate(actions, {
        intent: "SPEAK",
        sourceActionName: entity.npcType ? "TALK_TO_NPC" : "CHAT_MESSAGE",
        reason: "Players and NPCs are valid conversational targets.",
        targetEntityId: entity.id,
        targetEntityLabel: entity.name,
      });
    }
  }

  if (snapshot.player?.inCombat) {
    addActionCandidate(actions, {
      intent: "ABORT",
      sourceActionName: "FLEE",
      reason: "Unsafe combat states should map to a safe abort/flee action.",
      targetEntityId: snapshot.player.combatTarget,
      targetEntityLabel: snapshot.player.combatTarget,
    });
  }

  return actions;
}

export function buildCanonicalPlannerContext(
  snapshot: HyperscapeWorldSnapshot,
  recentDecisionTrace: HyperscapeDecisionTrace[],
): CanonicalPlannerContext {
  return {
    schemaVersion: EMBODIED_PLANNER_SCHEMA_VERSION,
    source: "hyperscape",
    capturedAt: snapshot.capturedAt,
    worldId: snapshot.worldId,
    roomId: snapshot.currentRoomId,
    player: toCanonicalPlayerState(snapshot.player),
    entities: snapshot.nearbyEntities.map(toCanonicalEntity),
    actionCandidates: deriveActionCandidates(snapshot),
    recentDecisionTrace,
    metadata: {
      localChatCount: snapshot.localChat.length,
      questCount: snapshot.quests.length,
      bankItemCount: snapshot.bankItems.length,
      availableGoalTypes: [...snapshot.availableGoalTypes],
    },
  };
}
