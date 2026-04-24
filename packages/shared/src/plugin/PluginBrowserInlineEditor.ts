/**
 * Pure single-field inline-editor state for the Plugin
 * Browser config editor.
 *
 * At most one inline edit is open at a time — the common UE5
 * pattern where clicking a second field commits or cancels
 * the first. This substrate only tracks *which* field is
 * open and *what* the current draft is; the caller applies
 * commits (via their reducer) and drops cancels on the floor.
 *
 * Generic draft type `<T>` so typed forms flow through
 * without erasure (`number`, `string`, `{min,max}`, etc.).
 *
 * Pure state. Caller-owned instance. Never throws. Invalid
 * input (empty ids, setDraft while closed) silently no-op'd.
 */

export interface PluginBrowserInlineEditorSession<T> {
  readonly pluginId: string;
  readonly fieldPath: string;
  readonly draft: T;
}

export interface PluginBrowserInlineEditor<T = unknown> {
  /** True when an editor is currently open. */
  isOpen(): boolean;
  /** Current session, or undefined when closed. */
  current(): PluginBrowserInlineEditorSession<T> | undefined;
  /** True iff the open editor targets `(pluginId, fieldPath)`. */
  isEditing(pluginId: string, fieldPath: string): boolean;
  /**
   * Open an editor for `(pluginId, fieldPath)` with
   * `initialDraft`. If an editor is already open, it is
   * silently discarded (same as `cancel` without returning
   * anything). Returns true on success, false when
   * `pluginId` or `fieldPath` is empty.
   */
  open(pluginId: string, fieldPath: string, initialDraft: T): boolean;
  /**
   * Update the draft on the open editor. Returns true when
   * the value actually changed (strict !== comparison);
   * false when no editor is open OR draft was the same.
   */
  setDraft(draft: T): boolean;
  /**
   * Close the editor and return the final session
   * (pluginId + fieldPath + draft) for the caller to
   * persist. Returns undefined when no editor is open.
   */
  commit(): PluginBrowserInlineEditorSession<T> | undefined;
  /**
   * Close the editor without returning the draft. Returns
   * the discarded session so the caller can log / signal
   * cancel, or undefined when no editor was open.
   */
  cancel(): PluginBrowserInlineEditorSession<T> | undefined;
}

/**
 * Create a caller-owned inline-editor state.
 */
export function createPluginBrowserInlineEditor<
  T = unknown,
>(): PluginBrowserInlineEditor<T> {
  let session: PluginBrowserInlineEditorSession<T> | null = null;

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  return {
    isOpen(): boolean {
      return session !== null;
    },
    current(): PluginBrowserInlineEditorSession<T> | undefined {
      return session ?? undefined;
    },
    isEditing(pluginId: string, fieldPath: string): boolean {
      if (!isValidId(pluginId) || !isValidId(fieldPath)) return false;
      return (
        session !== null &&
        session.pluginId === pluginId &&
        session.fieldPath === fieldPath
      );
    },
    open(pluginId: string, fieldPath: string, initialDraft: T): boolean {
      if (!isValidId(pluginId) || !isValidId(fieldPath)) return false;
      session = { pluginId, fieldPath, draft: initialDraft };
      return true;
    },
    setDraft(draft: T): boolean {
      if (!session) return false;
      if (Object.is(session.draft, draft)) return false;
      session = {
        pluginId: session.pluginId,
        fieldPath: session.fieldPath,
        draft,
      };
      return true;
    },
    commit(): PluginBrowserInlineEditorSession<T> | undefined {
      if (!session) return undefined;
      const done = session;
      session = null;
      return done;
    },
    cancel(): PluginBrowserInlineEditorSession<T> | undefined {
      if (!session) return undefined;
      const discarded = session;
      session = null;
      return discarded;
    },
  };
}
