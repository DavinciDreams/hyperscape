/**
 * Dialogue-tree runner.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `dialogue.ts`.
 * Walks a validated `DialogueTree` as an interactive state machine,
 * exposing a `DialoguePresentation` for the UI to render and methods
 * to advance on player input.
 *
 * Scope: pure logic. Zero deps on React, world events, i18n catalog,
 * or audio. Callers supply a `DialogueContext` with
 * `evaluateCondition` + `executeAction` so the runner can be unit
 * tested with deterministic inputs. Localization keys are returned
 * as-is — resolution against the translation catalog is the UI's job.
 *
 * Node visibility model:
 * - `line` / `choice` / `end` — presentation-visible. Runner pauses
 *   here until `advance()` / `pickChoice()`.
 * - `action` / `branch` — transparent. Runner processes them
 *   internally and keeps walking until the next visible node.
 *
 * Safety: transparent traversal uses a visit budget (default 256) so
 * an author-introduced action→branch→action cycle can't hang the UI.
 */

import {
  type DialogueNode,
  type DialogueTree,
} from "@hyperforge/manifest-schema";

/** Parameter bag supplied to action handlers. Matches schema shape. */
export type DialogueActionParams = Record<string, string | number | boolean>;

/**
 * One presentable step of the conversation. Discriminated by `kind` so
 * UIs can exhaustively handle each render mode.
 */
export type DialoguePresentation =
  | {
      kind: "line";
      speaker: string;
      textKey: string;
      sfxId: string | undefined;
    }
  | { kind: "choice"; promptKey: string | undefined; options: VisibleChoice[] }
  | { kind: "end" };

/**
 * An option rendered to the player. `originalIndex` is the slot in the
 * node's `options` array — callers pass this back to `pickChoice()`
 * (NOT the index into the filtered VisibleChoice list, which changes
 * when `showIf` predicates flip).
 */
export interface VisibleChoice {
  originalIndex: number;
  textKey: string;
  action: string;
}

export interface DialogueContext {
  /**
   * Evaluate a named predicate. Invoked for `branch.condition` and
   * `choice.options[].showIf`. Empty-string predicates aren't passed
   * here — the runner treats them as "always visible" / "always true".
   */
  evaluateCondition: (name: string) => boolean;
  /**
   * Fire a named action. Invoked for `action` nodes and
   * `choice.options[].action` (when non-empty). Return value is
   * ignored — actions are fire-and-forget from the runner's view.
   */
  executeAction: (name: string, params: DialogueActionParams) => void;
}

export interface RunnerOptions {
  /**
   * Max transparent-hop budget per `advance()` / `pickChoice()`. Guards
   * against author-introduced cycles (action→branch→action). Default 256.
   */
  maxTransparentHops?: number;
}

const DEFAULT_MAX_HOPS = 256;

export class UnknownDialogueNodeError extends Error {
  readonly nodeId: string;
  constructor(nodeId: string) {
    super(`dialogue tree has no node with id "${nodeId}"`);
    this.name = "UnknownDialogueNodeError";
    this.nodeId = nodeId;
  }
}

export class DialogueTransparentHopLimitError extends Error {
  readonly path: readonly string[];
  constructor(path: readonly string[]) {
    super(
      `dialogue transparent-hop budget exceeded along path: ${path.join(" → ")}`,
    );
    this.name = "DialogueTransparentHopLimitError";
    this.path = path;
  }
}

export class DialogueIllegalTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DialogueIllegalTransitionError";
  }
}

export class DialogueRunner {
  private readonly tree: DialogueTree;
  private readonly maxHops: number;
  private currentId: string;
  private started = false;

  constructor(tree: DialogueTree, options: RunnerOptions = {}) {
    this.tree = tree;
    this.maxHops = options.maxTransparentHops ?? DEFAULT_MAX_HOPS;
    this.currentId = tree.start;
  }

  /** Node id the runner currently points at (visible node, after any transparent hops). */
  get currentNodeId(): string {
    return this.currentId;
  }

  get isStarted(): boolean {
    return this.started;
  }

  get isEnded(): boolean {
    return this.started && this.getNode(this.currentId).kind === "end";
  }

  /**
   * Present the current visible node. Call this after `start()` /
   * `advance()` / `pickChoice()` to render the UI. Throws if called
   * before `start()`.
   */
  present(ctx: DialogueContext): DialoguePresentation {
    if (!this.started) {
      throw new DialogueIllegalTransitionError(
        "DialogueRunner.present() called before start()",
      );
    }
    const node = this.getNode(this.currentId);
    return this.presentNode(node, ctx);
  }

  /** Walk from the start pointer through transparent nodes to the first visible node. */
  start(ctx: DialogueContext): void {
    this.currentId = this.walkTransparent(this.tree.start, ctx, [
      this.tree.start,
    ]);
    this.started = true;
  }

