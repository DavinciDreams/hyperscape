/**
 * useManifestValidation — Cross-reference validation for game manifests
 *
 * Validates that IDs referenced across manifests are valid:
 * - NPC drop item IDs exist in items manifests
 * - Quest reward item IDs exist
 * - Store inventory item IDs exist
 * - Quest NPC IDs reference valid NPCs
 * - Spell rune IDs reference valid rune types
 */

import { useMemo } from "react";

import { useWorldStudio } from "../WorldStudioContext";

export interface ManifestValidationIssue {
  /** Which manifest the issue is in */
  manifest: string;
  /** Entry ID within that manifest */
  entryId: string;
  /** Entry name for display */
  entryName: string;
  /** Field path where the issue was found */
  field: string;
  /** The invalid reference value */
  value: string;
  /** What was expected */
  expected: string;
  /** Severity */
  severity: "error" | "warning";
}

/**
 * Returns validation issues found across all loaded manifests.
 * Only runs when manifests are loaded.
 */
export function useManifestValidation(): ManifestValidationIssue[] {
  const { state } = useWorldStudio();
  const manifests = state.manifests;

  return useMemo(() => {
    if (!manifests.loaded) return [];

    const issues: ManifestValidationIssue[] = [];
    const itemIds = new Set(manifests.items.map((i) => i.id));
    const npcIds = new Set(manifests.npcs.map((n) => n.id));
    const questIds = new Set(manifests.quests.map((q) => q.id));
    const runeIds = new Set(manifests.runes.map((r) => r.id));

    // Validate NPC drops reference valid items
    for (const npc of manifests.npcs) {
      const raw = npc._raw;
      if (!raw) continue;
      const drops = raw.drops as
        | Record<string, Array<{ itemId: string }>>
        | undefined;
      if (!drops) continue;

      for (const [rarity, items] of Object.entries(drops)) {
        if (!Array.isArray(items)) continue;
        for (const drop of items) {
          if (drop.itemId && !itemIds.has(drop.itemId)) {
            issues.push({
              manifest: "npcs",
              entryId: npc.id,
              entryName: npc.name,
              field: `drops.${rarity}.itemId`,
              value: drop.itemId,
              expected: "valid item ID",
              severity: "error",
            });
          }
        }
      }
    }

    // Validate quest rewards reference valid items
    for (const quest of manifests.quests) {
      if (quest.rewards?.items) {
        for (const reward of quest.rewards.items) {
          if (!itemIds.has(reward.itemId)) {
            issues.push({
              manifest: "quests",
              entryId: quest.id,
              entryName: quest.name,
              field: "rewards.items.itemId",
              value: reward.itemId,
              expected: "valid item ID",
              severity: "error",
            });
          }
        }
      }

      // Validate quest required items
      if (quest.requirements?.items) {
        for (const itemId of quest.requirements.items) {
          if (!itemIds.has(itemId)) {
            issues.push({
              manifest: "quests",
              entryId: quest.id,
              entryName: quest.name,
              field: "requirements.items",
              value: itemId,
              expected: "valid item ID",
              severity: "error",
            });
          }
        }
      }

      // Validate quest required quests
      if (quest.requirements?.quests) {
        for (const reqQuestId of quest.requirements.quests) {
          if (!questIds.has(reqQuestId)) {
            issues.push({
              manifest: "quests",
              entryId: quest.id,
              entryName: quest.name,
              field: "requirements.quests",
              value: reqQuestId,
              expected: "valid quest ID",
              severity: "error",
            });
          }
        }
      }

      // Validate quest start NPC
      if (quest.startNpc && !npcIds.has(quest.startNpc)) {
        issues.push({
          manifest: "quests",
          entryId: quest.id,
          entryName: quest.name,
          field: "startNpc",
          value: quest.startNpc,
          expected: "valid NPC ID",
          severity: "warning",
        });
      }

      // Validate quest stage NPCs
      for (const stage of quest.stages) {
        if (stage.npcId && !npcIds.has(stage.npcId)) {
          issues.push({
            manifest: "quests",
            entryId: quest.id,
            entryName: quest.name,
            field: `stages.${stage.id}.npcId`,
            value: stage.npcId,
            expected: "valid NPC ID",
            severity: "warning",
          });
        }
      }
    }

    // Validate store inventory references valid items
    for (const store of manifests.stores) {
      for (const storeItem of store.items) {
        if (!itemIds.has(storeItem.itemId)) {
          issues.push({
            manifest: "stores",
            entryId: store.id,
            entryName: store.name,
            field: `items.${storeItem.id}.itemId`,
            value: storeItem.itemId,
            expected: "valid item ID",
            severity: "error",
          });
        }
      }
    }

    // Validate combat spell rune costs
    for (const spell of manifests.combatSpells) {
      for (const runeCost of spell.runes) {
        if (!runeIds.has(runeCost.runeId)) {
          issues.push({
            manifest: "combat-spells",
            entryId: spell.id,
            entryName: spell.name,
            field: "runes.runeId",
            value: runeCost.runeId,
            expected: "valid rune ID",
            severity: "error",
          });
        }
      }
    }

    // Validate recipe inputs/outputs reference valid items
    for (const recipe of manifests.recipes) {
      if (recipe.output && !itemIds.has(recipe.output)) {
        issues.push({
          manifest: `recipes/${recipe.skill}`,
          entryId: recipe.id,
          entryName: recipe.output,
          field: "output",
          value: recipe.output,
          expected: "valid item ID",
          severity: "warning",
        });
      }
      for (const input of recipe.inputs) {
        if (!itemIds.has(input.itemId)) {
          issues.push({
            manifest: `recipes/${recipe.skill}`,
            entryId: recipe.id,
            entryName: recipe.output ?? recipe.id,
            field: "inputs.itemId",
            value: input.itemId,
            expected: "valid item ID",
            severity: "warning",
          });
        }
      }
    }

    return issues;
  }, [manifests]);
}
