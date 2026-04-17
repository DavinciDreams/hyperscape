/**
 * TriggerEvaluator — Maps EventBus events to trigger nodes in script graphs.
 *
 * Maintains a registry of trigger type → event mapping. When an event fires,
 * finds all matching trigger nodes and provides the trigger data.
 */

import type { RuntimeScriptNode } from "./ScriptGraphInterpreter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Maps an event name to a trigger node type and extracts context. */
export interface TriggerMapping {
  /** The scripting trigger node type (e.g., "trigger/onPlayerEnterZone") */
  triggerType: string;
  /** EventBus event name(s) that activate this trigger */
  eventNames: string[];
  /** Extract trigger data from the event payload */
  extractData: (eventData: Record<string, unknown>) => Record<string, unknown>;
  /** Optional: check if a specific entity's trigger matches */
  matchesEntity?: (
    eventData: Record<string, unknown>,
    entityId: string,
    nodeData: Record<string, unknown>,
  ) => boolean;
}

// ---------------------------------------------------------------------------
// Default trigger mappings
// ---------------------------------------------------------------------------

export const DEFAULT_TRIGGER_MAPPINGS: TriggerMapping[] = [
  {
    triggerType: "trigger/onPlayerEnterZone",
    eventNames: ["zone:player-enter"],
    extractData: (data) => ({
      playerId: data.playerId,
      zoneId: data.zoneId,
      zoneName: data.zoneName,
    }),
    matchesEntity: (data, entityId) => data.zoneId === entityId,
  },
  {
    triggerType: "trigger/onPlayerLeaveZone",
    eventNames: ["zone:player-leave"],
    extractData: (data) => ({
      playerId: data.playerId,
      zoneId: data.zoneId,
    }),
    matchesEntity: (data, entityId) => data.zoneId === entityId,
  },
  {
    triggerType: "trigger/onMobKilled",
    eventNames: ["combat:death"],
    extractData: (data) => ({
      entityId: data.entityId,
      killerId: data.killerId,
      entityType: data.entityType,
    }),
    matchesEntity: (data, _entityId, nodeData) => {
      // Match if the killed mob type matches the node's configured mob type
      if (nodeData.mobType && data.entityType !== nodeData.mobType)
        return false;
      return true;
    },
  },
  {
    triggerType: "trigger/onItemCollected",
    eventNames: ["inventory:add"],
    extractData: (data) => ({
      playerId: data.playerId,
      itemId: data.itemId,
      quantity: data.quantity,
    }),
    matchesEntity: (_data, _entityId, nodeData) => {
      // Always match — item collection is global
      return !nodeData.itemFilter || true;
    },
  },
  {
    triggerType: "trigger/onQuestComplete",
    eventNames: ["quest:complete"],
    extractData: (data) => ({
      playerId: data.playerId,
      questId: data.questId,
    }),
  },
  {
    triggerType: "trigger/onTimer",
    eventNames: [], // Timer triggers are managed by ScriptingSystem directly
    extractData: () => ({
      timestamp: Date.now(),
    }),
  },

  // ---------------------------------------------------------------------------
  // Combat triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onCombatStarted",
    eventNames: ["combat:started"],
    extractData: (data) => ({
      attacker: data.attackerId ?? data.attacker,
      target: data.targetId ?? data.target,
    }),
  },
  {
    triggerType: "trigger/onCombatEnded",
    eventNames: ["combat:ended"],
    extractData: (data) => ({
      entity: data.entityId ?? data.entity,
    }),
  },
  {
    triggerType: "trigger/onPlayerDamaged",
    eventNames: ["combat:damage"],
    extractData: (data) => ({
      player: data.targetId ?? data.player,
      attacker: data.attackerId ?? data.attacker,
      damage: data.damage,
    }),
    matchesEntity: (data, _entityId, nodeData) => {
      if (
        nodeData.minDamage &&
        (data.damage as number) < (nodeData.minDamage as number)
      )
        return false;
      return true;
    },
  },
  {
    triggerType: "trigger/onPlayerDied",
    eventNames: ["entity:death"],
    extractData: (data) => ({
      player: data.entityId ?? data.player,
      killer: data.killerId ?? data.killer,
      position: data.position,
    }),
    matchesEntity: (data, _entityId, _nodeData) => {
      // Only match if the dead entity is a player
      return data.entityType === "player" || data.entityType === "Player";
    },
  },
  {
    triggerType: "trigger/onPlayerRespawned",
    eventNames: ["player:respawned"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
    }),
  },
  {
    triggerType: "trigger/onPlayerLevelUp",
    eventNames: ["skills:levelUp"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      skill: data.skillId ?? data.skill,
      level: data.level,
    }),
    matchesEntity: (data, _entityId, nodeData) => {
      if (nodeData.skillId && data.skillId !== nodeData.skillId) return false;
      return true;
    },
  },
  {
    triggerType: "trigger/onPlayerSpawned",
    eventNames: ["player:spawned"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
    }),
  },

  // ---------------------------------------------------------------------------
  // Mob triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onMobAggro",
    eventNames: ["aggro:triggered"],
    extractData: (data) => ({
      mob: data.mobId ?? data.mob,
      player: data.playerId ?? data.player,
    }),
    matchesEntity: (data, _entityId, nodeData) => {
      if (nodeData.mobType && data.mobType !== nodeData.mobType) return false;
      return true;
    },
  },
  {
    triggerType: "trigger/onMobDamaged",
    eventNames: ["mob:damaged"],
    extractData: (data) => ({
      mob: data.mobId ?? data.mob,
      attacker: data.attackerId ?? data.attacker,
      damage: data.damage,
    }),
    matchesEntity: (data, _entityId, nodeData) => {
      if (nodeData.mobType && data.mobType !== nodeData.mobType) return false;
      return true;
    },
  },

  // ---------------------------------------------------------------------------
  // NPC / interaction triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onNPCInteraction",
    eventNames: ["npc:interaction"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      npc: data.npcId ?? data.npc,
      npcId: data.npcId,
    }),
    matchesEntity: (data, _entityId, nodeData) => {
      if (nodeData.npcId && data.npcId !== nodeData.npcId) return false;
      return true;
    },
  },

  // ---------------------------------------------------------------------------
  // Item triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onItemDropped",
    eventNames: ["item:dropped"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      itemId: data.itemId,
      position: data.position,
    }),
  },
  {
    triggerType: "trigger/onItemEquipped",
    eventNames: ["equipment:equipped"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      itemId: data.itemId,
      slot: data.slot,
    }),
  },
  {
    triggerType: "trigger/onItemUsed",
    eventNames: ["item:used"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      itemId: data.itemId,
    }),
  },

  // ---------------------------------------------------------------------------
  // Quest triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onQuestStarted",
    eventNames: ["quest:started"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      questId: data.questId,
    }),
  },
  {
    triggerType: "trigger/onQuestProgressed",
    eventNames: ["quest:progressed"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      questId: data.questId,
      stage: data.stage ?? data.stageId,
    }),
  },

  // ---------------------------------------------------------------------------
  // Resource / crafting triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onResourceGathered",
    eventNames: ["resource:gathered"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      resourceType: data.resourceType,
      itemId: data.itemId,
      position: data.position,
    }),
  },
  {
    triggerType: "trigger/onResourceDepleted",
    eventNames: ["resource:depleted"],
    extractData: (data) => ({
      position: data.position,
      resourceType: data.resourceType,
    }),
  },
  {
    triggerType: "trigger/onCraftingComplete",
    eventNames: ["processing:complete"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      itemId: data.itemId,
      skill: data.skillId ?? data.skill,
    }),
  },

  // ---------------------------------------------------------------------------
  // Economy triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onStoreTransaction",
    eventNames: ["store:transaction"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      itemId: data.itemId,
      action: data.action,
      price: data.price,
    }),
  },
  {
    triggerType: "trigger/onTradeCompleted",
    eventNames: ["trade:completed"],
    extractData: (data) => ({
      playerA: data.playerA ?? data.player1,
      playerB: data.playerB ?? data.player2,
    }),
  },

  // ---------------------------------------------------------------------------
  // Dialogue / UI triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onDialogueEnded",
    eventNames: ["dialogue:end"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      npcId: data.npcId,
    }),
  },
  {
    triggerType: "trigger/onBankOpened",
    eventNames: ["bank:open"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
    }),
  },

  // ---------------------------------------------------------------------------
  // Entity lifecycle triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onEntitySpawned",
    eventNames: ["entity:spawned"],
    extractData: (data) => ({
      entity: data.entityId ?? data.entity,
      entityType: data.entityType,
      position: data.position,
    }),
  },

  // ---------------------------------------------------------------------------
  // Prayer triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onPrayerToggled",
    eventNames: ["prayer:toggled"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      prayerId: data.prayerId,
      active: data.active,
    }),
  },

  // ---------------------------------------------------------------------------
  // Duel triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onDuelCompleted",
    eventNames: ["duel:completed"],
    extractData: (data) => ({
      winner: data.winnerId ?? data.winner,
      loser: data.loserId ?? data.loser,
    }),
  },

  // ---------------------------------------------------------------------------
  // Movement triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onMovementCompleted",
    eventNames: ["movement:completed"],
    extractData: (data) => ({
      entityId: data.entityId ?? data.entity,
      position: data.position,
    }),
    matchesEntity: (data, entityId) => data.entityId === entityId,
  },
  {
    triggerType: "trigger/onMovementStarted",
    eventNames: ["movement:started"],
    extractData: (data) => ({
      entityId: data.entityId ?? data.entity,
      position: data.position,
    }),
    matchesEntity: (data, entityId) => data.entityId === entityId,
  },

  // ---------------------------------------------------------------------------
  // Health / damage triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onPlayerHealthChanged",
    eventNames: ["player:health_updated"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      health: data.health ?? data.currentHealth,
      maxHealth: data.maxHealth ?? data.maxHp,
    }),
    matchesEntity: (data, entityId) =>
      (data.playerId ?? data.player) === entityId,
  },
  {
    triggerType: "trigger/onEntityDamaged",
    eventNames: ["entity:damaged"],
    extractData: (data) => ({
      entityId: data.entityId ?? data.entity,
      damage: data.damage ?? data.amount,
      sourceEntityId: data.sourceEntityId ?? data.attackerId,
    }),
    matchesEntity: (data, entityId) =>
      (data.entityId ?? data.entity) === entityId,
  },

  // ---------------------------------------------------------------------------
  // Teleport triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onTeleportCompleted",
    eventNames: ["player:teleported"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      position: data.position,
    }),
    matchesEntity: (data, entityId) =>
      (data.playerId ?? data.player) === entityId,
  },

  // ---------------------------------------------------------------------------
  // Dialogue triggers (extended)
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onDialogueResponse",
    eventNames: ["dialogue:response"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      npcId: data.npcId ?? data.npc,
      responseId: data.responseId ?? data.optionId,
    }),
    matchesEntity: (data, _entityId, nodeData) => {
      if (nodeData.npcId && data.npcId !== nodeData.npcId) return false;
      if (nodeData.responseId && data.responseId !== nodeData.responseId)
        return false;
      return true;
    },
  },

  // ---------------------------------------------------------------------------
  // Crafting skill triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onCookingComplete",
    eventNames: ["cooking:complete"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      itemId: data.itemId ?? data.item,
    }),
  },
  {
    triggerType: "trigger/onSmithingComplete",
    eventNames: ["smithing:complete"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      itemId: data.itemId ?? data.item,
    }),
  },
  {
    triggerType: "trigger/onSmeltingComplete",
    eventNames: ["smelting:complete"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      itemId: data.itemId ?? data.item,
    }),
  },
  {
    triggerType: "trigger/onFletchingComplete",
    eventNames: ["fletching:complete"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      itemId: data.itemId ?? data.item,
    }),
  },
  {
    triggerType: "trigger/onFiremakingSuccess",
    eventNames: ["firemaking:success"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
    }),
  },

  // ---------------------------------------------------------------------------
  // Player join / leave triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onPlayerJoined",
    eventNames: ["player:joined"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
    }),
  },
  {
    triggerType: "trigger/onPlayerLeft",
    eventNames: ["player:left"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
    }),
  },

  // ---------------------------------------------------------------------------
  // Aggro triggers (extended)
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onAggroTriggered",
    eventNames: ["aggro:mob_npc_aggroed"],
    extractData: (data) => ({
      mobId: data.mobId ?? data.mob,
      playerId: data.playerId ?? data.player,
    }),
    matchesEntity: (data, _entityId, nodeData) => {
      if (nodeData.mobType && data.mobType !== nodeData.mobType) return false;
      return true;
    },
  },

  // ---------------------------------------------------------------------------
  // Item / loot triggers (extended)
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onItemPickup",
    eventNames: ["item:picked_up"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      itemId: data.itemId ?? data.item,
    }),
  },
  {
    triggerType: "trigger/onCorpseLoot",
    eventNames: ["corpse:loot_request"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      corpseId: data.corpseId ?? data.corpse,
    }),
  },

  // ---------------------------------------------------------------------------
  // Banking triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onBankDeposit",
    eventNames: ["bank:deposit_success"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      itemId: data.itemId ?? data.item,
    }),
  },
  {
    triggerType: "trigger/onBankWithdraw",
    eventNames: ["bank:withdraw_success"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
      itemId: data.itemId ?? data.item,
    }),
  },

  // ---------------------------------------------------------------------------
  // Run / stamina triggers
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onRunToggle",
    eventNames: ["movement:toggle:run"],
    extractData: (data) => ({
      playerId: data.playerId ?? data.player,
    }),
  },
  {
    triggerType: "trigger/onStaminaDepleted",
    eventNames: ["movement:stamina:depleted"],
    extractData: (data) => ({
      entityId: data.entityId ?? data.entity,
    }),
    matchesEntity: (data, entityId) =>
      (data.entityId ?? data.entity) === entityId,
  },

  // ---------------------------------------------------------------------------
  // Generic entity triggers — fire for ANY entity (mobs, NPCs, resources).
  // trigger/onPlayerDied above is the player-scoped variant; this one is unscoped.
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onEntityDeath",
    eventNames: ["entity:death"],
    extractData: (data) => ({
      entity: data.entityId ?? data.entity,
      entityId: data.entityId ?? data.entity,
      killer: data.killedBy ?? data.killerId ?? data.killer,
      entityType: data.entityType,
      position: data.deathPosition ?? data.position,
    }),
    matchesEntity: (data, entityId, nodeData) => {
      // Filter by mob type if configured on the node. Accept entityType or mobType.
      if (
        nodeData.mobType &&
        data.entityType !== nodeData.mobType &&
        data.mobType !== nodeData.mobType
      ) {
        return false;
      }
      // Scope to the owning entity — trigger only fires for its own death.
      // Fallback: always match if entity id not in payload (rare).
      const deadId = data.entityId ?? data.entity;
      if (!deadId) return true;
      return deadId === entityId;
    },
  },
  {
    triggerType: "trigger/onInteract",
    eventNames: ["entity:interacted"],
    extractData: (data) => ({
      player: data.playerId ?? data.player,
      playerId: data.playerId ?? data.player,
      entity: data.entityId ?? data.entity,
      entityId: data.entityId ?? data.entity,
      position: data.position,
    }),
    matchesEntity: (data, entityId) => {
      const targetId = data.entityId ?? data.entity;
      if (!targetId) return true;
      return targetId === entityId;
    },
  },

  // ---------------------------------------------------------------------------
  // Synthetic trigger — fires once when a behavior graph is attached to an
  // entity (UE5 "BeginPlay" equivalent). Emitted by ScriptingSystem.addGraph.
  // ---------------------------------------------------------------------------
  {
    triggerType: "trigger/onReady",
    eventNames: ["scripting:graph_ready"],
    extractData: (data) => ({
      entity: data.entityId ?? data.entity,
      entityId: data.entityId ?? data.entity,
      position: data.position,
    }),
    matchesEntity: (data, entityId) => {
      const targetId = data.entityId ?? data.entity;
      if (!targetId) return true;
      return targetId === entityId;
    },
  },
];

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export class TriggerEvaluator {
  private mappings: Map<string, TriggerMapping> = new Map();
  private eventToTriggers: Map<string, TriggerMapping[]> = new Map();

  constructor(mappings: TriggerMapping[] = DEFAULT_TRIGGER_MAPPINGS) {
    for (const mapping of mappings) {
      this.register(mapping);
    }
  }

  /** Register a trigger mapping. */
  register(mapping: TriggerMapping): void {
    this.mappings.set(mapping.triggerType, mapping);

    for (const eventName of mapping.eventNames) {
      const existing = this.eventToTriggers.get(eventName) ?? [];
      existing.push(mapping);
      this.eventToTriggers.set(eventName, existing);
    }
  }

  /** Get all event names that should be subscribed to. */
  getSubscribedEvents(): string[] {
    return Array.from(this.eventToTriggers.keys());
  }

  /** Find trigger mappings that match a given event. */
  getMappingsForEvent(eventName: string): TriggerMapping[] {
    return this.eventToTriggers.get(eventName) ?? [];
  }

  /** Get the mapping for a specific trigger type (used by event-index builders). */
  getMappingForType(triggerType: string): TriggerMapping | undefined {
    return this.mappings.get(triggerType);
  }

  /** Check if a trigger node matches an event for a specific entity. */
  matchesTrigger(
    triggerNode: RuntimeScriptNode,
    eventName: string,
    eventData: Record<string, unknown>,
    entityId: string,
  ): boolean {
    const mapping = this.mappings.get(triggerNode.type);
    if (!mapping) return false;
    if (!mapping.eventNames.includes(eventName)) return false;

    if (mapping.matchesEntity) {
      return mapping.matchesEntity(eventData, entityId, triggerNode.data);
    }

    return true;
  }

  /** Extract trigger data from an event payload. */
  extractTriggerData(
    triggerType: string,
    eventData: Record<string, unknown>,
  ): Record<string, unknown> {
    const mapping = this.mappings.get(triggerType);
    if (!mapping) return eventData;
    return mapping.extractData(eventData);
  }
}
