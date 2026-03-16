/**
 * DuelGearManager - Gear selection, scoring, equipping, provisioning, and cleanup
 * for streaming duel agents.
 *
 * Extracted from DuelOrchestrator to isolate all gear-related concerns.
 */

import type { World } from "@hyperscape/shared";
import {
  AttackType,
  COMBAT_SPELLS,
  ELEMENTAL_STAVES,
  EventType,
  ITEMS,
  SPELL_ORDER,
} from "@hyperscape/shared";
import { Logger } from "../../ServerNetwork/services";
import { errMsg } from "../../../shared/errMsg.js";
import { isDuelFoodItemId } from "../../duelFood.js";

// ============================================================================
// Types
// ============================================================================

type DuelFoodProvisionedSlot = {
  slot: number;
  itemId: string;
};

/** Inventory system shape used by the gear manager. */
type InventorySystem = {
  getInventory?: (playerId: string) =>
    | {
        playerId: string;
        items: Array<{ slot: number; itemId: string; quantity: number }>;
        coins: number;
      }
    | undefined;
  addItemDirect?: (
    playerId: string,
    item: { itemId: string; quantity: number; slot?: number },
  ) => Promise<boolean>;
  removeItem?: (data: {
    playerId: string;
    itemId: string;
    quantity: number;
    slot?: number;
  }) => Promise<boolean>;
  isInventoryReady?: (playerId: string) => boolean;
} | null;

/** Equipment system shape used by the gear manager. */
type EquipmentSystem = {
  getPlayerEquipment?: (playerId: string) =>
    | {
        weapon?: {
          itemId?: string | number | null;
          item?: { id?: string | null } | null;
        } | null;
      }
    | undefined;
  canPlayerEquipItem?: (playerId: string, itemId: string | number) => boolean;
  equipItemDirect?: (
    playerId: string,
    itemId: string | number,
  ) => Promise<{
    success: boolean;
    error?: string;
    equippedSlot?: string;
    displacedItems: Array<{ itemId: string; slot: string; quantity: number }>;
  }>;
  unequipItemDirect?: (
    playerId: string,
    slotName: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    itemId?: string;
    quantity: number;
  }>;
} | null;

/** Combat role types for duel arena agents. */
export type DuelCombatRole = "melee" | "ranged" | "mage";

// ============================================================================
// Constants
// ============================================================================

/** Duel-eligible bronze weapons — only types with new models in swords/ directory. */
const DUEL_BRONZE_WEAPON_IDS = [
  "bronze_longsword",
  "bronze_scimitar",
  "bronze_2h_sword",
] as const;

/** Weapon types eligible for duel arenas (must have models in swords/ directory). */
const DUEL_WEAPON_TYPES = new Set(["LONGSWORD", "SCIMITAR", "TWO_HAND_SWORD"]);

/** Fallback gear when skill-based selection fails or entity is missing. */
const MELEE_FALLBACK_WEAPON = "bronze_shortsword";
const RANGED_FALLBACK_BOW = "shortbow";
const RANGED_FALLBACK_ARROW = "bronze_arrow";
const MAGE_FALLBACK_STAFF = "staff_of_air";
const MAGE_FALLBACK_SPELL = "wind_strike";
const RUNE_PROVISION_QTY = 500;

// ============================================================================
// DuelGearManager Class
// ============================================================================

export class DuelGearManager {
  private combatRolesByAgent: Map<string, DuelCombatRole> = new Map();
  private duelFoodSlotsByAgent: Map<string, DuelFoodProvisionedSlot[]> =
    new Map();

  constructor(private readonly world: World) {}

  // ============================================================================
  // Public accessors
  // ============================================================================

  /** Get the duel food slots tracked by this manager for a given agent. */
  getDuelFoodSlotsByAgent(): Map<string, DuelFoodProvisionedSlot[]> {
    return this.duelFoodSlotsByAgent;
  }

  /** Get the combat role assigned to an agent. */
  getCombatRole(characterId: string): DuelCombatRole | undefined {
    return this.combatRolesByAgent.get(characterId);
  }

  /** Set the combat role for an agent. */
  setCombatRole(characterId: string, role: DuelCombatRole): void {
    this.combatRolesByAgent.set(characterId, role);
  }

  /** Delete the combat role for an agent. */
  deleteCombatRole(characterId: string): void {
    this.combatRolesByAgent.delete(characterId);
  }

  // ============================================================================
  // Skill Levels & Role Selection
  // ============================================================================

  /** Get flat skill level map for an agent. Returns `{}` if entity/skills missing. */
  getAgentSkillLevels(characterId: string): Record<string, number> {
    const entity = this.world.entities.get(characterId);
    if (!entity?.data) return {};
    const skills = (
      entity.data as { skills?: Record<string, { level: number }> }
    ).skills;
    if (!skills) return {};
    const result: Record<string, number> = {};
    for (const [name, data] of Object.entries(skills)) {
      result[name] = data?.level ?? 1;
    }
    return result;
  }

  /** Pick combat role based on agent's actual skill levels. */
  pickCombatRoleBySkills(characterId: string): DuelCombatRole {
    const skills = this.getAgentSkillLevels(characterId);
    // Melee sums two skills; ranged/magic are single skills scaled ×2 to normalize.
    const meleeScore = (skills.attack ?? 1) + (skills.strength ?? 1);
    const rangedScore = (skills.ranged ?? 1) * 2;
    const mageScore = (skills.magic ?? 1) * 2;

    // Ties break: melee > ranged > mage
    if (meleeScore >= rangedScore && meleeScore >= mageScore) return "melee";
    if (rangedScore >= mageScore) return "ranged";
    return "mage";
  }

