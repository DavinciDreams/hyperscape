import { useEffect, type MutableRefObject } from "react";
import { Entity, THREE } from "@hyperscape/shared";
import type { ClientWorld } from "../../types";

export interface EntityPip {
  id: string;
  type: "player" | "enemy" | "building" | "item" | "resource" | "quest";
  position: THREE.Vector3;
  color: string;
  isActive?: boolean;
  icon?: "star" | "circle" | "diamond";
  groupIndex?: number;
  isLocalPlayer?: boolean;
  subType?: string;
}

interface MinimapEntityConfig {
  services?: string[];
  questIds?: string[];
  resourceType?: string;
  harvestSkill?: string;
}

type HyperscapeWindow = Window &
  typeof globalThis & {
    __HYPERSCAPE_CONFIG__?: { mode?: string; followEntity?: string };
  };

interface SpectatorTarget {
  id?: string;
  position: { x: number; z: number };
}

function getSpectatorTarget(world: ClientWorld): SpectatorTarget | null {
  if (
    (window as HyperscapeWindow).__HYPERSCAPE_CONFIG__?.mode !== "spectator"
  ) {
    return null;
  }

  const cameraSystem = world.getSystem("client-camera-system") as {
    getCameraInfo?: () => {
      target?: {
        id?: string;
        node?: { position?: THREE.Vector3 };
        position?: { x: number; z: number };
      };
    };
  } | null;
  const info = cameraSystem?.getCameraInfo?.();
  if (!info?.target) return null;

  const position = info.target.node?.position ?? info.target.position;
  if (!position) return null;

  return { id: info.target.id, position: { x: position.x, z: position.z } };
}

interface UseMinimapEntityPipsOptions {
  world: ClientWorld;
  isVisible: boolean;
  extentRef: MutableRefObject<number>;
  questStatusesRef: MutableRefObject<Map<string, string>>;
  entityPipsRefForRender: MutableRefObject<EntityPip[]>;
  entityCacheRef: MutableRefObject<Map<string, EntityPip>>;
}

