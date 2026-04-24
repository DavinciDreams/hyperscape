/**
 * Pure undo/redo command stack for the Plugin Browser.
 *
 * Classic two-stack undo/redo model: `push(command)` appends to
 * the undo stack and clears the redo stack; `undo()` pops the
 * latest command off the undo stack and pushes it onto the redo
 * stack; `redo()` reverses that. The stack stores opaque
 * command payloads (caller-typed via the generic parameter) —
 * the module never introspects the payload or "applies" anything.
 * The caller's reducer / system owns the dispatch + inverse-op
 * logic.
 *
 * Capacity: bounded ring (default 100, clamped to >= 1). When a
 * `push` would exceed capacity, the **oldest** undo entry is
 * dropped. The redo stack is never capacity-trimmed — it dies
 * naturally when a new `push` arrives.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Invalid input silently no-op'd.
 */

export interface PluginBrowserUndoCommand<T = unknown> {
  readonly label: string;
  readonly payload: T;
}

export interface PluginBrowserUndoStack<T = unknown> {
  /** Configured capacity (undo stack only). */
  readonly capacity: number;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Top of the undo stack (most-recent push); `undefined` when empty. */
  peekUndo(): PluginBrowserUndoCommand<T> | undefined;
  /** Top of the redo stack; `undefined` when empty. */
  peekRedo(): PluginBrowserUndoCommand<T> | undefined;
  undoSize(): number;
  redoSize(): number;
  /**
   * Push a new command. Clears the redo stack. Returns true
   * on success (false when `command` is invalid).
   */
  push(command: PluginBrowserUndoCommand<T>): boolean;
  /**
   * Pop the latest undo command and move it to the redo stack.
   * Returns the popped command, or `undefined` when empty.
   */
  undo(): PluginBrowserUndoCommand<T> | undefined;
  /**
   * Pop the latest redo command and move it back onto the
   * undo stack. Returns the popped command, or `undefined`
   * when empty.
   */
  redo(): PluginBrowserUndoCommand<T> | undefined;
  /** Drop every entry in both stacks. */
  clear(): void;
  /** Oldest-first snapshot of the undo stack. */
  undoEntries(): readonly PluginBrowserUndoCommand<T>[];
  /** Oldest-first snapshot of the redo stack. */
  redoEntries(): readonly PluginBrowserUndoCommand<T>[];
}

/**
 * Create a caller-owned undo/redo stack.
 */
export function createPluginBrowserUndoStack<T = unknown>(
  capacity = 100,
): PluginBrowserUndoStack<T> {
  const cap =
    typeof capacity === "number" &&
    Number.isFinite(capacity) &&
    Number.isInteger(capacity) &&
    capacity >= 1
      ? capacity
      : 100;

  const undoStack: PluginBrowserUndoCommand<T>[] = [];
  const redoStack: PluginBrowserUndoCommand<T>[] = [];

  function isValidCommand(c: PluginBrowserUndoCommand<T>): boolean {
    return (
      c !== null &&
      typeof c === "object" &&
      typeof c.label === "string" &&
      c.label.length > 0
    );
  }

  return {
    get capacity(): number {
      return cap;
    },
    canUndo(): boolean {
      return undoStack.length > 0;
    },
    canRedo(): boolean {
      return redoStack.length > 0;
    },
    peekUndo(): PluginBrowserUndoCommand<T> | undefined {
      return undoStack[undoStack.length - 1];
    },
    peekRedo(): PluginBrowserUndoCommand<T> | undefined {
      return redoStack[redoStack.length - 1];
    },
    undoSize(): number {
      return undoStack.length;
    },
    redoSize(): number {
      return redoStack.length;
    },
    push(command: PluginBrowserUndoCommand<T>): boolean {
      if (!isValidCommand(command)) return false;
      undoStack.push(command);
      // Trim from the head when over capacity.
      while (undoStack.length > cap) {
        undoStack.shift();
      }
      redoStack.length = 0;
      return true;
    },
    undo(): PluginBrowserUndoCommand<T> | undefined {
      const top = undoStack.pop();
      if (!top) return undefined;
      redoStack.push(top);
      return top;
    },
    redo(): PluginBrowserUndoCommand<T> | undefined {
      const top = redoStack.pop();
      if (!top) return undefined;
      undoStack.push(top);
      return top;
    },
    clear(): void {
      undoStack.length = 0;
      redoStack.length = 0;
    },
    undoEntries(): readonly PluginBrowserUndoCommand<T>[] {
      return [...undoStack];
    },
    redoEntries(): readonly PluginBrowserUndoCommand<T>[] {
      return [...redoStack];
    },
  };
}
