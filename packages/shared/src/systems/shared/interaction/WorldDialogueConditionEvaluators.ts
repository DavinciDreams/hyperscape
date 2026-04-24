/**
 * World-backed concrete `DialogueConditionEvaluator` factory.
 *
 * DialogueSystem's condition registry is keyed by free-form predicate
 * names (authors write `showIf: "has_bandits_quest"` in a
 * DialogueManifest and the runner calls
 * `ctx.evaluateCondition("has_bandits_quest")`). That's flexible, but
 * it leaves the actual predicate-name → world-read mapping entirely
 * up to whatever plugin registers the evaluator.
 *
 * This module gives the game a **declarative** way to bind author
 * names to common world-backed predicates without writing a custom
 * function per name. Pass a list of `DialogueConditionBinding`
 * entries and every named predicate is wired through to the
 * corresponding QuestSystem / InventorySystem / SkillsSystem read.
 *
 * All handlers are safe-by-default — missing systems, missing
 * params, or missing killer return `false`. DialogueSystem's
 * try/catch at the callsite already treats throws as `false`, so
 * plugin-side misbehavior never takes down a dialogue tree.
 */
import type { World } from "../../../types/index";
import type { Skills } from "../../../types/entities/entity-types";
import type { QuestSystem } from "../progression/QuestSystem";
import type { InventorySystem } from "../character/InventorySystem";
import type { SkillsSystem } from "../character/SkillsSystem";
import { SystemLogger } from "../../../utils/Logger";

import type { DialogueSystem, DialogueConditionArgs } from "./DialogueSystem";

/**
 * Declarative binding: one entry installs a predicate with `name` on
 * DialogueSystem. At runtime, the predicate reads from the
 * corresponding world system using the keyed params.
 */
export type DialogueConditionBinding =
  | {
      readonly name: string;
      readonly kind: "quest-active" | "quest-completed";
      readonly questId: string;
    }
  | {
      readonly name: string;
      readonly kind: "has-item";
      readonly itemId: string;
      /** Default 1. Must be > 0. */
      readonly quantity?: number;
    }
  | {
      readonly name: string;
      readonly kind: "level-at-least";
      readonly skill: keyof Skills;
      readonly level: number;
    };

const KNOWN_SKILLS: ReadonlySet<keyof Skills> = new Set<keyof Skills>([
  "attack",
  "strength",
  "defense",
  "constitution",
  "ranged",
  "magic",
  "prayer",
  "woodcutting",
  "mining",
  "fishing",
  "firemaking",
  "cooking",
  "smithing",
  "agility",
  "crafting",
  "fletching",
  "runecrafting",
]);

/**
 * Build a single `DialogueConditionEvaluator` for one binding.
 *
 * Exposed for unit testing and for plugins that want to compose their
 * own predicate logic alongside the declarative ones.
 */
export function buildDialoguePredicate(
  world: World,
  binding: DialogueConditionBinding,
): (args: DialogueConditionArgs) => boolean {
  switch (binding.kind) {
    case "quest-active":
      return (args) => {
        const quests = world.getSystem<QuestSystem>("quest") ?? null;
        if (!quests) return false;
        const active = quests.getActiveQuests(args.playerId);
        return active.some(
          (q) => q.questId === binding.questId && q.status !== "completed",
        );
      };
    case "quest-completed":
      return (args) => {
        const quests = world.getSystem<QuestSystem>("quest") ?? null;
        if (!quests) return false;
        return quests.hasCompletedQuest(args.playerId, binding.questId);
      };
    case "has-item": {
      const qty = binding.quantity ?? 1;
      if (qty <= 0) {
        // Quantity ≤ 0 is a programmer error at binding time — fail
        // closed at evaluation rather than silently allowing.
        return () => false;
      }
      return (args) => {
        const inv = world.getSystem<InventorySystem>("inventory") ?? null;
        if (!inv) return false;
        return inv.hasItem(args.playerId, binding.itemId, qty);
      };
    }
    case "level-at-least": {
      if (!KNOWN_SKILLS.has(binding.skill)) {
        return () => false;
      }
      return (args) => {
        const skills = world.getSystem<SkillsSystem>("skills") ?? null;
        if (!skills) return false;
        const data = skills.getSkillData(args.playerId, binding.skill);
        if (!data) return false;
        return data.level >= binding.level;
      };
    }
  }
}

