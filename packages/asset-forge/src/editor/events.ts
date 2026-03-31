/**
 * Typed event bus for cross-system communication in the World Studio editor.
 *
 * A simple pub/sub system that decouples viewport, panels, and state.
 * Components subscribe to events they care about without direct references.
 */

// ============== EVENT TYPE MAP ==============

export interface EditorEvents {
  "selection:changed": {
    selection: { type: string; id: string; [key: string]: unknown } | null;
  };
  "entity:moved": {
    id: string;
    position: { x: number; y: number; z: number };
  };
  "entity:added": {
    id: string;
    entityType: string;
    name: string;
  };
  "entity:removed": {
    id: string;
    entityType: string;
  };
  "tool:changed": {
    tool: string;
  };
  "viewport:focus": {
    target: { x: number; y: number; z: number };
    radius: number;
  };
  "command:executed": {
    type: string;
    canUndo: boolean;
    canRedo: boolean;
  };
  "command:undone": {
    type: string;
    canUndo: boolean;
    canRedo: boolean;
  };
}

// ============== EVENT BUS ==============

type Handler<T> = (data: T) => void;

export class EditorEventBus {
  private listeners = new Map<keyof EditorEvents, Set<Handler<never>>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof EditorEvents>(
    event: K,
    handler: Handler<EditorEvents[K]>,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<never>);

    return () => {
      this.off(event, handler);
    };
  }

  /** Unsubscribe a handler from an event. */
  off<K extends keyof EditorEvents>(
    event: K,
    handler: Handler<EditorEvents[K]>,
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler as Handler<never>);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  /** Emit an event to all subscribed handlers. */
  emit<K extends keyof EditorEvents>(event: K, data: EditorEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as Handler<EditorEvents[K]>)(data);
    }
  }
}

/** Singleton event bus for the editor. */
export const editorEventBus = new EditorEventBus();
