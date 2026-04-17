/**
 * ActionExecutor — Maps action node types to game system calls.
 *
 * Each action handler receives the node data and execution context,
 * then calls the appropriate game system via world.emit().
 */

import type {
  ActionHandler,
  ExecutionContext,
  ScriptingWorldInterface,
} from "./ScriptGraphInterpreter";

// ---------------------------------------------------------------------------
// String sanitization (Phase 5.5 of PLAN.md)
//
// Applied to all free-form user-authored strings that flow to player-facing
// UI (chat, dialogue, notifications). Strips ASCII control characters
// (0x00-0x1F and 0x7F) except common whitespace, and caps length.
// ---------------------------------------------------------------------------

const SANITIZE_MAX_CHAT_LENGTH = 500;
const SANITIZE_MAX_DIALOGUE_LENGTH = 2000;
const SANITIZE_MAX_TITLE_LENGTH = 120;

/**
 * Strip control characters (except tab/newline/carriage-return) and cap
 * length. Returns an empty string for non-string input.
 */
function sanitizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (let i = 0; i < value.length && out.length < maxLength; i++) {
    const code = value.charCodeAt(i);
    // Allow tab(9), LF(10), CR(13); strip other C0 controls and DEL(127)
    if (code === 9 || code === 10 || code === 13) {
      out += value[i];
      continue;
    }
    if (code < 32 || code === 127) continue;
    out += value[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Default action handlers
// ---------------------------------------------------------------------------

const spawnMob: ActionHandler = (data, ctx) => {
  ctx.world.emit("mob_npc:spawn_request", {
    mobType: data.mobType as string,
    position: data.position ?? ctx.triggerData.position,
    count: (data.count as number) ?? 1,
    level: (data.level as number) ?? 1,
    sourceEntityId: ctx.entityId,
  });
};

const despawnEntity: ActionHandler = (data, ctx) => {
  const targetId = (data.entityId as string) ?? ctx.triggerData.entityId;
  if (targetId) {
    ctx.world.emit("entity:remove", {
      entityId: targetId,
      sourceEntityId: ctx.entityId,
    });
  }
};

const teleportPlayer: ActionHandler = (data, ctx) => {
  const playerId = (data.playerId as string) ?? ctx.triggerData.playerId;
  const position = data.position as { x: number; y: number; z: number };
  if (playerId && position) {
    ctx.world.emit("player:teleport_request", {
      playerId,
      position,
      suppressEffect: false,
    });
  }
};

const showDialogue: ActionHandler = (data, ctx) => {
  const playerId = (data.playerId as string) ?? ctx.triggerData.playerId;
  ctx.world.emit("dialogue:start", {
    playerId,
    title: sanitizeString(data.title, SANITIZE_MAX_TITLE_LENGTH),
    text: sanitizeString(data.text, SANITIZE_MAX_DIALOGUE_LENGTH),
    npcId: (data.npcId as string) ?? ctx.entityId,
    sourceEntityId: ctx.entityId,
  });
};

const startQuest: ActionHandler = (data, ctx) => {
  const playerId = (data.playerId as string) ?? ctx.triggerData.playerId;
  ctx.world.emit("quest:started", {
    playerId,
    questId: data.questId as string,
    sourceEntityId: ctx.entityId,
  });
};

const playSound: ActionHandler = (data, ctx) => {
  ctx.world.emit("animation:play", {
    soundId: data.soundId as string,
    position: data.position ?? ctx.triggerData.position,
    volume: (data.volume as number) ?? 1.0,
    sourceEntityId: ctx.entityId,
  });
};

const setVariable: ActionHandler = (data, ctx) => {
  const varName = data.variableName as string;
  const value = data.value;
  if (varName) {
    ctx.variables.set(varName, value);
  }
};

const giveItem: ActionHandler = (data, ctx) => {
  const playerId = (data.playerId as string) ?? ctx.triggerData.playerId;
  ctx.world.emit("inventory:item_added", {
    playerId,
    itemId: data.itemId as string,
    quantity: (data.quantity as number) ?? 1,
    sourceEntityId: ctx.entityId,
  });
};

// ---------------------------------------------------------------------------
// Combat actions
// ---------------------------------------------------------------------------

const startCombat: ActionHandler = (data, ctx) => {
  const attackerId =
    (data.attacker as string) ?? ctx.triggerData.attacker ?? ctx.entityId;
  const targetId = (data.target as string) ?? ctx.triggerData.target;
  if (attackerId && targetId) {
    ctx.world.emit("combat:attack", {
      attackerId,
      targetId,
    });
  }
};

const stopCombat: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("combat:stop_attack", {
      entityId,
    });
  }
};

