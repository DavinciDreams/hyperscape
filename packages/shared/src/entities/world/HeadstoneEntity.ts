/**
 * HeadstoneEntity - Corpse/Grave Entity (Data Container + Renderer)
 *
 * Represents corpses and gravestones that contain loot items.
 * Created when players or mobs die, holds their dropped items.
 *
 * Loot processing logic lives in GravestoneLootSystem (ECS pattern).
 * This entity is a data container with rendering and interaction gating.
 *
 * @public
 */

import * as THREE from "../../extras/three/three";
import type { World } from "../../core/World";
import type {
  HeadstoneEntityConfig,
  EntityInteractionData,
} from "../../types/entities";
import type { InventoryItem, EntityData } from "../../types/core/core";
import {
  InteractableEntity,
  type InteractableConfig,
} from "../InteractableEntity";
import { EventType } from "../../types/events";
import { canPlayerLoot as checkLootPermission } from "../../systems/shared/loot/LootPermissionService";
import { modelCache } from "../../utils/rendering/ModelCache";

export class HeadstoneEntity extends InteractableEntity {
  protected config: HeadstoneEntityConfig;
  private lootItems: InventoryItem[] = [];

  private get headstoneData() {
    return this.config.headstoneData;
  }

  /** Network-synced item count. Server uses lootItems.length; client gets this via modify(). */
  private lootItemCount: number = 0;
  private lootProtectionUntil: number = 0;
  private protectedFor?: string;
  private despawnScheduled = false;

  constructor(world: World, config: HeadstoneEntityConfig) {
    const interactableConfig: InteractableConfig = {
      ...config,
      interaction: {
        prompt: "Loot",
        description: config.headstoneData.deathMessage || "A corpse",
        range: 2.0,
        cooldown: 0,
        usesRemaining: -1,
        maxUses: -1,
        effect: "loot",
      },
    };

    super(world, interactableConfig);
    this.config = config;
    this.lootItems = [...(config.headstoneData.items || [])];
    this.lootItemCount = this.lootItems.length;

    if (config.headstoneData.playerName) {
      this.name = `${config.headstoneData.playerName}'s Gravestone`;
    }

    this.lootProtectionUntil = config.headstoneData.lootProtectionUntil || 0;
    this.protectedFor = config.headstoneData.protectedFor;
  }

  /**
   * Check if player can loot this gravestone.
   * Used by GravestoneLootSystem for loot processing
   * and by handleInteraction for panel access gating.
   */
  public canPlayerLoot(playerId: string): boolean {
    return checkLootPermission(
      {
        ownerId: this.headstoneData.playerId,
        lootProtectionUntil: this.lootProtectionUntil,
        protectedFor: this.protectedFor,
      },
      playerId,
    );
  }

  /** Get the owner (dead player) ID */
  public getOwnerId(): string {
    return this.headstoneData.playerId;
  }

  /** Get the death zone type for audit logging */
  public getZoneType(): string {
    return this.headstoneData.zoneType || "safe_area";
  }

  // --- Rendering ---

  protected async createMesh(): Promise<void> {
    if (this.world.isServer) return;

    const hd = this.headstoneData;
    const modelPath = "asset://models/misc/headstone/headstone.glb";

    if (this.world.loader) {
      try {
        const { scene } = await modelCache.loadModel(modelPath, this.world);
        this.mesh = scene;
        this.mesh.name = `Corpse_${this.id}`;
        this.mesh.scale.set(1.0, 1.0, 1.0);

        this.mesh.layers.set(1);
        this.mesh.traverse((child) => {
          child.layers.set(1);
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = false;
          }
        });
      } catch (error) {
        console.warn(
          `[HeadstoneEntity] Failed to load headstone model, using placeholder:`,
          error,
        );
        this.createPlaceholderMesh();
      }
    } else {
      this.createPlaceholderMesh();
    }

    if (!this.mesh) return;

    this.mesh.userData = {
      type: "corpse",
      entityId: this.id,
      name: this.config.name,
      interactable: true,
      corpseData: {
        id: this.id,
        playerName: hd.playerName,
        deathMessage: hd.deathMessage,
        itemCount: this.lootItems.length,
      },
    };

