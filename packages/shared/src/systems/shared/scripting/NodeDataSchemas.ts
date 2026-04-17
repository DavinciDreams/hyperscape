/**
 * NodeDataSchemas — Per-node-type data interfaces for type-safe action/condition handling.
 *
 * These replace the generic Record<string, unknown> pattern in ActionExecutor
 * and ConditionEvaluator with strongly-typed interfaces.
 */

// ---------------------------------------------------------------------------
// Action node data schemas
// ---------------------------------------------------------------------------

export interface SpawnMobData {
  mobType: string;
  count?: number;
  level?: number;
  position?: { x: number; y: number; z: number };
}

export interface DespawnEntityData {
  entityId?: string;
}

export interface TeleportPlayerData {
  playerId?: string;
  position: { x: number; y: number; z: number };
}

export interface ShowDialogueData {
  playerId?: string;
  title: string;
  text: string;
  npcId?: string;
}

export interface StartQuestData {
  playerId?: string;
  questId: string;
}

export interface PlaySoundData {
  soundId: string;
  position?: { x: number; y: number; z: number };
  volume?: number;
}

export interface SetVariableData {
  variableName: string;
  value: unknown;
}

export interface GiveItemData {
  playerId?: string;
  itemId: string;
  quantity?: number;
}

export interface StartCombatData {
  attacker?: string;
  target?: string;
}

export interface StopCombatData {
  entity?: string;
}

export interface DealDamageData {
  target?: string;
  damage?: number;
  damageType?: string;
}

export interface HealEntityData {
  entity?: string;
  amount?: number;
  percentage?: number;
}

export interface RemoveItemData {
  player?: string;
  itemId: string;
  quantity?: number;
}

export interface EquipItemData {
  player?: string;
  itemId: string;
}

export interface SpawnItemData {
  itemId: string;
  quantity?: number;
  position?: { x: number; y: number; z: number };
  despawnTime?: number;
}

export interface GiveXPData {
  player?: string;
  skillId: string;
  amount?: number;
}

export interface GiveCoinsData {
  player?: string;
  amount?: number;
}

export interface SpawnNPCData {
  npcId: string;
  name?: string;
  position?: { x: number; y: number; z: number };
}

export interface MoveEntityData {
  entity?: string;
  x?: number;
  y?: number;
  z?: number;
  speed?: number;
}

export interface SetEntityPropertyData {
  entity?: string;
  property: string;
  value: unknown;
}

export interface OpenShopData {
  player?: string;
  storeId: string;
}

export interface OpenBankData {
  player?: string;
}

export interface ShowNotificationData {
  player?: string;
  message: string;
  type?: "info" | "warning" | "error" | "success";
}

export interface SendChatData {
  message: string;
  sender?: string;
  color?: string;
}

export interface StartDialogueTreeData {
  player?: string;
  npc?: string;
  npcId?: string;
  dialogueId?: string;
}

export interface ProgressQuestData {
  player?: string;
  questId: string;
  stageId?: string;
}

export interface CompleteQuestData {
  player?: string;
  questId: string;
}

export interface ActivatePrayerData {
  player?: string;
  prayerId: string;
}

export interface DeactivatePrayerData {
  player?: string;
  prayerId?: string;
}

export interface PlayMusicData {
  trackId: string;
  fadeIn?: number;
}

export interface StopMusicData {
  fadeOut?: number;
}

export interface SpawnParticleData {
  effect: string;
  position?: { x: number; y: number; z: number };
  duration?: number;
}

export interface IncrementVariableData {
  variableName: string;
  amount?: number;
}

// ---------------------------------------------------------------------------
// Condition node data schemas
// ---------------------------------------------------------------------------

export interface HasItemData {
  player?: string;
  itemId: string;
  quantity?: number;
}

export interface QuestStateData {
  questId: string;
  state: string;
}

export interface HealthCheckData {
  threshold: number;
  comparison: "above" | "below" | "equal";
  entityId?: string;
}

export interface CompareNumberData {
  variableA?: string;
  operator: "==" | "!=" | "<" | ">" | "<=" | ">=";
  valueB?: number;
}

export interface SkillLevelData {
  skillId: string;
  minLevel: number;
}

export interface IsInCombatData {
  entityId?: string;
}

export interface IsInZoneData {
  zoneId: string;
}

export interface HasEquippedData {
  itemId: string;
  slot?: string;
}

// ---------------------------------------------------------------------------
// Runtime validation helper
// ---------------------------------------------------------------------------

export interface NodeValidationResult {
  valid: boolean;
  errors: string[];
}

/** Required string fields for each node type */
const REQUIRED_FIELDS: Record<string, string[]> = {
  "action/spawnMob": ["mobType"],
  "action/teleportPlayer": [],
  "action/showDialogue": ["title", "text"],
  "action/startQuest": ["questId"],
  "action/playSound": ["soundId"],
  "action/setVariable": ["variableName"],
  "action/giveItem": ["itemId"],
  "action/removeItem": ["itemId"],
  "action/equipItem": ["itemId"],
  "action/spawnItem": ["itemId"],
  "action/giveXP": ["skillId"],
  "action/openShop": ["storeId"],
  "action/showNotification": ["message"],
  "action/sendChat": ["message"],
  "action/progressQuest": ["questId"],
  "action/completeQuest": ["questId"],
  "action/activatePrayer": ["prayerId"],
  "action/playMusic": ["trackId"],
  "action/spawnParticle": ["effect"],
  "action/spawnNPC": ["npcId"],
  "action/setEntityProperty": ["property"],
  "action/incrementVariable": ["variableName"],
  "condition/questState": ["questId", "state"],
  "condition/skillLevel": ["skillId"],
  "condition/hasItem": ["itemId"],
};

/**
 * Validate a node's data against its schema.
 * Returns errors for missing required fields.
 */
export function validateNodeData(
  nodeType: string,
  data: Record<string, unknown>,
): NodeValidationResult {
  const errors: string[] = [];
  const required = REQUIRED_FIELDS[nodeType];

  if (required) {
    for (const field of required) {
      const val = data[field];
      if (val === undefined || val === null || val === "") {
        errors.push(`Missing required field '${field}'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