  // --------------------------------------------------------------------------
  // Weapon scoring helpers
  // --------------------------------------------------------------------------

  /** Score a melee weapon by its offensive bonuses. */
  private scoreMeleeWeapon(itemId: string): number {
    const item = ITEMS.get(itemId);
    if (!item) return -1;
    const b = item.bonuses;
    return (
      (b?.attack ?? 0) +
      (b?.attackStab ?? 0) +
      (b?.attackSlash ?? 0) +
      (b?.attackCrush ?? 0) +
      (b?.strength ?? 0) +
      (b?.meleeStrength ?? 0)
    );
  }

  /** Score a ranged bow by its offensive bonuses. */
  private scoreRangedBow(itemId: string): number {
    const item = ITEMS.get(itemId);
    if (!item) return -1;
    const b = item.bonuses;
    return (b?.attackRanged ?? 0) + (b?.ranged ?? 0);
  }

  /** Score arrows by ranged strength. */
  private scoreArrows(itemId: string): number {
    const item = ITEMS.get(itemId);
    if (!item) return -1;
    const b = item.bonuses;
    return (b?.rangedStrength ?? 0) + (b?.ranged ?? 0);
  }

  /** Score a magic staff by its offensive bonuses. */
  private scoreMageStaff(itemId: string): number {
    const item = ITEMS.get(itemId);
    if (!item) return -1;
    const b = item.bonuses;
    return (b?.attackMagic ?? 0) + (b?.magicDamage ?? 0);
  }

  // --------------------------------------------------------------------------
  // Item type checks
  // --------------------------------------------------------------------------

  /** Get item IDs from the agent's inventory that match a filter. */
  private getInventoryItemIds(
    characterId: string,
    filter: (itemId: string) => boolean,
  ): string[] {
    const inventorySystem = this.getInventorySystem();
    if (!inventorySystem?.getInventory) return [];
    const inv = inventorySystem.getInventory(characterId);
    if (!inv?.items) return [];
    return inv.items
      .map((slot) => slot.itemId)
      .filter((id) => id && filter(id));
  }

  /** Check if an item is a melee weapon. */
  private isMeleeWeapon(itemId: string): boolean {
    const item = ITEMS.get(itemId);
    if (!item || item.type !== "weapon") return false;
    if (item.attackType !== AttackType.MELEE) return false;
    if (item.equipSlot !== "weapon" && item.equipSlot !== "2h") return false;
    return item.equipable !== false;
  }

  /** Check if an item is a ranged bow. */
  private isRangedBow(itemId: string): boolean {
    const item = ITEMS.get(itemId);
    if (!item || item.type !== "weapon") return false;
    if (item.attackType !== AttackType.RANGED) return false;
    const wt = (item.weaponType ?? "").toString().toUpperCase();
    return wt === "BOW" && item.equipable !== false;
  }

  /** Check if an item is a magic staff/wand. */
  private isMageStaff(itemId: string): boolean {
    const item = ITEMS.get(itemId);
    if (!item || item.type !== "weapon") return false;
    if (item.attackType !== AttackType.MAGIC) return false;
    const wt = (item.weaponType ?? "").toString().toUpperCase();
    return (wt === "STAFF" || wt === "WAND") && item.equipable !== false;
  }

  // --------------------------------------------------------------------------
  // Equipped weapon accessor
  // --------------------------------------------------------------------------

  getEquippedWeaponId(playerId: string): string | null {
    const equipmentSystem = this.getEquipmentSystem();
    if (!equipmentSystem?.getPlayerEquipment) {
      return null;
    }

    const equipment = equipmentSystem.getPlayerEquipment(playerId);
    const weaponSlot = equipment?.weapon;
    const rawWeaponId = weaponSlot?.itemId ?? weaponSlot?.item?.id ?? null;
    if (rawWeaponId === null || rawWeaponId === undefined) {
      return null;
    }

    const normalizedWeaponId = String(rawWeaponId).trim();
    return normalizedWeaponId.length > 0 ? normalizedWeaponId : null;
  }

  getBronzeWeaponPool(): string[] {
    const manifestWeapons = Array.from(ITEMS.values())
      .filter((item) => {
        if (item.type !== "weapon") return false;
        if ((item.tier ?? "").toLowerCase() !== "bronze") return false;
        if (item.equipable === false) return false;
        if (item.equipSlot !== "weapon" && item.equipSlot !== "2h")
          return false;
        // Only include weapon types with new models in swords/ directory
        const wt = (item.weaponType ?? "").toUpperCase();
        return DUEL_WEAPON_TYPES.has(wt);
      })
      .map((item) => item.id);

    if (manifestWeapons.length > 0) {
      return manifestWeapons;
    }

    return [...DUEL_BRONZE_WEAPON_IDS];
  }

  // --------------------------------------------------------------------------
  // Best-gear selection helpers
  // --------------------------------------------------------------------------

