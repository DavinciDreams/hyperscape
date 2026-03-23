/**
 * usePlayerData Hook
 *
 * Shared hook for subscribing to player data events (inventory, equipment, stats).
 * Used by both InterfaceManager and MobileInterfaceManager to eliminate duplication.
 *
 * @packageDocumentation
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { EventType } from "@hyperscape/shared";
import type { PlayerStats } from "@hyperscape/shared";
import type { ClientWorld, PlayerEquipmentItems } from "../types";
import type { RawEquipmentData, InventorySlotViewItem } from "../game/types";
import { processRawEquipment } from "../utils/equipment";
import {
  isInventoryUpdateEvent,
  isCoinUpdateWithPlayerEvent,
  isUIUpdateEvent,
  isPlayerStatsData,
  isSkillsUpdateEvent,
  isPrayerStateSyncEvent,
  isPrayerPointsChangedEvent,
  isObject,
} from "../types/guards";

function areInventoryItemsEqual(
  left: InventorySlotViewItem[],
  right: InventorySlotViewItem[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.slot !== b.slot ||
      a.itemId !== b.itemId ||
      a.quantity !== b.quantity
    ) {
      return false;
    }
  }

  return true;
}

function areEquipmentItemsEqual(
  left: PlayerEquipmentItems | null,
  right: PlayerEquipmentItems | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;

  const slots = Object.keys(left) as Array<keyof PlayerEquipmentItems>;
  for (const slot of slots) {
    const leftItem = left[slot];
    const rightItem = right[slot];
    if (!leftItem || !rightItem) {
      if (leftItem !== rightItem) return false;
      continue;
    }

    if (
      leftItem.id !== rightItem.id ||
      leftItem.quantity !== rightItem.quantity ||
      leftItem.name !== rightItem.name
    ) {
      return false;
    }
  }

  return true;
}

function areStatusValuesEqual(
  left?: { current?: number; max?: number },
  right?: { current?: number; max?: number },
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return left.current === right.current && left.max === right.max;
}

function areSkillsEqual(
  left: PlayerStats["skills"],
  right: PlayerStats["skills"],
): boolean {
  if (left === right) return true;

  const skillNames = Object.keys(left) as Array<keyof PlayerStats["skills"]>;
  for (const skillName of skillNames) {
    const leftSkill = left[skillName];
    const rightSkill = right[skillName];
    if (
      !rightSkill ||
      leftSkill.level !== rightSkill.level ||
      leftSkill.xp !== rightSkill.xp
    ) {
      return false;
    }
  }

  return true;
}

function mergePlayerStats(
  previous: PlayerStats | null,
  updates: Partial<PlayerStats>,
): PlayerStats {
  if (!previous) {
    return updates as PlayerStats;
  }

  const next = { ...previous, ...updates } as PlayerStats;
  if (updates.health) {
    next.health = updates.health;
  }
  if (updates.skills) {
    next.skills = updates.skills;
  }
  if (updates.prayerPoints) {
    next.prayerPoints = updates.prayerPoints;
  }

  return next;
}

function arePlayerStatsEqual(
  left: PlayerStats | null,
  right: PlayerStats | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;

  return (
    left.level === right.level &&
    left.combatLevel === right.combatLevel &&
    left.inCombat === right.inCombat &&
    areStatusValuesEqual(left.health, right.health) &&
    areStatusValuesEqual(left.prayerPoints, right.prayerPoints) &&
    areSkillsEqual(left.skills, right.skills) &&
    areEquipmentItemsEqual(left.equipment, right.equipment)
  );
}

/**
 * Hook return type for player data
 */
export interface PlayerDataState {
  /** Inventory items */
  inventory: InventorySlotViewItem[];
  /** Player equipment */
  equipment: PlayerEquipmentItems | null;
  /** Player stats (health, prayer, skills) */
  playerStats: PlayerStats | null;
  /** Coin count */
  coins: number;
  /** Setter for inventory */
  setInventory: React.Dispatch<React.SetStateAction<InventorySlotViewItem[]>>;
  /** Setter for equipment */
  setEquipment: React.Dispatch<
    React.SetStateAction<PlayerEquipmentItems | null>
  >;
  /** Setter for player stats */
  setPlayerStats: React.Dispatch<React.SetStateAction<PlayerStats | null>>;
  /** Setter for coins */
  setCoins: React.Dispatch<React.SetStateAction<number>>;
}

