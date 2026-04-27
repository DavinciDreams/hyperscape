/**
 * Dialogue registry + session manager.
 *
 * Wraps `DialogueRunner` with:
 *   - an indexed `Map<treeId, DialogueTree>` populated from a
 *     validated `DialogueManifest`, and
 *   - a per-speaker active-session store (`Map<sessionId, Runner>`)
 *     so a server-side `DialogueSystem` (or any caller) can open /
 *     advance / close dialogues keyed by player id without owning
 *     runner lifecycle itself.
 *
 * Scope: no world events, no ECS, no netcode. The enclosing
 * `DialogueSystem` emits events by inspecting the presentation this
 * registry returns. Condition evaluation + action execution are
 * supplied by the caller via `DialogueContext` so gameplay hooks
 * (quest flags, inventory reads, stat-gated options) live above
 * this layer.
 *
 * Hot-reload: `load(manifest)` replaces the tree map. Active sessions
 * are closed by default (the safe choice — the old tree's nodes may
 * not exist in the new manifest), but callers can opt into a
 * best-effort preservation via `load(manifest, { preserveOpenSessionsByTreeId: true })`.
 */

import {
  DialogueManifestSchema,
  type DialogueManifest,
  type DialogueTree,
} from "@hyperforge/manifest-schema";

import {
  DialogueRunner,
  type DialogueContext,
  type DialoguePresentation,
  type RunnerOptions,
} from "./DialogueRunner.js";