  /**
   * Pick the best melee weapon considering: manifest weapons the agent qualifies
   * for, their currently equipped weapon, and weapons in their inventory.
   * Returns `{ weaponId, alreadyEquipped }` so the equip step can be skipped.
   */
  private pickBestMeleeWeapon(characterId: string): {
    weaponId: string;
    alreadyEquipped: boolean;
  } {
    const equipmentSystem = this.getEquipmentSystem();

    // --- Best from manifest (what we'd conjure) ---
    let manifestBestId: string | null = null;
    let manifestBestScore = -1;

    for (const item of ITEMS.values()) {
      if (item.type !== "weapon") continue;
      if (item.attackType !== AttackType.MELEE) continue;
      if (item.equipSlot !== "weapon" && item.equipSlot !== "2h") continue;
      if (item.equipable === false) continue;

      if (
        equipmentSystem?.canPlayerEquipItem &&
        !equipmentSystem.canPlayerEquipItem(characterId, item.id)
      ) {
        continue;
      }

      const score = this.scoreMeleeWeapon(item.id);
      if (score > manifestBestScore) {
        manifestBestScore = score;
        manifestBestId = item.id;
      }
    }

    // --- Currently equipped weapon ---
    const equippedId = this.getEquippedWeaponId(characterId);
    const equippedScore =
      equippedId && this.isMeleeWeapon(equippedId)
        ? this.scoreMeleeWeapon(equippedId)
        : -1;

    // --- Best melee weapon in inventory ---
    const invMeleeIds = this.getInventoryItemIds(characterId, (id) =>
      this.isMeleeWeapon(id),
    );
    let invBestId: string | null = null;
    let invBestScore = -1;
    for (const id of invMeleeIds) {
      // Must also pass equip requirements
      if (
        equipmentSystem?.canPlayerEquipItem &&
        !equipmentSystem.canPlayerEquipItem(characterId, id)
      ) {
        continue;
      }
      const score = this.scoreMeleeWeapon(id);
      if (score > invBestScore) {
        invBestScore = score;
        invBestId = id;
      }
    }

    // --- Pick the overall best ---
    // Prefer agent's own gear (equipped > inventory) over conjured manifest weapons
    if (
      equippedScore >= manifestBestScore &&
      equippedScore >= invBestScore &&
      equippedId
    ) {
      Logger.info(
        "StreamingDuelScheduler",
        `Agent ${characterId} keeping equipped melee weapon ${equippedId} (score=${equippedScore})`,
      );
      return { weaponId: equippedId, alreadyEquipped: true };
    }

    if (invBestScore > manifestBestScore && invBestId) {
      Logger.info(
        "StreamingDuelScheduler",
        `Agent ${characterId} equipping inventory melee weapon ${invBestId} (score=${invBestScore} > manifest=${manifestBestScore})`,
      );
      return { weaponId: invBestId, alreadyEquipped: false };
    }

    if (manifestBestId) {
      return { weaponId: manifestBestId, alreadyEquipped: false };
    }

    // Fallback
    const pool = this.getBronzeWeaponPool();
    return {
      weaponId: pool[0] ?? MELEE_FALLBACK_WEAPON,
      alreadyEquipped: false,
    };
  }

  /**
   * Pick the best ranged bow + arrows, considering equipped gear and inventory.
   */
  private pickBestRangedWeapon(characterId: string): {
    bowId: string;
    arrowId: string;
    bowAlreadyEquipped: boolean;
  } {
    const equipmentSystem = this.getEquipmentSystem();
    const skills = this.getAgentSkillLevels(characterId);
    const rangedLevel = skills.ranged ?? 1;

    // --- Best bow from manifest ---
    let manifestBowId: string | null = null;
    let manifestBowScore = -1;
    for (const item of ITEMS.values()) {
      if (item.type !== "weapon") continue;
      if (item.attackType !== AttackType.RANGED) continue;
      const wt = (item.weaponType ?? "").toString().toUpperCase();
      if (wt !== "BOW") continue;
      if (item.equipable === false) continue;

      if (
        equipmentSystem?.canPlayerEquipItem &&
        !equipmentSystem.canPlayerEquipItem(characterId, item.id)
      ) {
        continue;
      }

      const score = this.scoreRangedBow(item.id);
      if (score > manifestBowScore) {
        manifestBowScore = score;
        manifestBowId = item.id;
      }
    }

    // --- Currently equipped bow ---
    const equippedId = this.getEquippedWeaponId(characterId);
    const equippedBowScore =
      equippedId && this.isRangedBow(equippedId)
        ? this.scoreRangedBow(equippedId)
        : -1;

    // --- Best bow in inventory ---
    const invBowIds = this.getInventoryItemIds(characterId, (id) =>
      this.isRangedBow(id),
    );
    let invBowId: string | null = null;
    let invBowScore = -1;
    for (const id of invBowIds) {
      if (
        equipmentSystem?.canPlayerEquipItem &&
        !equipmentSystem.canPlayerEquipItem(characterId, id)
      ) {
        continue;
      }
      const score = this.scoreRangedBow(id);
      if (score > invBowScore) {
        invBowScore = score;
        invBowId = id;
      }
    }

    // Pick best bow
    let finalBowId: string;
    let bowAlreadyEquipped = false;
    if (
      equippedBowScore >= manifestBowScore &&
      equippedBowScore >= invBowScore &&
      equippedId
    ) {
      finalBowId = equippedId;
      bowAlreadyEquipped = true;
      Logger.info(
        "StreamingDuelScheduler",
        `Agent ${characterId} keeping equipped bow ${equippedId} (score=${equippedBowScore})`,
      );
    } else if (invBowScore > manifestBowScore && invBowId) {
      finalBowId = invBowId;
      Logger.info(
        "StreamingDuelScheduler",
        `Agent ${characterId} equipping inventory bow ${invBowId} (score=${invBowScore} > manifest=${manifestBowScore})`,
      );
    } else {
      finalBowId = manifestBowId ?? RANGED_FALLBACK_BOW;
    }

    // --- Best arrows from manifest ---
    let bestArrowId: string | null = null;
    let bestArrowScore = -1;
    for (const item of ITEMS.values()) {
      if (item.type !== "ammunition") continue;
      if (item.equipSlot !== "arrows") continue;
      const reqLevel =
        item.requirements?.skills?.ranged ?? item.requirements?.level ?? 1;
      if (rangedLevel < reqLevel) continue;

      const score = this.scoreArrows(item.id);
      if (score > bestArrowScore) {
        bestArrowScore = score;
        bestArrowId = item.id;
      }
    }

    // Check inventory for arrows too
    const invArrowIds = this.getInventoryItemIds(characterId, (id) => {
      const item = ITEMS.get(id);
      return item?.type === "ammunition" && item?.equipSlot === "arrows";
    });
    for (const id of invArrowIds) {
      const item = ITEMS.get(id);
      const reqLevel =
        item?.requirements?.skills?.ranged ?? item?.requirements?.level ?? 1;
      if (rangedLevel < reqLevel) continue;
      const score = this.scoreArrows(id);
      if (score > bestArrowScore) {
        bestArrowScore = score;
        bestArrowId = id;
      }
    }

    return {
      bowId: finalBowId,
      arrowId: bestArrowId ?? RANGED_FALLBACK_ARROW,
      bowAlreadyEquipped,
    };
  }