const dealDamage: ActionHandler = (data, ctx) => {
  const targetId = (data.target as string) ?? ctx.triggerData.target;
  if (targetId) {
    ctx.world.emit("entity:damaged", {
      entityId: targetId,
      damage: (data.damage as number) ?? 0,
      damageType: (data.damageType as string) ?? "melee",
      sourceEntityId: ctx.entityId,
    });
  }
};

const healEntity: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("combat:heal", {
      entityId,
      amount: (data.amount as number) ?? 0,
      percentage: (data.percentage as number) ?? 0,
      sourceEntityId: ctx.entityId,
    });
  }
};

// ---------------------------------------------------------------------------
// Inventory / item actions
// ---------------------------------------------------------------------------

const removeItem: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("inventory:remove_item", {
      playerId,
      itemId: data.itemId as string,
      quantity: (data.quantity as number) ?? 1,
    });
  }
};

const equipItem: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("equipment:forceEquip", {
      playerId,
      itemId: data.itemId as string,
    });
  }
};

const spawnItem: ActionHandler = (data, ctx) => {
  ctx.world.emit("item:spawn_request", {
    itemId: data.itemId as string,
    quantity: (data.quantity as number) ?? 1,
    position: data.position ?? ctx.triggerData.position,
    despawnTime: (data.despawnTime as number) ?? 0,
  });
};

// ---------------------------------------------------------------------------
// Skills / XP / economy actions
// ---------------------------------------------------------------------------

const giveXP: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("skills:xp_gained", {
      playerId,
      skillId: data.skillId as string,
      amount: (data.amount as number) ?? 0,
    });
  }
};

const giveCoins: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("inventory:add_coins", {
      playerId,
      amount: (data.amount as number) ?? 0,
    });
  }
};

// ---------------------------------------------------------------------------
// Entity actions
// ---------------------------------------------------------------------------

const spawnNPC: ActionHandler = (data, ctx) => {
  ctx.world.emit("npc:spawn_request", {
    npcId: data.npcId as string,
    name: (data.name as string) ?? "",
    position: data.position ?? ctx.triggerData.position,
  });
};

const moveEntity: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("entity:move_request", {
      entityId,
      position: {
        x: (data.x as number) ?? 0,
        y: (data.y as number) ?? 0,
        z: (data.z as number) ?? 0,
      },
      speed: (data.speed as number) ?? 1,
    });
  }
};

const setEntityProperty: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("entity:property_request", {
      entityId,
      property: data.property as string,
      value: data.value,
    });
  }
};

// ---------------------------------------------------------------------------
// UI / shop / bank actions
// ---------------------------------------------------------------------------

const openShop: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("store:open", {
      playerId,
      storeId: data.storeId as string,
    });
  }
};

const openBank: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("bank:open", {
      playerId,
    });
  }
};

const showNotification: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("ui:toast", {
      playerId,
      message: sanitizeString(data.message, SANITIZE_MAX_CHAT_LENGTH),
      type: (data.type as string) ?? "info",
    });
  }
};

const sendChat: ActionHandler = (data, _ctx) => {
  _ctx.world.emit("chat:message", {
    message: sanitizeString(data.message, SANITIZE_MAX_CHAT_LENGTH),
    sender: sanitizeString(
      (data.sender as string) ?? "System",
      SANITIZE_MAX_TITLE_LENGTH,
    ),
    color: (data.color as string) ?? "#ffffff",
  });
};

// ---------------------------------------------------------------------------
// Dialogue / quest actions
// ---------------------------------------------------------------------------

const startDialogueTree: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("dialogue:start", {
      playerId,
      npcId: (data.npc as string) ?? (data.npcId as string),
      dialogueId: data.dialogueId as string,
    });
  }
};

const progressQuest: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("quest:progressed", {
      playerId,
      questId: data.questId as string,
      stageId: (data.stageId as string) ?? undefined,
    });
  }
};

const completeQuest: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("quest:completed", {
      playerId,
      questId: data.questId as string,
    });
  }
};

// ---------------------------------------------------------------------------
// Prayer actions
// ---------------------------------------------------------------------------

const activatePrayer: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("prayer:toggle", {
      playerId,
      prayerId: data.prayerId as string,
      active: true,
    });
  }
};

const deactivatePrayer: ActionHandler = (data, ctx) => {
  const playerId = (data.player as string) ?? ctx.triggerData.playerId;
  if (playerId) {
    ctx.world.emit("prayer:toggle", {
      playerId,
      prayerId: (data.prayerId as string) ?? null,
      active: false,
    });
  }
};

// ---------------------------------------------------------------------------
// Audio / VFX actions
// ---------------------------------------------------------------------------

const playMusic: ActionHandler = (data, _ctx) => {
  _ctx.world.emit("audio:play_music", {
    trackId: data.trackId as string,
    fadeIn: (data.fadeIn as number) ?? 0,
  });
};

