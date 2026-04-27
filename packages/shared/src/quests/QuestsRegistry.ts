/**
 * Quests registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `quests.ts`.
 * Indexes quests by id and surfaces requirement-checking helpers:
 * prerequisite-quest completion, per-skill level gates, and stage
 * advancement by id.
 */

import {
  type Quest,
  type QuestStage,
  type QuestsManifest,
  QuestsManifestSchema,
} from "@hyperforge/manifest-schema";

export class QuestsNotLoadedError extends Error {
  constructor() {
    super("QuestsRegistry used before load()");
    this.name = "QuestsNotLoadedError";
  }
}

export class UnknownQuestError extends Error {
  readonly questId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `quest "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownQuestError";
    this.questId = id;
    this.availableIds = availableIds;
  }
}

export interface QuestRequirementCheck {
  completedQuestIds: ReadonlySet<string>;
  skillLevels: Readonly<Record<string, number>>;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type QuestsReloadListener = () => void;

export class QuestsRegistry {
  private _manifest: QuestsManifest | null = null;
  private _reloadListeners = new Set<QuestsReloadListener>();

  constructor(manifest?: QuestsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: QuestsManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(QuestsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to "registry reloaded" notifications. Fires after every
   * successful `load()` / `loadFromJson()`. Returns an unsubscribe
   * function. Listener throws are caught + logged so a buggy listener
   * can't take the registry down.
   *
   * Used by PIE / Studio editor session UI consumers that want to
   * re-render when the quest manifest hot-reloads. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: QuestsReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[questsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): QuestsManifest {
    if (!this._manifest) throw new QuestsNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Object.keys(this.manifest);
  }

  has(id: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest, id);
  }

  get(id: string): Quest {
    const q = this.manifest[id];
    if (!q) throw new UnknownQuestError(id, this.ids);
    return q;
  }

  all(): Quest[] {
    return Object.values(this.manifest);
  }

  /**
   * Whether a player meeting `check` satisfies the quest's entry
   * requirements (prerequisite quests + skill levels). Items-in-
   * inventory are NOT checked here — those live with the inventory
   * system and are consumed at quest-start time.
   */
  canStart(questId: string, check: QuestRequirementCheck): boolean {
    const q = this.get(questId);
    for (const prereq of q.requirements.quests) {
      if (!check.completedQuestIds.has(prereq)) return false;
    }
    for (const [skill, required] of Object.entries(q.requirements.skills)) {
      const level = check.skillLevels[skill] ?? 0;
      if (level < required) return false;
    }
    return true;
  }

  /** Find a stage by its id within a quest; throws on unknown stage. */
  stage(questId: string, stageId: string): QuestStage {
    const q = this.get(questId);
    const s = q.stages.find((st) => st.id === stageId);
    if (!s) {
      throw new Error(
        `quest "${questId}" has no stage "${stageId}". Known: ${q.stages
          .map((st) => st.id)
          .join(", ")}`,
      );
    }
    return s;
  }

  /** Next stage after `currentStageId`, or `null` if it's the final stage. */
  nextStage(questId: string, currentStageId: string): QuestStage | null {
    const q = this.get(questId);
    const idx = q.stages.findIndex((s) => s.id === currentStageId);
    if (idx < 0 || idx >= q.stages.length - 1) return null;
    return q.stages[idx + 1];
  }

  startNpc(questId: string): string {
    return this.get(questId).startNpc;
  }
}