  /**
   * Pick the best mage setup, considering equipped staff and inventory.
   */
  private pickBestMageSetup(characterId: string): {
    staffId: string;
    spellId: string;
    runes: Array<{ runeId: string; quantity: number }>;
    staffAlreadyEquipped: boolean;
  } {
    const equipmentSystem = this.getEquipmentSystem();
    const skills = this.getAgentSkillLevels(characterId);
    const magicLevel = skills.magic ?? 1;

    // --- Best spell (highest-level spell the agent qualifies for) ---
    let bestSpellId = MAGE_FALLBACK_SPELL;
    for (const id of SPELL_ORDER) {
      const spell = COMBAT_SPELLS[id];
      if (spell && magicLevel >= spell.level) {
        bestSpellId = id;
      }
    }
    const chosenSpell = COMBAT_SPELLS[bestSpellId];
    const spellElement = chosenSpell?.element ?? "air";

    // --- Best staff from manifest ---
    let manifestStaffId: string | null = null;
    let manifestStaffScore = -1;
    let manifestMatchesElement = false;

    for (const item of ITEMS.values()) {
      if (item.type !== "weapon") continue;
      if (item.attackType !== AttackType.MAGIC) continue;
      const wt = (item.weaponType ?? "").toString().toUpperCase();
      if (wt !== "STAFF" && wt !== "WAND") continue;
      if (item.equipable === false) continue;

      if (
        equipmentSystem?.canPlayerEquipItem &&
        !equipmentSystem.canPlayerEquipItem(characterId, item.id)
      ) {
        continue;
      }

      const score = this.scoreMageStaff(item.id);
      const infiniteRunes = ELEMENTAL_STAVES[item.id] ?? [];
      const matchesElement = infiniteRunes.includes(`${spellElement}_rune`);

      if (
        score > manifestStaffScore ||
        (score === manifestStaffScore &&
          matchesElement &&
          !manifestMatchesElement)
      ) {
        manifestStaffScore = score;
        manifestStaffId = item.id;
        manifestMatchesElement = matchesElement;
      }
    }

    // --- Currently equipped staff ---
    const equippedId = this.getEquippedWeaponId(characterId);
    const equippedStaffScore =
      equippedId && this.isMageStaff(equippedId)
        ? this.scoreMageStaff(equippedId)
        : -1;

    // --- Best staff in inventory ---
    const invStaffIds = this.getInventoryItemIds(characterId, (id) =>
      this.isMageStaff(id),
    );
    let invStaffId: string | null = null;
    let invStaffScore = -1;
    for (const id of invStaffIds) {
      if (
        equipmentSystem?.canPlayerEquipItem &&
        !equipmentSystem.canPlayerEquipItem(characterId, id)
      ) {
        continue;
      }
      const score = this.scoreMageStaff(id);
      if (score > invStaffScore) {
        invStaffScore = score;
        invStaffId = id;
      }
    }

    // Pick best staff
    let staffId: string;
    let staffAlreadyEquipped = false;
    if (
      equippedStaffScore >= manifestStaffScore &&
      equippedStaffScore >= invStaffScore &&
      equippedId
    ) {
      staffId = equippedId;
      staffAlreadyEquipped = true;
      Logger.info(
        "StreamingDuelScheduler",
        `Agent ${characterId} keeping equipped staff ${equippedId} (score=${equippedStaffScore})`,
      );
    } else if (invStaffScore > manifestStaffScore && invStaffId) {
      staffId = invStaffId;
      Logger.info(
        "StreamingDuelScheduler",
        `Agent ${characterId} equipping inventory staff ${invStaffId} (score=${invStaffScore} > manifest=${manifestStaffScore})`,
      );
    } else {
      staffId = manifestStaffId ?? MAGE_FALLBACK_STAFF;
    }

    // --- Runes needed (exclude runes provided by the chosen staff) ---
    const infiniteFromStaff = ELEMENTAL_STAVES[staffId] ?? [];
    const runes: Array<{ runeId: string; quantity: number }> = [];
    if (chosenSpell?.runes) {
      for (const req of chosenSpell.runes) {
        if (!infiniteFromStaff.includes(req.runeId)) {
          runes.push({ runeId: req.runeId, quantity: RUNE_PROVISION_QTY });
        }
      }
    }

    return { staffId, spellId: bestSpellId, runes, staffAlreadyEquipped };
  }