export function useMinimapEntityPips({
  world,
  isVisible,
  extentRef,
  questStatusesRef,
  entityPipsRefForRender,
  entityCacheRef,
}: UseMinimapEntityPipsOptions): void {
  useEffect(() => {
    if (!world.entities || !isVisible) return;

    let intervalId: number | null = null;
    const workingPips: EntityPip[] = [];
    const seenIds = new Set<string>();

    const update = () => {
      workingPips.length = 0;
      seenIds.clear();

      const player = world.entities?.player as Entity | undefined;
      let playerPipId: string | null = null;
      const buildCullExtent = extentRef.current * 1.5;
      let buildOriginX = 0;
      let buildOriginZ = 0;
      let hasBuildOrigin = false;

      if (player?.node?.position) {
        let playerPip = entityCacheRef.current.get("local-player");
        if (!playerPip) {
          playerPip = {
            id: "local-player",
            type: "player",
            position: player.node.position,
            color: "#ffffff",
            isLocalPlayer: true,
          };
          entityCacheRef.current.set("local-player", playerPip);
        } else {
          playerPip.position = player.node.position;
          playerPip.color = "#ffffff";
          playerPip.isLocalPlayer = true;
        }
        workingPips.push(playerPip);
        seenIds.add("local-player");
        playerPipId = player.id;
        buildOriginX = player.node.position.x;
        buildOriginZ = player.node.position.z;
        hasBuildOrigin = true;
      } else {
        const spectatorTarget = getSpectatorTarget(world);
        if (spectatorTarget) {
          let spectatedPip = entityCacheRef.current.get("spectated-player");
          if (!spectatedPip) {
            spectatedPip = {
              id: "spectated-player",
              type: "player",
              position: new THREE.Vector3(
                spectatorTarget.position.x,
                0,
                spectatorTarget.position.z,
              ),
              color: "#ffffff",
              isLocalPlayer: true,
            };
            entityCacheRef.current.set("spectated-player", spectatedPip);
          } else {
            spectatedPip.position.set(
              spectatorTarget.position.x,
              0,
              spectatorTarget.position.z,
            );
            spectatedPip.color = "#ffffff";
            spectatedPip.isLocalPlayer = true;
          }
          workingPips.push(spectatedPip);
          seenIds.add("spectated-player");
          playerPipId = spectatorTarget.id ?? null;
          buildOriginX = spectatorTarget.position.x;
          buildOriginZ = spectatorTarget.position.z;
          hasBuildOrigin = true;
        }
      }

      const players = world.entities?.getAllPlayers() ?? [];
      for (let index = 0; index < players.length; index += 1) {
        const otherPlayer = players[index];
        if (
          (player && otherPlayer.id === player.id) ||
          (playerPipId && otherPlayer.id === playerPipId)
        ) {
          continue;
        }

        const otherEntity = world.entities?.get(otherPlayer.id);
        if (!otherEntity?.node?.position) continue;

        let playerPip = entityCacheRef.current.get(otherPlayer.id);
        if (playerPip) {
          playerPip.position.set(
            otherEntity.node.position.x,
            0,
            otherEntity.node.position.z,
          );
          playerPip.color = "#ffffff";
        } else {
          playerPip = {
            id: otherPlayer.id,
            type: "player",
            position: new THREE.Vector3(
              otherEntity.node.position.x,
              0,
              otherEntity.node.position.z,
            ),
            color: "#ffffff",
          };
          entityCacheRef.current.set(otherPlayer.id, playerPip);
        }
        workingPips.push(playerPip);
        seenIds.add(otherPlayer.id);
      }

      const allEntities = world.entities?.getAll() ?? [];
      for (let index = 0; index < allEntities.length; index += 1) {
        const entity = allEntities[index];
        const position = entity?.position;
        if (!position) continue;

        if (
          hasBuildOrigin &&
          (Math.abs(position.x - buildOriginX) > buildCullExtent ||
            Math.abs(position.z - buildOriginZ) > buildCullExtent)
        ) {
          continue;
        }

        let color = "#ffffff";
        let type: EntityPip["type"] = "item";
        let subType: string | undefined;

        switch (entity.type) {
          case "player":
            continue;
          case "mob":
          case "enemy":
            color = "#ffff00";
            type = "enemy";
            break;
          case "npc": {
            color = "#ffff00";
            type = "enemy";
            const npcConfig = (
              entity as unknown as { config?: MinimapEntityConfig }
            ).config;
            const serviceTypes = npcConfig?.services;
            if (serviceTypes?.includes("bank")) {
              subType = "bank";
            } else if (serviceTypes?.includes("shop")) {
              subType = "shop";
            }
            if (serviceTypes?.includes("quest")) {
              const questIds = npcConfig?.questIds;
              const statuses = questStatusesRef.current;
              if (questIds && questIds.length > 0 && statuses.size > 0) {
                let hasAvailable = false;
                let hasActive = false;
                let allCompleted = true;
                for (const questId of questIds) {
                  const state = statuses.get(questId);
                  if (state === "available") hasAvailable = true;
                  else if (state === "active") hasActive = true;
                  if (state !== "completed") allCompleted = false;
                }
                if (hasAvailable) subType = "quest_available";
                else if (hasActive) subType = "quest_in_progress";
                else if (!allCompleted) subType = "quest_available";
              } else {
                subType = "quest_available";
              }
            }
            break;
          }
          case "bank":
          case "furnace":
          case "anvil":
          case "range":
          case "altar":
          case "runecrafting_altar":
            color = "#ffff00";
            type = "building";
            subType = entity.type;
            break;
          case "building":
          case "structure":
            color = "#ffff00";
            type = "building";
            break;
          case "item":
          case "loot":
            color = "#ff0000";
            type = "item";
            break;
          case "resource": {
            color = "#ffff00";
            type = "resource";
            const resourceConfig = (
              entity as unknown as { config?: MinimapEntityConfig }
            ).config;
            if (
              resourceConfig?.resourceType === "fishing_spot" ||
              resourceConfig?.harvestSkill === "fishing"
            ) {
              subType = "fishing";
            } else if (
              resourceConfig?.resourceType === "mining_rock" ||
              resourceConfig?.harvestSkill === "mining"
            ) {
              subType = "mining";
            } else if (
              resourceConfig?.resourceType === "tree" ||
              resourceConfig?.harvestSkill === "woodcutting"
            ) {
              subType = "tree";
            }
            break;
          }
          default:
            color = "#cccccc";
            type = "item";
        }

        let entityPip = entityCacheRef.current.get(entity.id);
        if (entityPip) {
          entityPip.position.set(position.x, 0, position.z);
          entityPip.type = type;
          entityPip.color = color;
          entityPip.subType = subType;
        } else {
          entityPip = {
            id: entity.id,
            type,
            position: new THREE.Vector3(position.x, 0, position.z),
            color,
            subType,
          };
          entityCacheRef.current.set(entity.id, entityPip);
        }
        workingPips.push(entityPip);
        seenIds.add(entity.id);
      }

      for (const id of entityCacheRef.current.keys()) {
        if (!seenIds.has(id)) {
          entityCacheRef.current.delete(id);
        }
      }

      entityPipsRefForRender.current = workingPips;
    };

    update();
    intervalId = window.setInterval(update, 200);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [
    entityCacheRef,
    entityPipsRefForRender,
    extentRef,
    isVisible,
    questStatusesRef,
    world,
  ]);
}