interface PlayerDataProviderProps {
  world: ClientWorld | null;
  children: React.ReactNode;
}

const PlayerDataContext = createContext<PlayerDataState | null>(null);

/**
 * usePlayerData - Subscribe to player data events
 *
 * Handles:
 * - Inventory updates (INVENTORY_UPDATED)
 * - Equipment updates (UI_EQUIPMENT_UPDATE)
 * - Stats updates (UI_UPDATE, STATS_UPDATE)
 * - Skills updates (SKILLS_UPDATED)
 * - Prayer updates (PRAYER_STATE_SYNC, PRAYER_POINTS_CHANGED)
 * - Initial data loading from network cache
 *
 * @param world - The game world instance
 * @returns Player data state and setters
 */
export function usePlayerDataState(world: ClientWorld | null): PlayerDataState {
  const [inventory, setInventory] = useState<InventorySlotViewItem[]>([]);
  const [equipment, setEquipment] = useState<PlayerEquipmentItems | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [coins, setCoins] = useState(0);

  // Extract playerId to add to dependency array - prevents stale closures
  const playerId = world?.entities?.player?.id;

  useEffect(() => {
    if (!world) return;

    // Inventory updates - with type guard validation
    const handleInventory = (data: unknown) => {
      if (!isInventoryUpdateEvent(data)) {
        console.warn("[usePlayerData] Invalid inventory update event:", data);
        return;
      }
      const invData = data as {
        playerId: string;
        items: InventorySlotViewItem[];
        coins: number;
      };
      // Only update if this inventory belongs to the local player (prevents cross-tab updates)
      if (playerId && invData.playerId && invData.playerId !== playerId) {
        return;
      }
      setInventory((prev) =>
        areInventoryItemsEqual(prev, invData.items || [])
          ? prev
          : invData.items || [],
      );
      if (typeof invData.coins === "number") {
        setCoins((prev) => (prev === invData.coins ? prev : invData.coins));
      } else {
        // Calculate coins from inventory items
        const totalCoins = (data.items || [])
          .filter((item) => item.itemId === "coins")
          .reduce((sum, item) => sum + item.quantity, 0);
        setCoins((prev) => (prev === totalCoins ? prev : totalCoins));
      }
    };

    // Coin updates - with type guard validation
    const handleCoins = (data: unknown) => {
      if (!isCoinUpdateWithPlayerEvent(data)) {
        console.warn("[usePlayerData] Invalid coin update event:", data);
        return;
      }
      if (!playerId || data.playerId === playerId) {
        setCoins((prev) => (prev === data.coins ? prev : data.coins));
      }
    };

    // Equipment updates - with object validation
    const handleEquipment = (data: unknown) => {
      if (!isObject(data)) {
        console.warn("[usePlayerData] Invalid equipment update event:", data);
        return;
      }
      const nextEquipment = processRawEquipment(data as RawEquipmentData);
      setEquipment((prev) =>
        areEquipmentItemsEqual(prev, nextEquipment) ? prev : nextEquipment,
      );
    };

    // UI_UPDATE is the primary source for player stats
    // Merge with existing state to preserve prayer data
    const handleUIUpdate = (data: unknown) => {
      if (!isUIUpdateEvent(data)) {
        console.warn("[usePlayerData] Invalid UI update event:", data);
        return;
      }
      if (data.component === "player" && isPlayerStatsData(data.data)) {
        // PlayerStatsData is a partial type - safe to cast since we merge with existing state
        const newData = data.data as unknown as Partial<PlayerStats>;
        setPlayerStats((prev) => {
          const merged = prev
            ? mergePlayerStats(prev, {
                ...newData,
                prayerPoints: newData.prayerPoints || prev.prayerPoints,
              })
            : (newData as PlayerStats);
          return arePlayerStatsEqual(prev, merged) ? prev : merged;
        });
      }
    };

    // Stats updates (fallback/alternative event)
    const handleStats = (data: unknown) => {
      if (!isPlayerStatsData(data)) {
        console.warn("[usePlayerData] Invalid stats update event:", data);
        return;
      }
      // PlayerStatsData is a partial type - safe to cast since we merge with existing state
      const newData = data as unknown as Partial<PlayerStats>;
      setPlayerStats((prev) => {
        const merged = prev
          ? mergePlayerStats(prev, {
              ...newData,
              prayerPoints: newData.prayerPoints || prev.prayerPoints,
            })
          : (newData as PlayerStats);
        return arePlayerStatsEqual(prev, merged) ? prev : merged;
      });
    };

    // Skills updates - with type guard validation
    const handleSkillsUpdate = (data: unknown) => {
      if (!isSkillsUpdateEvent(data)) {
        console.warn("[usePlayerData] Invalid skills update event:", data);
        return;
      }
      if (!playerId || data.playerId === playerId) {
        // Skills event only has skills data - merge with existing state
        const updatedSkills = data.skills as unknown as PlayerStats["skills"];
        setPlayerStats((prev) => {
          const merged = prev
            ? mergePlayerStats(prev, { skills: updatedSkills })
            : ({ skills: updatedSkills } as unknown as PlayerStats);
          return arePlayerStatsEqual(prev, merged) ? prev : merged;
        });
      }
    };

    // Prayer state sync - with type guard validation
    const handlePrayerStateSync = (data: unknown) => {
      if (!isPrayerStateSyncEvent(data)) {
        console.warn("[usePlayerData] Invalid prayer state sync event:", data);
        return;
      }
      if (!playerId || data.playerId === playerId) {
        setPlayerStats((prev) => {
          const merged = prev
            ? mergePlayerStats(prev, {
                prayerPoints: {
                  current: data.points,
                  max: data.maxPoints,
                },
              })
            : ({
                prayerPoints: {
                  current: data.points,
                  max: data.maxPoints,
                },
              } as PlayerStats);
          return arePlayerStatsEqual(prev, merged) ? prev : merged;
        });
      }
    };

    // Prayer points changed - with type guard validation
    const handlePrayerPointsChanged = (data: unknown) => {
      if (!isPrayerPointsChangedEvent(data)) {
        console.warn(
          "[usePlayerData] Invalid prayer points changed event:",
          data,
        );
        return;
      }
      if (!playerId || data.playerId === playerId) {
        setPlayerStats((prev) => {
          const merged = prev
            ? mergePlayerStats(prev, {
                prayerPoints: {
                  current: data.points,
                  max: data.maxPoints,
                },
              })
            : ({
                prayerPoints: {
                  current: data.points,
                  max: data.maxPoints,
                },
              } as PlayerStats);
          return arePlayerStatsEqual(prev, merged) ? prev : merged;
        });
      }
    };

    // Register event listeners
    world.on(EventType.UI_UPDATE, handleUIUpdate, undefined);
    world.on(EventType.INVENTORY_UPDATED, handleInventory, undefined);
    world.on(EventType.INVENTORY_UPDATE_COINS, handleCoins, undefined);
    world.on(EventType.UI_EQUIPMENT_UPDATE, handleEquipment, undefined);
    world.on(EventType.STATS_UPDATE, handleStats, undefined);
    world.on(EventType.SKILLS_UPDATED, handleSkillsUpdate, undefined);
    world.on(EventType.PRAYER_STATE_SYNC, handlePrayerStateSync, undefined);
    world.on(
      EventType.PRAYER_POINTS_CHANGED,
      handlePrayerPointsChanged,
      undefined,
    );

    // Request initial data from cache - uses extracted playerId from deps
    const requestInitial = () => {
      if (!playerId) return false;

      // Get cached inventory
      const cachedInv = world.network?.lastInventoryByPlayerId?.[playerId];
      if (cachedInv && Array.isArray(cachedInv.items)) {
        const cachedItems = cachedInv.items as InventorySlotViewItem[];
        setInventory((prev) =>
          areInventoryItemsEqual(prev, cachedItems) ? prev : cachedItems,
        );
        setCoins((prev) =>
          prev === (cachedInv.coins || 0) ? prev : cachedInv.coins || 0,
        );
      }

      // Get cached skills
      // Note: lastSkillsByPlayerId is typed as Record<string, { level: number; xp: number }>
      // but at runtime contains Skills data. The intermediate unknown is required because
      // TypeScript sees them as incompatible even though they're structurally similar.
      const cachedSkills = world.network?.lastSkillsByPlayerId?.[playerId];
      if (cachedSkills) {
        // Runtime: cachedSkills has skill-specific keys (attack, strength, etc.)
        const skills = cachedSkills as unknown as PlayerStats["skills"];
        setPlayerStats((prev) => {
          const merged = prev
            ? mergePlayerStats(prev, { skills })
            : ({ skills } as PlayerStats);
          return arePlayerStatsEqual(prev, merged) ? prev : merged;
        });
      }

      // Get cached equipment
      const cachedEquipment =
        world.network?.lastEquipmentByPlayerId?.[playerId];
      if (cachedEquipment) {
        const nextEquipment = processRawEquipment(
          cachedEquipment as RawEquipmentData,
        );
        setEquipment((prev) =>
          areEquipmentItemsEqual(prev, nextEquipment) ? prev : nextEquipment,
        );
      }

      // Get cached prayer state
      const cachedPrayer = world.network?.lastPrayerStateByPlayerId?.[playerId];
      if (cachedPrayer) {
        setPlayerStats((prev) => {
          const merged = prev
            ? mergePlayerStats(prev, {
                prayerPoints: {
                  current: cachedPrayer.points,
                  max: cachedPrayer.maxPoints,
                },
              })
            : ({
                prayerPoints: {
                  current: cachedPrayer.points,
                  max: cachedPrayer.maxPoints,
                },
              } as PlayerStats);
          return arePlayerStatsEqual(prev, merged) ? prev : merged;
        });
      }

      // Get player entity for health/prayer
      // Entity has health/data properties at runtime that aren't fully exposed in the base type.
      // The intermediate unknown is required because Entity.maxHealth is protected.
      const playerEntity = world.entities?.player;
      if (playerEntity) {
        interface PlayerEntityData {
          health?: number;
          maxHealth?: number;
          data?: {
            health?: number;
            maxHealth?: number;
            prayerPoints?: number;
            maxPrayerPoints?: number;
          };
        }
        const entityData = playerEntity as unknown as PlayerEntityData;

        const health = entityData.health ?? entityData.data?.health;
        const maxHealth =
          entityData.maxHealth ?? entityData.data?.maxHealth ?? 10;
        const prayerPoints = entityData.data?.prayerPoints ?? 0;
        const maxPrayerPoints = entityData.data?.maxPrayerPoints ?? 1;

        if (typeof health === "number") {
          setPlayerStats((prev) => {
            const merged = mergePlayerStats(prev, {
              health: { current: health, max: maxHealth },
              prayerPoints: { current: prayerPoints, max: maxPrayerPoints },
            });
            return arePlayerStatsEqual(prev, merged) ? prev : merged;
          });
        }
      }

      // Request fresh data from server
      world.emit(EventType.INVENTORY_REQUEST, { playerId });
      return true;
    };

    // Try to get initial data immediately, or retry after a short delay
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (!requestInitial()) {
      timeoutId = setTimeout(() => requestInitial(), 400);
    }

    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      world.off(EventType.UI_UPDATE, handleUIUpdate, undefined, undefined);
      world.off(
        EventType.INVENTORY_UPDATED,
        handleInventory,
        undefined,
        undefined,
      );
      world.off(
        EventType.INVENTORY_UPDATE_COINS,
        handleCoins,
        undefined,
        undefined,
      );
      world.off(
        EventType.UI_EQUIPMENT_UPDATE,
        handleEquipment,
        undefined,
        undefined,
      );
      world.off(EventType.STATS_UPDATE, handleStats, undefined, undefined);
      world.off(
        EventType.SKILLS_UPDATED,
        handleSkillsUpdate,
        undefined,
        undefined,
      );
      world.off(
        EventType.PRAYER_STATE_SYNC,
        handlePrayerStateSync,
        undefined,
        undefined,
      );
      world.off(
        EventType.PRAYER_POINTS_CHANGED,
        handlePrayerPointsChanged,
        undefined,
        undefined,
      );
    };
  }, [world, playerId]);

  return {
    inventory,
    equipment,
    playerStats,
    coins,
    setInventory,
    setEquipment,
    setPlayerStats,
    setCoins,
  };
}

export function PlayerDataProvider({
  world,
  children,
}: PlayerDataProviderProps): React.ReactElement {
  const value = usePlayerDataState(world);
  return React.createElement(PlayerDataContext.Provider, { value }, children);
}

export function usePlayerDataContext(): PlayerDataState {
  const context = useContext(PlayerDataContext);

  if (!context) {
    throw new Error(
      "usePlayerDataContext must be used within PlayerDataProvider",
    );
  }

  return context;
}

export function usePlayerData(world: ClientWorld | null): PlayerDataState {
  return usePlayerDataState(world);
}
