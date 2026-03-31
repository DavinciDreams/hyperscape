/**
 * useAIGeneration — Connects AI generation UI to backend content generation API
 *
 * Handles dialogue, quest, and voice generation requests via the
 * /api/content/* endpoints and updates WorldStudioContext state.
 */

import { useCallback } from "react";

import { useWorldStudio } from "../WorldStudioContext";

const CONTENT_API = "/api/content";

/**
 * Hook that provides AI content generation functions bound to the WorldStudio context.
 * Wired to the backend ContentGenerationService.
 */
export function useAIGeneration() {
  const { state, actions } = useWorldStudio();

  // Placed NPCs live in WorldBuilder editing layers, not extendedLayers
  const placedNpcs = state.builder.editing.world?.layers.npcs ?? [];
  const placedQuests = state.builder.editing.world?.layers.quests ?? [];

  const generateDialogue = useCallback(
    async (npcId: string) => {
      // Find NPC data for context
      const npc = state.manifests.npcs.find((n) => n.id === npcId);
      const placedNpc = placedNpcs.find((n) => n.npcTypeId === npcId);
      if (!npc && !placedNpc) return;

      actions.startAIGeneration("dialogue", npcId);

      try {
        const res = await fetch(`${CONTENT_API}/generate-dialogue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            npcName: npc?.name ?? placedNpc?.name ?? npcId,
            npcPersonality: npc?.description ?? "",
            context: {
              category: npc?.category ?? "neutral",
              services: npc?.services?.types ?? [],
              levelRange: npc?.levelRange ?? [1, 1],
            },
            existingNodes: [],
            quality: "balanced",
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`API error ${res.status}: ${errorText}`);
        }

        const result = await res.json();
        actions.completeAIGeneration("dialogue", npcId, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        actions.errorAIGeneration("dialogue", npcId, message);
      }
    },
    [state.manifests.npcs, placedNpcs, actions],
  );

  const generateQuest = useCallback(
    async (questId: string) => {
      const quest = state.manifests.quests.find((q) => q.id === questId);
      const placedQuest = placedQuests.find(
        (q) => q.questTemplateId === questId,
      );

      actions.startAIGeneration("quest", questId);

      try {
        const res = await fetch(`${CONTENT_API}/generate-quest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questType: quest?.stages?.[0]?.type ?? "talk",
            difficulty: quest?.difficulty ?? "medium",
            theme: quest?.name ?? placedQuest?.name ?? "adventure",
            context: {
              existingNpcs: state.manifests.npcs.slice(0, 10).map((n) => ({
                id: n.id,
                name: n.name,
                category: n.category,
              })),
              area: "starter",
            },
            quality: "balanced",
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`API error ${res.status}: ${errorText}`);
        }

        const result = await res.json();
        actions.completeAIGeneration("quest", questId, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        actions.errorAIGeneration("quest", questId, message);
      }
    },
    [state.manifests.quests, state.manifests.npcs, placedQuests, actions],
  );

  const generateVoice = useCallback(
    async (npcId: string) => {
      // Find dialogue nodes for this NPC
      const dialogue = state.aiGeneration.dialogues.find(
        (d) => d.npcId === npcId,
      );
      const npc = state.manifests.npcs.find((n) => n.id === npcId);

      if (!dialogue?.nodes?.length) {
        actions.errorAIGeneration(
          "voice",
          npcId,
          "No dialogue nodes to generate voice for",
        );
        return;
      }

      actions.startAIGeneration("voice", npcId);

      try {
        const res = await fetch("/api/voice/generate-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            npcName: npc?.name ?? npcId,
            lines: dialogue.nodes.map((node) => ({
              nodeId: node.id,
              text: node.text,
            })),
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`API error ${res.status}: ${errorText}`);
        }

        const result = await res.json();
        actions.completeAIGeneration("voice", npcId, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        actions.errorAIGeneration("voice", npcId, message);
      }
    },
    [state.aiGeneration.dialogues, state.manifests.npcs, actions],
  );

  return {
    generateDialogue,
    generateQuest,
    generateVoice,
    isGenerating: state.aiGeneration.status === "generating",
    activeEntityId: state.aiGeneration.activeEntityId,
    error: state.aiGeneration.error,
  };
}