  /**
   * Advance past the current `line` node to its `next`. Invalid on
   * `choice` (use `pickChoice`) or `end` (conversation over).
   */
  advance(ctx: DialogueContext): void {
    if (!this.started) {
      throw new DialogueIllegalTransitionError(
        "DialogueRunner.advance() called before start()",
      );
    }
    const node = this.getNode(this.currentId);
    if (node.kind === "line") {
      this.currentId = this.walkTransparent(node.next, ctx, [node.next]);
      return;
    }
    if (node.kind === "choice") {
      throw new DialogueIllegalTransitionError(
        "advance() invalid on choice node — use pickChoice(index) instead",
      );
    }
    if (node.kind === "end") {
      throw new DialogueIllegalTransitionError(
        "advance() invalid on end node — conversation already ended",
      );
    }
    // `action` / `branch` are never resting states, so this is unreachable.
    throw new DialogueIllegalTransitionError(
      `advance() unreachable: resting on transparent node "${node.kind}"`,
    );
  }

  /**
   * Pick an option on the current `choice` node. `originalIndex` is the
   * index into the node's `options` array (NOT the filtered
   * VisibleChoice list). Fires the option's action (if any), then walks
   * through transparent nodes to the next visible node.
   */
  pickChoice(originalIndex: number, ctx: DialogueContext): void {
    if (!this.started) {
      throw new DialogueIllegalTransitionError(
        "DialogueRunner.pickChoice() called before start()",
      );
    }
    const node = this.getNode(this.currentId);
    if (node.kind !== "choice") {
      throw new DialogueIllegalTransitionError(
        `pickChoice() invalid on "${node.kind}" node — only valid on choice nodes`,
      );
    }
    const option = node.options[originalIndex];
    if (option === undefined) {
      throw new DialogueIllegalTransitionError(
        `pickChoice(${originalIndex}) out of range — choice has ${node.options.length} options`,
      );
    }
    // Respect showIf — hidden options aren't actually pickable.
    if (option.showIf !== "" && !ctx.evaluateCondition(option.showIf)) {
      throw new DialogueIllegalTransitionError(
        `pickChoice(${originalIndex}) selected a hidden option (showIf="${option.showIf}" evaluated false)`,
      );
    }
    if (option.action !== "") {
      ctx.executeAction(option.action, {});
    }
    this.currentId = this.walkTransparent(option.next, ctx, [option.next]);
  }

  /** Rewind to the tree's start pointer. Callers still need to `start()` again. */
  reset(): void {
    this.currentId = this.tree.start;
    this.started = false;
  }

  // -- internals ----------------------------------------------------

  private getNode(nodeId: string): DialogueNode {
    const node = this.tree.nodes[nodeId];
    if (node === undefined) {
      // Schema guarantees all `next` pointers resolve, so this should
      // only hit if the caller somehow constructed a runner against a
      // manifest that bypassed validation.
      throw new UnknownDialogueNodeError(nodeId);
    }
    return node;
  }

  /**
   * Walk transparent nodes (`action`, `branch`) starting at `nodeId`,
   * executing side effects as we go, until we land on a visible node
   * (`line`, `choice`, `end`). Returns the visible node's id.
   */
  private walkTransparent(
    nodeId: string,
    ctx: DialogueContext,
    path: string[],
  ): string {
    let cursor = nodeId;
    for (let hops = 0; hops < this.maxHops; hops++) {
      const node = this.getNode(cursor);
      if (
        node.kind === "line" ||
        node.kind === "choice" ||
        node.kind === "end"
      ) {
        return cursor;
      }
      if (node.kind === "action") {
        ctx.executeAction(node.action, { ...node.params });
        cursor = node.next;
        path.push(cursor);
        continue;
      }
      if (node.kind === "branch") {
        const taken = ctx.evaluateCondition(node.condition)
          ? node.ifTrue
          : node.ifFalse;
        cursor = taken;
        path.push(cursor);
        continue;
      }
    }
    throw new DialogueTransparentHopLimitError(path);
  }

  private presentNode(
    node: DialogueNode,
    ctx: DialogueContext,
  ): DialoguePresentation {
    if (node.kind === "line") {
      return {
        kind: "line",
        speaker: node.speaker,
        textKey: node.textKey,
        sfxId: node.sfxId,
      };
    }
    if (node.kind === "choice") {
      const options: VisibleChoice[] = [];
      node.options.forEach((opt, idx) => {
        if (opt.showIf !== "" && !ctx.evaluateCondition(opt.showIf)) return;
        options.push({
          originalIndex: idx,
          textKey: opt.textKey,
          action: opt.action,
        });
      });
      return { kind: "choice", promptKey: node.promptKey, options };
    }
    if (node.kind === "end") {
      return { kind: "end" };
    }
    // action/branch should have been walked through by walkTransparent —
    // if we land here, the runner's invariant is broken.
    throw new DialogueIllegalTransitionError(
      `present() landed on transparent node "${node.kind}" — walker bug`,
    );
  }
}
