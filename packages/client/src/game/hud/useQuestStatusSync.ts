import { useEffect, type MutableRefObject } from "react";
import { EventType } from "@hyperscape/shared";
import type { ClientWorld } from "../../types";

type ServerQuestStatus =
  | "not_started"
  | "in_progress"
  | "ready_to_complete"
  | "completed";

type ClientQuestState = "available" | "active" | "completed";

function mapQuestStatus(status: ServerQuestStatus): ClientQuestState {
  switch (status) {
    case "not_started":
      return "available";
    case "in_progress":
    case "ready_to_complete":
      return "active";
    case "completed":
      return "completed";
    default:
      return "available";
  }
}

interface UseQuestStatusSyncOptions {
  world: ClientWorld;
  questStatusesRef: MutableRefObject<Map<string, string>>;
  setQuestStatuses: (
    quests: Array<{ id: string; state: ClientQuestState }>,
  ) => void;
}

export function useQuestStatusSync({
  world,
  questStatusesRef,
  setQuestStatuses,
}: UseQuestStatusSyncOptions): void {
  useEffect(() => {
    let fetchTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryInterval: ReturnType<typeof setInterval> | null = null;
    let hasLoadedQuestList = false;

    const fetchQuestList = () => {
      world.network?.send?.("getQuestList", {});
    };

    const scheduleQuestListRefresh = (delayMs = 120) => {
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }
      fetchTimeout = setTimeout(() => {
        fetchTimeout = null;
        fetchQuestList();
      }, delayMs);
    };

    const onQuestList = (data: unknown) => {
      if (typeof data !== "object" || data === null) return;
      const payload = data as {
        quests?: Array<{ id: string; status: ServerQuestStatus }>;
      };
      if (!Array.isArray(payload.quests)) return;

      const map = new Map<string, string>();
      const mapped: Array<{ id: string; state: ClientQuestState }> = [];
      for (const quest of payload.quests) {
        const state = mapQuestStatus(quest.status);
        map.set(quest.id, state);
        mapped.push({ id: quest.id, state });
      }

      hasLoadedQuestList = true;
      if (retryInterval) {
        clearInterval(retryInterval);
        retryInterval = null;
      }
      questStatusesRef.current = map;
      setQuestStatuses(mapped);
    };

    const onQuestEvent = () => {
      scheduleQuestListRefresh();
    };

    world.network?.on("questList", onQuestList);
    world.network?.on("questStarted", onQuestEvent);
    world.network?.on("questProgressed", onQuestEvent);
    world.network?.on("questCompleted", onQuestEvent);
    world.on(EventType.QUEST_STARTED, onQuestEvent);
    world.on(EventType.QUEST_PROGRESSED, onQuestEvent);
    world.on(EventType.QUEST_COMPLETED, onQuestEvent);
    world.on(EventType.PLAYER_SPAWNED, onQuestEvent);

    fetchQuestList();
    retryInterval = setInterval(() => {
      if (!hasLoadedQuestList) {
        fetchQuestList();
      }
    }, 1_000);

    return () => {
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }
      if (retryInterval) {
        clearInterval(retryInterval);
      }
      world.network?.off("questList", onQuestList);
      world.network?.off("questStarted", onQuestEvent);
      world.network?.off("questProgressed", onQuestEvent);
      world.network?.off("questCompleted", onQuestEvent);
      world.off(EventType.QUEST_STARTED, onQuestEvent);
      world.off(EventType.QUEST_PROGRESSED, onQuestEvent);
      world.off(EventType.QUEST_COMPLETED, onQuestEvent);
      world.off(EventType.PLAYER_SPAWNED, onQuestEvent);
    };
  }, [world, questStatusesRef, setQuestStatuses]);
}