const stopMusic: ActionHandler = (data, _ctx) => {
  _ctx.world.emit("audio:stop_music", {
    fadeOut: (data.fadeOut as number) ?? 0,
  });
};

const spawnParticle: ActionHandler = (data, ctx) => {
  ctx.world.emit("particle:spawn", {
    effect: data.effect as string,
    position: data.position ?? ctx.triggerData.position,
    duration: (data.duration as number) ?? 1000,
  });
};

// ---------------------------------------------------------------------------
// Variable actions
// ---------------------------------------------------------------------------

const incrementVariable: ActionHandler = (data, ctx) => {
  const varName = data.variableName as string;
  const amount = (data.amount as number) ?? 1;
  if (varName) {
    const current = (ctx.variables.get(varName) as number) ?? 0;
    ctx.variables.set(varName, current + amount);
  }
};

// ---------------------------------------------------------------------------
// Property / state actions
// ---------------------------------------------------------------------------

const getEntityProperty: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  const property = data.property as string;
  const variableName = data.variableName as string;
  if (entityId && property && variableName) {
    const entity = ctx.world.getEntityById(entityId);
    if (entity) {
      const entityData = (entity as Record<string, unknown>).data as
        | Record<string, unknown>
        | undefined;
      const value = entityData ? entityData[property] : undefined;
      ctx.variables.set(variableName, value);
    }
  }
};

// ---------------------------------------------------------------------------
// Animation / movement actions
// ---------------------------------------------------------------------------

const playAnimation: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("animation:play", {
      entityId,
      animationName: data.animationName as string,
      loop: (data.loop as boolean) ?? false,
    });
  }
};

const setMovementSpeed: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("movement:speed:changed", {
      entityId,
      speed: (data.speed as number) ?? 1,
    });
  }
};

const lockMovement: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("movement:stop", {
      entityId,
      locked: true,
    });
  }
};

const unlockMovement: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("movement:stop", {
      entityId,
      locked: false,
    });
  }
};

// ---------------------------------------------------------------------------
// Buff actions
// ---------------------------------------------------------------------------

const applyBuff: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("entity:property_request", {
      entityId,
      property: "buff",
      value: {
        buffId: data.buffId as string,
        duration: (data.duration as number) ?? 10000,
      },
    });
  }
};

const removeBuff: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("entity:property_request", {
      entityId,
      property: "removeBuff",
      value: { buffId: data.buffId as string },
    });
  }
};

// ---------------------------------------------------------------------------
// Entity configuration actions
// ---------------------------------------------------------------------------

const setAggroRange: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("entity:property_request", {
      entityId,
      property: "aggroRange",
      value: (data.range as number) ?? 10,
    });
  }
};

const setRespawnTime: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("entity:property_request", {
      entityId,
      property: "respawnTicks",
      value: (data.ticks as number) ?? 100,
    });
  }
};

const setDialogueOverride: ActionHandler = (data, ctx) => {
  const entityId =
    (data.entity as string) ?? ctx.triggerData.entity ?? ctx.entityId;
  if (entityId) {
    ctx.world.emit("entity:property_request", {
      entityId,
      property: "dialogueOverride",
      value: {
        dialogueId: data.dialogueId as string,
        text: data.text as string,
      },
    });
  }
};

// ---------------------------------------------------------------------------
// Item actions (player-targeted)
// ---------------------------------------------------------------------------

const dropItem: ActionHandler = (data, ctx) => {
  const playerId =
    (data.player as string) ?? (ctx.triggerData.playerId as string);
  if (playerId) {
    ctx.world.emit("item:drop", {
      playerId,
      itemId: data.itemId as string,
      quantity: (data.quantity as number) ?? 1,
    });
  }
};

// ---------------------------------------------------------------------------
// Area-of-effect actions
// ---------------------------------------------------------------------------

const despawnAllInRadius: ActionHandler = (data, ctx) => {
  ctx.world.emit("entity:remove", {
    position: data.position ?? ctx.triggerData.position,
    radius: (data.radius as number) ?? 10,
    entityType: data.entityType as string,
  });
};

// ---------------------------------------------------------------------------
// Utility / debug actions
// ---------------------------------------------------------------------------

const log: ActionHandler = (data, _ctx) => {
  console.log(`[Script] ${(data.message as string) ?? ""}`, data.value ?? "");
};

const emitCustomEvent: ActionHandler = (data, ctx) => {
  const payload =
    data.payload && typeof data.payload === "object"
      ? (data.payload as Record<string, unknown>)
      : {};
  ctx.world.emit(data.eventName as string, {
    entityId: ctx.entityId,
    ...payload,
  });
};