  // --------------------------------------------------------------------------
  // Equipping
  // --------------------------------------------------------------------------

  /** Equip agent based on their assigned combat role with best available gear. */
  async ensureAgentCombatSetup(
    playerId: string,
    role: DuelCombatRole,
  ): Promise<string> {
    switch (role) {
      case "melee": {
        const { weaponId, alreadyEquipped } =
          this.pickBestMeleeWeapon(playerId);
        if (!alreadyEquipped) {
          await this.equipMeleeWeapon(playerId, weaponId);
        }
        return weaponId;
      }
      case "ranged": {
        const { bowId, arrowId, bowAlreadyEquipped } =
          this.pickBestRangedWeapon(playerId);
        await this.equipRangedGear(
          playerId,
          bowId,
          arrowId,
          bowAlreadyEquipped,
        );
        return bowId;
      }
      case "mage": {
        const { staffId, spellId, runes, staffAlreadyEquipped } =
          this.pickBestMageSetup(playerId);
        await this.equipMageGear(
          playerId,
          staffId,
          spellId,
          runes,
          staffAlreadyEquipped,
        );
        return staffId;
      }
    }
  }

  /** Equip a specific melee weapon, falling back to bronze if it fails. */
  private async equipMeleeWeapon(
    playerId: string,
    weaponId: string,
  ): Promise<void> {
    const equipmentSystem = this.getEquipmentSystem();
    if (
      !equipmentSystem?.getPlayerEquipment ||
      !equipmentSystem.equipItemDirect
    ) {
      return;
    }

    // Try the chosen weapon first
    try {
      const equipResult = await equipmentSystem.equipItemDirect(
        playerId,
        weaponId,
      );
      if (equipResult.success) {
        Logger.info(
          "StreamingDuelScheduler",
          `Auto-equipped melee ${weaponId} for ${playerId}`,
        );
        return;
      }
      Logger.warn(
        "StreamingDuelScheduler",
        `Failed to auto-equip ${weaponId} for ${playerId}: ${equipResult.error ?? "unknown error"}`,
      );
    } catch (err) {
      Logger.warn(
        "StreamingDuelScheduler",
        `Error auto-equipping ${weaponId} for ${playerId}: ${errMsg(err)}`,
      );
    }

    // Fallback: try bronze weapons from the pool
    if (weaponId !== MELEE_FALLBACK_WEAPON) {
      const fallbacks = this.getBronzeWeaponPool();
      for (const fallbackId of fallbacks) {
        if (
          equipmentSystem.canPlayerEquipItem &&
          !equipmentSystem.canPlayerEquipItem(playerId, fallbackId)
        ) {
          continue;
        }
        try {
          const result = await equipmentSystem.equipItemDirect(
            playerId,
            fallbackId,
          );
          if (result.success) {
            Logger.info(
              "StreamingDuelScheduler",
              `Fallback-equipped melee ${fallbackId} for ${playerId} (wanted ${weaponId})`,
            );
            return;
          }
        } catch {
          // Try next fallback
        }
      }
    }

    Logger.warn(
      "StreamingDuelScheduler",
      `Cannot auto-equip any melee weapon for ${playerId} (tried ${weaponId} + fallbacks)`,
    );
  }