/**
 * Register every binding on the live DialogueSystem.
 *
 * Duplicate `name` entries use last-write-wins (DialogueSystem's
 * registry semantics — explicit about that in the conditions test
 * suite). Empty-name entries are rejected by DialogueSystem itself
 * (empty `showIf` means always-visible).
 *
 * Logs one warning per missing world system at install time so
 * bootstrap order mistakes are visible.
 */
export function installWorldDialogueConditions(
  dialogueSystem: DialogueSystem,
  world: World,
  bindings: readonly DialogueConditionBinding[],
): void {
  const logger = new SystemLogger("WorldDialogueConditions");
  const needsQuest = bindings.some(
    (b) => b.kind === "quest-active" || b.kind === "quest-completed",
  );
  const needsInventory = bindings.some((b) => b.kind === "has-item");
  const needsSkills = bindings.some((b) => b.kind === "level-at-least");
  if (needsQuest && world.getSystem("quest") === null) {
    logger.warn(
      "QuestSystem not registered — quest-active/quest-completed bindings installed but will always return false until it exists",
    );
  }
  if (needsInventory && world.getSystem("inventory") === null) {
    logger.warn(
      "InventorySystem not registered — has-item bindings installed but will always return false until it exists",
    );
  }
  if (needsSkills && world.getSystem("skills") === null) {
    logger.warn(
      "SkillsSystem not registered — level-at-least bindings installed but will always return false until it exists",
    );
  }
  for (const binding of bindings) {
    dialogueSystem.registerConditionEvaluator(
      binding.name,
      buildDialoguePredicate(world, binding),
    );
  }
}

/**
 * Handle for a set of authored bindings that must be replaced
 * atomically on manifest hot-reload.
 *
 * Unlike `installWorldDialogueConditions`, this tracks which names
 * *this install* owns so that `replace` only removes names it put
 * there — plugins that register their own predicates alongside
 * authored ones are preserved across reloads.
 *
 * Name-collision semantics: if a plugin registers a predicate with
 * the same `name` as an authored binding, whichever call lands
 * *last* wins (DialogueSystem's registry is Map-semantics). `clear`
 * will only unregister names we currently own. If a plugin has since
 * overwritten one of our names, we still unregister the name (the
 * plugin's predicate goes with it) — that's the unavoidable cost of
 * the shared flat namespace.
 */
export interface ManagedDialogueConditionInstall {
  /**
   * Replace the currently-installed authored bindings with a new
   * list. Unregisters previously-owned names, then installs the new
   * ones. Passing an empty list is equivalent to `clear()`.
   */
  replace(bindings: readonly DialogueConditionBinding[]): void;
  /** Unregister every binding this handle currently owns. */
  clear(): void;
  /** Names currently owned by this handle (sorted). Mainly for tests. */
  getInstalledNames(): readonly string[];
}

/**
 * Create a managed install handle for authored dialogue condition
 * bindings. The handle starts empty — call `replace(bindings)` to
 * install the authored list, and again on every manifest hot-reload.
 */
export function createManagedDialogueConditionInstall(
  dialogueSystem: DialogueSystem,
  world: World,
): ManagedDialogueConditionInstall {
  const installed = new Set<string>();

  return {
    replace(bindings) {
      // Phase 1 — tear down names we own. Do this *before* installing
      // the new list so that a binding renamed in the manifest ends
      // up with only the new entry present.
      for (const name of installed) {
        dialogueSystem.unregisterConditionEvaluator(name);
      }
      installed.clear();

      // Phase 2 — install the new list. Use the same one-shot helper
      // so empty-name rejection, warn-on-missing-system semantics,
      // and last-write-wins duplicate behavior match the boot path.
      if (bindings.length > 0) {
        installWorldDialogueConditions(dialogueSystem, world, bindings);
        for (const b of bindings) {
          installed.add(b.name);
        }
      }
    },
    clear() {
      for (const name of installed) {
        dialogueSystem.unregisterConditionEvaluator(name);
      }
      installed.clear();
    },
    getInstalledNames() {
      return Array.from(installed).sort();
    },
  };
}