    if (this.node) {
      this.node.add(this.mesh);
      this.node.userData.type = "corpse";
      this.node.userData.entityId = this.id;
      this.node.userData.interactable = true;
      this.createNameLabel();
    }
  }

  private createPlaceholderMesh(): void {
    const geometry = new THREE.BoxGeometry(1.5, 0.5, 1.0);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      roughness: 0.9,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Corpse_${this.id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.layers.set(1);
    this.mesh = mesh;
  }

  private createNameLabel(): void {
    if (!this.mesh || this.world.isServer) return;

    if (this.mesh.userData) {
      const playerName = this.headstoneData.playerName;
      this.mesh.userData.showLabel = true;
      this.mesh.userData.labelText = playerName
        ? `${playerName}'s corpse`
        : "Corpse";
    }
  }

  // --- Interaction ---

  public async handleInteraction(data: EntityInteractionData): Promise<void> {
    if (!this.canPlayerLoot(data.playerId)) {
      if (!this.world.isServer && this.world.chat?.add) {
        this.world.chat.add(
          {
            id: `grave_${Date.now()}`,
            from: "",
            body: "This isn't your gravestone.",
            createdAt: new Date().toISOString(),
            timestamp: Date.now(),
          },
          false,
        );
      }
      if (this.world.isServer) {
        this.world.emit(EventType.UI_MESSAGE, {
          playerId: data.playerId,
          message: "This isn't your gravestone.",
          type: "error",
        });
      }
      return;
    }

    // Don't open loot window for empty gravestones
    if (this.lootItemCount === 0) {
      return;
    }

    const lootData = {
      corpseId: this.id,
      playerId: data.playerId,
      lootItems: [...this.lootItems],
      position: this.getPosition(),
    };

    this.world.emit(EventType.CORPSE_CLICK, lootData);

    if (this.world.isServer && this.world.network) {
      const network = this.world.network as unknown as {
        sendTo?: (playerId: string, type: string, data: unknown) => void;
      };
      if (network.sendTo) {
        network.sendTo(data.playerId, "corpseLoot", lootData);
      }
    }
  }

  // --- Data Access (used exclusively by GravestoneLootSystem) ---

  /**
   * Remove an item from the gravestone loot.
   * Access controlled: only GravestoneLootSystem should call this
   * via the LootableEntity interface (loot queue, permissions, rate limiting enforced there).
   */
  public removeItem(itemId: string, quantity: number): boolean {
    const itemIndex = this.lootItems.findIndex(
      (item) => item.itemId === itemId,
    );
    if (itemIndex === -1) {
      return false;
    }

    const item = this.lootItems[itemIndex];

    if (item.quantity > quantity) {
      item.quantity -= quantity;
    } else {
      this.lootItems.splice(itemIndex, 1);
    }

    this.lootItemCount = this.lootItems.length;
    if (this.mesh?.userData?.corpseData) {
      this.mesh.userData.corpseData.itemCount = this.lootItemCount;
    }

    if (this.lootItemCount === 0 && !this.despawnScheduled) {
      this.despawnScheduled = true;
      this.world.emit(EventType.CORPSE_EMPTY, {
        corpseId: this.id,
        playerId: this.headstoneData.playerId,
      });
      // Entity destruction is handled by PlayerDeathSystem.handleCorpseEmpty()
      // which destroys via EntityManager → sends entityRemoved to all clients.
      // No setTimeout here — system-driven cleanup is more reliable.
    }

    this.markNetworkDirty();
    return true;
  }

  /**
   * Restore an item to the gravestone (rollback after failed inventory add).
   * Finds existing stack and increments, or re-inserts at the given index.
   */
  public restoreItem(
    itemId: string,
    quantity: number,
    originalIndex: number,
  ): void {
    const existing = this.lootItems.find((i) => i.itemId === itemId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      const insertAt = Math.min(originalIndex, this.lootItems.length);
      this.lootItems.splice(insertAt, 0, {
        id: `restored_${itemId}_${Date.now()}`,
        itemId,
        quantity,
        slot: insertAt,
        metadata: null,
      });
    }
    this.lootItemCount = this.lootItems.length;
    if (this.mesh?.userData?.corpseData) {
      this.mesh.userData.corpseData.itemCount = this.lootItemCount;
    }
    this.markNetworkDirty();
  }

  public getLootItems(): InventoryItem[] {
    return [...this.lootItems];
  }

  public hasLoot(): boolean {
    return this.lootItemCount > 0;
  }

  /** Atomically consume all remaining items (e.g., for gravestone expiration to ground items). Server-only. */
  public consumeAllItems(): InventoryItem[] {
    if (!this.world.isServer) return [];
    const items = [...this.lootItems];
    this.lootItems.length = 0;
    this.lootItemCount = 0;
    this.markNetworkDirty();
    return items;
  }

  // --- Network ---

  // PERF: Mutates buffer in-place instead of creating new objects.
  // lootItems is included for client sync but only sent when dirty
  // (markNetworkDirty is called after removeItem/restoreItem). Gravestones
  // have few items and rarely change, so bandwidth impact is minimal.
  getNetworkData(): Record<string, unknown> {
    const buf = super.getNetworkData();
    const hd = this.headstoneData;
    buf.lootItemCount = this.lootItemCount;
    buf.lootItems = this.lootItems;
    buf.despawnTime = hd.despawnTime;
    buf.playerId = hd.playerId;
    buf.deathMessage = hd.deathMessage;
    buf.lootProtectionUntil = this.lootProtectionUntil;
    return buf;
  }

  /**
   * Apply network data from server. Syncs lootItems from server state
   * to prevent stale item lists on the client (which caused item duplication
   * when old gravestones showed original items after being looted).
   */
  modify(data: Partial<EntityData>): void {
    super.modify(data);
    const changes = data as Record<string, unknown>;
    if (Array.isArray(changes.lootItems)) {
      // Validate each element has required fields (server→client trust boundary)
      const raw = changes.lootItems as unknown[];
      const validated = raw.filter(
        (item): item is InventoryItem =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as Record<string, unknown>).itemId === "string" &&
          typeof (item as Record<string, unknown>).quantity === "number" &&
          ((item as Record<string, unknown>).quantity as number) > 0,
      );
      this.lootItems = validated.map((item) => ({ ...item }));
      this.lootItemCount = this.lootItems.length;
    } else if (typeof changes.lootItemCount === "number") {
      this.lootItemCount = changes.lootItemCount;
      if (this.lootItemCount === 0) {
        this.lootItems = [];
      }
    }
    if (this.mesh?.userData?.corpseData) {
      this.mesh.userData.corpseData.itemCount = this.lootItemCount;
    }
  }

  serialize(): EntityData {
    const baseData = super.serialize();
    const hd = this.headstoneData;
    return {
      ...baseData,
      headstoneData: {
        playerId: hd.playerId,
        playerName: hd.playerName,
        deathTime: hd.deathTime,
        deathMessage: hd.deathMessage,
        position: hd.position,
        items: this.lootItems,
        itemCount: this.lootItemCount,
        despawnTime: hd.despawnTime,
        lootProtectionUntil: this.lootProtectionUntil,
        protectedFor: this.protectedFor,
      },
      lootItemCount: this.lootItemCount,
      lootProtectionUntil: this.lootProtectionUntil,
    } as unknown as EntityData;
  }

  // --- Lifecycle ---

  protected serverUpdate(deltaTime: number): void {
    super.serverUpdate(deltaTime);
    // Gravestone expiration is handled by SafeAreaDeathHandler.processTick (tick-based).
    // No wall-clock despawn here — tick-based timing is authoritative.
  }

  protected clientUpdate(deltaTime: number): void {
    super.clientUpdate(deltaTime);

    if (this.mesh) {
      const time = this.world.getTime() * 0.001;
      this.mesh.position.y = 0.25 + Math.sin(time * 1) * 0.05;
    }
  }

  public destroy(): void {
    super.destroy();
  }
}