  /** Equip bow + arrows for ranged agents. */
  private async equipRangedGear(
    playerId: string,
    bowId: string,
    arrowId: string,
    bowAlreadyEquipped = false,
  ): Promise<void> {
    const equipmentSystem = this.getEquipmentSystem();
    if (!equipmentSystem?.equipItemDirect) return;

    // Skip bow equip if agent already has this bow equipped
    let bowEquipped = bowAlreadyEquipped;
    if (!bowAlreadyEquipped) {
      try {
        const bowResult = await equipmentSystem.equipItemDirect(
          playerId,
          bowId,
        );
        if (bowResult.success) {
          bowEquipped = true;
          Logger.info(
            "StreamingDuelScheduler",
            `Equipped ${bowId} for ranged agent ${playerId}`,
          );
        } else {
          Logger.warn(
            "StreamingDuelScheduler",
            `Failed to equip ${bowId} for ${playerId}: ${bowResult.error ?? "unknown"}`,
          );
        }
      } catch (err) {
        Logger.warn(
          "StreamingDuelScheduler",
          `Error equipping ${bowId} for ${playerId}: ${errMsg(err)}`,
        );
      }

      // Fallback bow if chosen one failed
      if (!bowEquipped && bowId !== RANGED_FALLBACK_BOW) {
        try {
          const fallbackResult = await equipmentSystem.equipItemDirect(
            playerId,
            RANGED_FALLBACK_BOW,
          );
          if (fallbackResult.success) {
            Logger.info(
              "StreamingDuelScheduler",
              `Fallback-equipped ${RANGED_FALLBACK_BOW} for ranged agent ${playerId} (wanted ${bowId})`,
            );
          }
        } catch {
          // Best effort
        }
      }
    }

    // Equip arrows (auto-routes to arrows slot via equipSlot="arrows")
    try {
      const arrowResult = await equipmentSystem.equipItemDirect(
        playerId,
        arrowId,
      );
      if (arrowResult.success) {
        // equipItemDirect doesn't set quantity for stackable items.
        // Set quantity on the live equipment reference AND provision via
        // inventory so the combat system sees the full stack.
        const equipment = equipmentSystem.getPlayerEquipment?.(playerId) as
          | Record<
              string,
              { quantity?: number; itemId?: string | number | null }
            >
          | undefined;
        if (equipment?.arrows) {
          equipment.arrows.quantity = RUNE_PROVISION_QTY;
        }

        // Also add arrows to inventory as a backup — some combat paths
        // read arrow count from inventory rather than equipment slot.
        const inventorySystem = this.getInventorySystem();
        if (inventorySystem?.addItemDirect) {
          try {
            await inventorySystem.addItemDirect(playerId, {
              itemId: arrowId,
              quantity: RUNE_PROVISION_QTY,
            });
          } catch {
            // Best effort — equipment slot quantity is the primary source
          }
        }

        Logger.info(
          "StreamingDuelScheduler",
          `Equipped ${arrowId} (qty=${RUNE_PROVISION_QTY}) for ranged agent ${playerId}`,
        );
      } else {
        Logger.warn(
          "StreamingDuelScheduler",
          `Failed to equip ${arrowId} for ${playerId}: ${arrowResult.error ?? "unknown"}`,
        );
      }
    } catch (err) {
      Logger.warn(
        "StreamingDuelScheduler",
        `Error equipping ${arrowId} arrows for ${playerId}: ${errMsg(err)}`,
      );
    }
  }