export class UnknownDialogueTreeError extends Error {
  readonly treeId: string;
  readonly availableIds: readonly string[];
  constructor(treeId: string, availableIds: readonly string[]) {
    super(
      `dialogue tree "${treeId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownDialogueTreeError";
    this.treeId = treeId;
    this.availableIds = availableIds;
  }
}

export class DuplicateDialogueSessionError extends Error {
  readonly sessionId: string;
  constructor(sessionId: string) {
    super(`dialogue session "${sessionId}" is already open`);
    this.name = "DuplicateDialogueSessionError";
    this.sessionId = sessionId;
  }
}

export class NoActiveDialogueSessionError extends Error {
  readonly sessionId: string;
  constructor(sessionId: string) {
    super(`no active dialogue session for "${sessionId}"`);
    this.name = "NoActiveDialogueSessionError";
    this.sessionId = sessionId;
  }
}

/**
 * One live conversation. `sessionId` is caller-chosen — typically a
 * player entity id.
 */
interface DialogueSession {
  readonly sessionId: string;
  readonly treeId: string;
  readonly runner: DialogueRunner;
}

export interface DialogueLoadOptions {
  /**
   * If true and a tree with the same id survived the reload, leave
   * its sessions running. Default false — safer across structural
   * edits.
   */
  preserveOpenSessionsByTreeId?: boolean;
}

export interface DialogueRegistryOptions {
  /** Forwarded to every `DialogueRunner` instance. */
  runnerOptions?: RunnerOptions;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type DialogueReloadListener = () => void;

export class DialogueRegistry {
  private treesById = new Map<string, DialogueTree>();
  private sessionsById = new Map<string, DialogueSession>();
  private readonly runnerOptions: RunnerOptions;
  private _reloadListeners = new Set<DialogueReloadListener>();

  constructor(
    manifest?: DialogueManifest,
    options: DialogueRegistryOptions = {},
  ) {
    this.runnerOptions = options.runnerOptions ?? {};
    if (manifest !== undefined) this.load(manifest);
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: DialogueReloadListener): () => void {
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
          "[dialogueRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  /**
   * Replace the loaded tree set from a pre-validated manifest.
   * Closes every active session unless
   * `opts.preserveOpenSessionsByTreeId` is true AND the session's
   * tree id survived the reload with the same `start` + node layout
   * (callers responsible — the schema doesn't fingerprint).
   */
  load(manifest: DialogueManifest, opts: DialogueLoadOptions = {}): void {
    this.treesById.clear();
    for (const tree of manifest) {
      this.treesById.set(tree.id, tree);
    }
    if (!opts.preserveOpenSessionsByTreeId) {
      this.sessionsById.clear();
    } else {
      for (const [sessionId, session] of this.sessionsById.entries()) {
        if (!this.treesById.has(session.treeId)) {
          this.sessionsById.delete(sessionId);
        }
      }
    }
    this._emitReloaded();
  }

  /** Validate-and-load untrusted JSON. Throws the Zod error on bad input. */
  loadFromJson(raw: unknown, opts: DialogueLoadOptions = {}): void {
    this.load(DialogueManifestSchema.parse(raw), opts);
  }

  get treeIds(): readonly string[] {
    return Array.from(this.treesById.keys());
  }

  hasTree(treeId: string): boolean {
    return this.treesById.has(treeId);
  }

  getTree(treeId: string): DialogueTree | undefined {
    return this.treesById.get(treeId);
  }

  /** Active session ids (player ids). */
  get activeSessionIds(): readonly string[] {
    return Array.from(this.sessionsById.keys());
  }

  hasSession(sessionId: string): boolean {
    return this.sessionsById.has(sessionId);
  }

  /**
   * Open a new dialogue for `sessionId`. Throws if one is already
   * open (caller should `closeSession` first) or if `treeId` isn't
   * loaded. Returns the first presentation so the caller can emit it
   * in the same tick.
   */
  openSession(
    sessionId: string,
    treeId: string,
    ctx: DialogueContext,
  ): DialoguePresentation {
    if (this.sessionsById.has(sessionId)) {
      throw new DuplicateDialogueSessionError(sessionId);
    }
    const tree = this.treesById.get(treeId);
    if (tree === undefined) {
      throw new UnknownDialogueTreeError(treeId, this.treeIds);
    }
    const runner = new DialogueRunner(tree, this.runnerOptions);
    runner.start(ctx);
    const session: DialogueSession = { sessionId, treeId, runner };
    this.sessionsById.set(sessionId, session);
    return runner.present(ctx);
  }

  /**
   * Advance the session's current `line` node. Throws if no session
   * or if the runner's current node isn't advanceable (use
   * `pickChoice` on a choice node). When the advance lands on an
   * `end` node the session is auto-closed and the `end` presentation
   * is returned as the final frame.
   */
  advance(sessionId: string, ctx: DialogueContext): DialoguePresentation {
    const session = this.requireSession(sessionId);
    session.runner.advance(ctx);
    const presentation = session.runner.present(ctx);
    if (presentation.kind === "end") {
      this.sessionsById.delete(sessionId);
    }
    return presentation;
  }

  /**
   * Pick an option on the current `choice` node by its
   * `originalIndex`. Auto-closes on `end` like `advance`.
   */
  pickChoice(
    sessionId: string,
    originalIndex: number,
    ctx: DialogueContext,
  ): DialoguePresentation {
    const session = this.requireSession(sessionId);
    session.runner.pickChoice(originalIndex, ctx);
    const presentation = session.runner.present(ctx);
    if (presentation.kind === "end") {
      this.sessionsById.delete(sessionId);
    }
    return presentation;
  }

  /**
   * Close a session early (player cancelled, walked away, disconnected).
   * Idempotent — closing a nonexistent session is a no-op.
   */
  closeSession(sessionId: string): void {
    this.sessionsById.delete(sessionId);
  }

  /** Drop every active session without touching the loaded trees. */
  closeAllSessions(): void {
    this.sessionsById.clear();
  }

  /**
   * Peek the current presentation without advancing. Useful for
   * reconnecting clients or re-sending the prompt.
   */
  peek(sessionId: string, ctx: DialogueContext): DialoguePresentation {
    const session = this.requireSession(sessionId);
    return session.runner.present(ctx);
  }

  /** Which tree id is `sessionId` talking to? undefined if closed. */
  getSessionTreeId(sessionId: string): string | undefined {
    return this.sessionsById.get(sessionId)?.treeId;
  }

  private requireSession(sessionId: string): DialogueSession {
    const session = this.sessionsById.get(sessionId);
    if (session === undefined) {
      throw new NoActiveDialogueSessionError(sessionId);
    }
    return session;
  }
}