const debugDraw: ActionHandler = (data, ctx) => {
  // Fire-and-forget: editor/dev overlays subscribe to `scripting:debug_draw`
  // and render the shape. No-op when no subscriber is wired up.
  ctx.world.emit("scripting:debug_draw", {
    entityId: ctx.entityId,
    shape: (data.shape as string) ?? "sphere",
    position: data.position ?? null,
    radius: (data.radius as number) ?? 1,
    color: (data.color as string) ?? "#ff00ff",
    duration: (data.duration as number) ?? 1,
  });
};

const breakpoint: ActionHandler = (data, ctx) => {
  // Emits a debugger event for the editor. Pause/resume is handled by the
  // editor debugger (not yet implemented) — execution continues unconditionally
  // so production graphs with breakpoints don't deadlock.
  ctx.world.emit("scripting:breakpoint", {
    entityId: ctx.entityId,
    label: (data.label as string) ?? "",
    variables: Object.fromEntries(ctx.variables.entries()),
  });
};

// ---------------------------------------------------------------------------
// Flow control nodes
// ---------------------------------------------------------------------------

const wait: ActionHandler = () => {
  // No-op: visual spacer for the graph interpreter.
};

// ---------------------------------------------------------------------------
// Executor class
// ---------------------------------------------------------------------------

export class ActionExecutor {
  private handlers: Map<string, ActionHandler> = new Map();

  constructor() {
    // Register default action handlers
    this.register("action/spawnMob", spawnMob);
    this.register("action/despawnEntity", despawnEntity);
    this.register("action/teleportPlayer", teleportPlayer);
    this.register("action/showDialogue", showDialogue);
    this.register("action/startQuest", startQuest);
    this.register("action/playSound", playSound);
    this.register("action/setVariable", setVariable);
    this.register("action/giveItem", giveItem);

    // Combat actions
    this.register("action/startCombat", startCombat);
    this.register("action/stopCombat", stopCombat);
    this.register("action/dealDamage", dealDamage);
    this.register("action/healEntity", healEntity);

    // Inventory / item actions
    this.register("action/removeItem", removeItem);
    this.register("action/equipItem", equipItem);
    this.register("action/spawnItem", spawnItem);

    // Skills / XP / economy actions
    this.register("action/giveXP", giveXP);
    this.register("action/giveCoins", giveCoins);

    // Entity actions
    this.register("action/spawnNPC", spawnNPC);
    this.register("action/moveEntity", moveEntity);
    this.register("action/setEntityProperty", setEntityProperty);

    // UI / shop / bank actions
    this.register("action/openShop", openShop);
    this.register("action/openBank", openBank);
    this.register("action/showNotification", showNotification);
    this.register("action/sendChat", sendChat);

    // Dialogue / quest actions
    this.register("action/startDialogueTree", startDialogueTree);
    this.register("action/progressQuest", progressQuest);
    this.register("action/completeQuest", completeQuest);

    // Prayer actions
    this.register("action/activatePrayer", activatePrayer);
    this.register("action/deactivatePrayer", deactivatePrayer);

    // Audio / VFX actions
    this.register("action/playMusic", playMusic);
    this.register("action/stopMusic", stopMusic);
    this.register("action/spawnParticle", spawnParticle);

    // Variable actions
    this.register("action/incrementVariable", incrementVariable);

    // Property / state actions
    this.register("action/getEntityProperty", getEntityProperty);

    // Animation / movement actions
    this.register("action/playAnimation", playAnimation);
    this.register("action/setMovementSpeed", setMovementSpeed);
    this.register("action/lockMovement", lockMovement);
    this.register("action/unlockMovement", unlockMovement);

    // Buff actions
    this.register("action/applyBuff", applyBuff);
    this.register("action/removeBuff", removeBuff);

    // Entity configuration actions
    this.register("action/setAggroRange", setAggroRange);
    this.register("action/setRespawnTime", setRespawnTime);
    this.register("action/setDialogueOverride", setDialogueOverride);

    // Item actions (player-targeted)
    this.register("action/dropItem", dropItem);

    // Area-of-effect actions
    this.register("action/despawnAllInRadius", despawnAllInRadius);

    // Utility / debug actions
    this.register("action/log", log);
    this.register("action/emitCustomEvent", emitCustomEvent);
    this.register("action/debugDraw", debugDraw);
    this.register("action/breakpoint", breakpoint);

    // Flow control nodes
    this.register("action/wait", wait);
  }

  /** Register a custom action handler. */
  register(nodeType: string, handler: ActionHandler): void {
    this.handlers.set(nodeType, handler);
  }

  /** Get handler for a node type. */
  getHandler(nodeType: string): ActionHandler | undefined {
    return this.handlers.get(nodeType);
  }

  /** Get all registered action types. */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