  /** Equip staff, set autocast spell, and add required runes for mage agents. */
  private async equipMageGear(
    playerId: string,
    staffId: string,
    spellId: string,
    runes: Array<{ runeId: string; quantity: number }>,
    staffAlreadyEquipped = false,
  ): Promise<void> {
    const equipmentSystem = this.getEquipmentSystem();
    if (!equipmentSystem?.equipItemDirect) return;

    // Skip staff equip if agent already has this staff equipped
    if (!staffAlreadyEquipped) {
      let staffEquipped = false;
      try {
        const staffResult = await equipmentSystem.equipItemDirect(
          playerId,
          staffId,
        );
        if (staffResult.success) {
          staffEquipped = true;
          Logger.info(
            "StreamingDuelScheduler",
            `Equipped ${staffId} for mage agent ${playerId}`,
          );
        } else {
          Logger.warn(
            "StreamingDuelScheduler",
            `Failed to equip ${staffId} for ${playerId}: ${staffResult.error ?? "unknown"}`,
          );
        }
      } catch (err) {
        Logger.warn(
          "StreamingDuelScheduler",
          `Error equipping ${staffId} for ${playerId}: ${errMsg(err)}`,
        );
      }

      // Fallback staff if chosen one failed
      if (!staffEquipped && staffId !== MAGE_FALLBACK_STAFF) {
        try {
          const fallbackResult = await equipmentSystem.equipItemDirect(
            playerId,
            MAGE_FALLBACK_STAFF,
          );
          if (fallbackResult.success) {
            Logger.info(
              "StreamingDuelScheduler",
              `Fallback-equipped ${MAGE_FALLBACK_STAFF} for mage agent ${playerId} (wanted ${staffId})`,
            );
            // Recalculate runes for fallback staff (it provides different infinite runes)
            const fallbackInfinite =
              ELEMENTAL_STAVES[MAGE_FALLBACK_STAFF] ?? [];
            const spell = COMBAT_SPELLS[spellId];
            if (spell?.runes) {
              runes = [];
              for (const req of spell.runes) {
                if (!fallbackInfinite.includes(req.runeId)) {
                  runes.push({
                    runeId: req.runeId,
                    quantity: RUNE_PROVISION_QTY,
                  });
                }
              }
            }
          }
        } catch {
          // Best effort
        }
      }
    }

    // (#19) Validate spell element matches staff element after any fallback.
    // If mismatched, find the best spell matching the staff's infinite runes.
    const actualStaffId = staffAlreadyEquipped
      ? staffId
      : (this.getEquippedWeaponId(playerId) ?? staffId);
    const staffInfinite = ELEMENTAL_STAVES[actualStaffId] ?? [];
    const currentSpell = COMBAT_SPELLS[spellId];
    if (currentSpell) {
      const spellElement = currentSpell.element ?? "air";
      const staffProvidesSpellElement = staffInfinite.includes(
        `${spellElement}_rune`,
      );
      if (!staffProvidesSpellElement && staffInfinite.length > 0) {
        // Staff doesn't match spell element — find best spell that matches
        const staffElements = staffInfinite
          .filter((r: string) => r.endsWith("_rune"))
          .map((r: string) => r.replace("_rune", ""));
        const skills = this.getAgentSkillLevels(playerId);
        const magicLevel = skills.magic ?? 1;
        let bestMatchSpellId = spellId; // keep current as fallback
        for (const sid of SPELL_ORDER) {
          const sp = COMBAT_SPELLS[sid];
          if (
            sp &&
            magicLevel >= sp.level &&
            staffElements.includes(sp.element ?? "")
          ) {
            bestMatchSpellId = sid;
          }
        }
        if (bestMatchSpellId !== spellId) {
          spellId = bestMatchSpellId;
          // Recalculate runes for the new spell
          const newSpell = COMBAT_SPELLS[spellId];
          if (newSpell?.runes) {
            runes = [];
            for (const req of newSpell.runes) {
              if (!staffInfinite.includes(req.runeId)) {
                runes.push({
                  runeId: req.runeId,
                  quantity: RUNE_PROVISION_QTY,
                });
              }
            }
          }
          Logger.info(
            "StreamingDuelScheduler",
            `Spell validation: switched ${playerId} to ${spellId} (matches staff ${actualStaffId})`,
          );
        }
      }
    }

    // Set autocast spell.
    // Belt-and-suspenders: set selectedSpell directly on entity data AND via
    // world.getPlayer() (which the CombatSystem reads), then emit the event.
    // The event handler in PlayerSystem early-returns if the agent isn't in its
    // internal players map, so direct assignment ensures the combat system sees
    // the spell regardless.
    const entity = this.world.entities.get(playerId);
    if (entity?.data) {
      (entity.data as { selectedSpell?: string | null }).selectedSpell =
        spellId;
    }
    const playerEntity = (
      this.world as {
        getPlayer?: (id: string) => { data?: Record<string, unknown> } | null;
      }
    ).getPlayer?.(playerId);
    if (playerEntity?.data) {
      playerEntity.data.selectedSpell = spellId;
    }
    this.world.emit(EventType.PLAYER_SET_AUTOCAST, {
      playerId,
      spellId,
    });

    // Add required runes to inventory
    if (runes.length === 0) {
      Logger.info(
        "StreamingDuelScheduler",
        `No runes needed for mage agent ${playerId} (staff covers all spell runes)`,
      );
      return;
    }

    const inventorySystem = this.getInventorySystem();
    if (inventorySystem?.addItemDirect) {
      // CRITICAL: Wait for inventory to finish loading from DB before adding
      // runes. Without this, getOrCreateInventory returns a disposable
      // placeholder (not stored in the Map) and the runes are silently lost.
      if (
        inventorySystem.isInventoryReady &&
        !inventorySystem.isInventoryReady(playerId)
      ) {
        for (let i = 0; i < 20; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (inventorySystem.isInventoryReady(playerId)) break;
        }
      }

      const results: string[] = [];
      try {
        for (const rune of runes) {
          const added = await inventorySystem.addItemDirect(playerId, {
            itemId: rune.runeId,
            quantity: rune.quantity,
          });
          results.push(`${rune.runeId}=${added}`);
        }
        const allOk = results.every((r) => r.endsWith("=true"));
        if (!allOk) {
          Logger.warn(
            "StreamingDuelScheduler",
            `Partial rune add for mage agent ${playerId}: ${results.join(", ")}`,
          );
        } else {
          Logger.info(
            "StreamingDuelScheduler",
            `Added runes for mage agent ${playerId}: ${runes.map((r) => `${r.quantity} ${r.runeId}`).join(", ")}`,
          );
        }
      } catch (err) {
        Logger.warn(
          "StreamingDuelScheduler",
          `Error adding runes for ${playerId}: ${errMsg(err)}`,
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Full combat cleanup after duel: unequip all combat gear, clear autocast,
   * and remove leftover runes. Safe to call regardless of combat role.
   */
  async cleanupAgentCombatSetup(playerId: string): Promise<void> {
    const equipmentSystem = this.getEquipmentSystem();
    if (!equipmentSystem?.unequipItemDirect) return;

    // Unequip weapon slot (melee weapons, one-handed staffs)
    try {
      await equipmentSystem.unequipItemDirect(playerId, "weapon");
    } catch (err) {
      Logger.warn(
        "StreamingDuelScheduler",
        `Failed to unequip weapon for ${playerId}: ${errMsg(err)}`,
      );
    }

    // Unequip arrows slot (ranged ammunition)
    try {
      await equipmentSystem.unequipItemDirect(playerId, "arrows");
    } catch {
      // May not have arrows equipped — safe to ignore
    }

    // Clear autocast spell directly on entity data (mirrors equipMageGear pattern)
    const entity = this.world.entities.get(playerId);
    if (entity?.data) {
      (entity.data as { selectedSpell?: string | null }).selectedSpell = null;
    }
    const playerEntity = (
      this.world as {
        getPlayer?: (id: string) => { data?: Record<string, unknown> } | null;
      }
    ).getPlayer?.(playerId);
    if (playerEntity?.data) {
      playerEntity.data.selectedSpell = null;
    }
    this.world.emit(EventType.PLAYER_SET_AUTOCAST, {
      playerId,
      spellId: null,
    });

    // Remove leftover runes from inventory
    await this.removeLeftoverRunes(playerId);

    // Clear stored combat role
    this.combatRolesByAgent.delete(playerId);
  }

  /** Remove any rune items from agent inventory after duel. */
  private async removeLeftoverRunes(playerId: string): Promise<void> {
    const inventorySystem = this.getInventorySystem();
    if (!inventorySystem?.getInventory || !inventorySystem?.removeItem) return;

    try {
      const inventory = inventorySystem.getInventory(playerId);
      if (!inventory) return;

      let removed = 0;
      for (const item of inventory.items) {
        if (item.itemId.endsWith("_rune")) {
          try {
            await inventorySystem.removeItem({
              playerId,
              itemId: item.itemId,
              quantity: item.quantity,
              slot: item.slot,
            });
            removed++;
          } catch {
            // Continue on individual slot errors
          }
        }
      }

      if (removed > 0) {
        Logger.info(
          "StreamingDuelScheduler",
          `Removed ${removed} rune stack(s) from ${playerId}`,
        );
      }
    } catch (err) {
      Logger.warn(
        "StreamingDuelScheduler",
        `Failed to remove leftover runes for ${playerId}: ${errMsg(err)}`,
      );
    }
  }

  async fillInventoryWithFood(
    playerId: string,
    foodItemId: string,
  ): Promise<DuelFoodProvisionedSlot[]> {
    const inventorySystem = this.getInventorySystem();

    if (!inventorySystem?.getInventory || !inventorySystem?.addItemDirect) {
      Logger.warn("StreamingDuelScheduler", "Inventory system not available");
      return [];
    }

    try {
      // Wait for inventory to be ready
      if (
        inventorySystem.isInventoryReady &&
        !inventorySystem.isInventoryReady(playerId)
      ) {
        for (let i = 0; i < 20; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (inventorySystem.isInventoryReady(playerId)) break;
        }
      }

      const inventory = inventorySystem.getInventory(playerId);
      if (!inventory) {
        Logger.warn(
          "StreamingDuelScheduler",
          `No inventory found for ${playerId}`,
        );
        return [];
      }

      // Get occupied slots
      const occupiedSlots = new Set(inventory.items.map((item) => item.slot));

      // Fill empty slots with food (assume 28 slots max)
      const maxSlots = 28;
      let foodAdded = 0;
      const addedSlots: DuelFoodProvisionedSlot[] = [];

      for (let slot = 0; slot < maxSlots; slot++) {
        if (!occupiedSlots.has(slot)) {
          try {
            await inventorySystem.addItemDirect(playerId, {
              itemId: foodItemId,
              quantity: 1,
              slot,
            });
            foodAdded++;
            addedSlots.push({ slot, itemId: foodItemId });
          } catch (slotErr) {
            // Slot might be invalid, continue
          }
        }
      }

      Logger.info(
        "StreamingDuelScheduler",
        `Filled ${foodAdded} slots with ${foodItemId} for ${playerId}`,
      );
      return addedSlots;
    } catch (err) {
      Logger.warn(
        "StreamingDuelScheduler",
        `Failed to fill inventory: ${errMsg(err)}`,
      );
      return [];
    }
  }

  async removeDuelFood(
    playerId: string,
    duelFoodSlots: DuelFoodProvisionedSlot[],
  ): Promise<void> {
    if (duelFoodSlots.length === 0) {
      return;
    }

    const inventorySystem = this.getInventorySystem();

    if (!inventorySystem?.getInventory || !inventorySystem?.removeItem) {
      return;
    }

    try {
      const inventory = inventorySystem.getInventory(playerId);
      if (!inventory) return;

      const itemsBySlot = new Map(
        inventory.items.map((item) => [item.slot, item] as const),
      );
      const trackedFoodItemIds = new Set(
        duelFoodSlots.map((entry) => entry.itemId),
      );
      let removed = 0;

      for (const entry of duelFoodSlots) {
        const item = itemsBySlot.get(entry.slot);
        if (!item) continue;

        if (!isDuelFoodItemId(item.itemId, entry.itemId)) {
          continue;
        }

        try {
          await inventorySystem.removeItem({
            playerId,
            itemId: item.itemId,
            quantity: item.quantity,
            slot: item.slot,
          });
          removed++;
        } catch (slotErr) {
          // Continue on error
        }
      }

      // Best effort sweep for any leftovers of this cycle's duel-food item(s).
      const refreshedInventory = inventorySystem.getInventory(playerId);
      if (refreshedInventory) {
        for (const item of refreshedInventory.items) {
          let shouldRemove = false;
          for (const duelFoodItemId of trackedFoodItemIds) {
            if (isDuelFoodItemId(item.itemId, duelFoodItemId)) {
              shouldRemove = true;
              break;
            }
          }
          if (!shouldRemove) continue;

          try {
            await inventorySystem.removeItem({
              playerId,
              itemId: item.itemId,
              quantity: item.quantity,
              slot: item.slot,
            });
            removed++;
          } catch (slotErr) {
            // Continue on error
          }
        }
      }

      if (removed > 0) {
        Logger.info(
          "StreamingDuelScheduler",
          `Removed ${removed} food items from ${playerId}`,
        );
      }
    } catch (err) {
      Logger.warn(
        "StreamingDuelScheduler",
        `Failed to remove duel food: ${errMsg(err)}`,
      );
    }
  }

  // ============================================================================
  // System Accessors (private helpers)
  // ============================================================================

  /** Get the inventory system with its expected shape. */
  private getInventorySystem(): InventorySystem {
    return this.world.getSystem("inventory") as InventorySystem;
  }

  /** Get the equipment system with its expected shape. */
  private getEquipmentSystem(): EquipmentSystem {
    return this.world.getSystem("equipment") as EquipmentSystem;
  }

  // ============================================================================
  // Reset
  // ============================================================================

  /** Reset all owned state for destroy cleanup */
  reset(): void {
    this.duelFoodSlotsByAgent.clear();
    this.combatRolesByAgent.clear();
  }
}
