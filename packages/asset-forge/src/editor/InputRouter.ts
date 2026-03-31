/**
 * InputRouter — Priority-based input routing for World Studio.
 *
 * Inspired by UE5's UInputRouter. Prevents conflicts like:
 * - Gizmo drag triggering orbit controls
 * - Keyboard shortcuts firing during text input
 * - Brush painting while hovering over UI panels
 *
 * Events are routed to the highest-priority behavior that wants them.
 * Once a behavior captures input (e.g., gizmo drag started), it holds
 * exclusive access until it releases.
 */

// ============== TYPES ==============

export interface InputBehavior {
  /** Unique identifier */
  readonly id: string;
  /** Whether this behavior wants to handle the given pointer event */
  wantsPointerDown?(e: PointerEvent): boolean;
  wantsPointerMove?(e: PointerEvent): boolean;
  wantsPointerUp?(e: PointerEvent): boolean;
  wantsKeyDown?(e: KeyboardEvent): boolean;
  /** Handle the event (return true to stop propagation) */
  onPointerDown?(e: PointerEvent): boolean;
  onPointerMove?(e: PointerEvent): boolean;
  onPointerUp?(e: PointerEvent): boolean;
  onKeyDown?(e: KeyboardEvent): boolean;
}

interface RegisteredBehavior {
  behavior: InputBehavior;
  priority: number;
}

// ============== PRIORITY LEVELS ==============

/** Higher number = higher priority (handled first) */
export const INPUT_PRIORITY = {
  /** UI panels — clicks on panels don't reach viewport */
  UI_PANEL: 100,
  /** Transform gizmo — when active, captures all pointer input */
  GIZMO: 80,
  /** Brush tool — when brush active */
  BRUSH: 60,
  /** Placement tool — when placing */
  PLACEMENT: 50,
  /** Selection click — select tool */
  SELECTION: 30,
  /** Camera controls — orbit/pan/zoom (lowest) */
  CAMERA: 10,
} as const;

// ============== INPUT ROUTER ==============

export class InputRouter {
  private behaviors: RegisteredBehavior[] = [];
  private captured: InputBehavior | null = null;

  /** Register a behavior at a given priority */
  register(behavior: InputBehavior, priority: number): void {
    // Remove existing registration with same id
    this.behaviors = this.behaviors.filter(
      (b) => b.behavior.id !== behavior.id,
    );
    this.behaviors.push({ behavior, priority });
    // Sort by priority descending (highest first)
    this.behaviors.sort((a, b) => b.priority - a.priority);
  }

  /** Unregister a behavior */
  unregister(behaviorId: string): void {
    this.behaviors = this.behaviors.filter((b) => b.behavior.id !== behaviorId);
    if (this.captured?.id === behaviorId) {
      this.captured = null;
    }
  }

  /** Route a pointer down event */
  handlePointerDown(e: PointerEvent): void {
    // If something has captured, route to it
    if (this.captured) {
      this.captured.onPointerDown?.(e);
      return;
    }

    // Route to highest-priority behavior that wants it
    for (const { behavior } of this.behaviors) {
      if (behavior.wantsPointerDown?.(e)) {
        const handled = behavior.onPointerDown?.(e);
        if (handled) {
          this.captured = behavior;
          return;
        }
      }
    }
  }

  /** Route a pointer move event */
  handlePointerMove(e: PointerEvent): void {
    if (this.captured) {
      this.captured.onPointerMove?.(e);
      return;
    }

    for (const { behavior } of this.behaviors) {
      if (behavior.wantsPointerMove?.(e)) {
        const handled = behavior.onPointerMove?.(e);
        if (handled) return;
      }
    }
  }

  /** Route a pointer up event */
  handlePointerUp(e: PointerEvent): void {
    if (this.captured) {
      this.captured.onPointerUp?.(e);
      this.captured = null;
      return;
    }

    for (const { behavior } of this.behaviors) {
      if (behavior.wantsPointerUp?.(e)) {
        const handled = behavior.onPointerUp?.(e);
        if (handled) return;
      }
    }
  }

  /** Route a key down event */
  handleKeyDown(e: KeyboardEvent): void {
    for (const { behavior } of this.behaviors) {
      if (behavior.wantsKeyDown?.(e)) {
        const handled = behavior.onKeyDown?.(e);
        if (handled) return;
      }
    }
  }

  /** Release any capture (e.g., when tool changes) */
  releaseCapture(): void {
    this.captured = null;
  }

  /** Check if input is currently captured */
  isCaptured(): boolean {
    return this.captured !== null;
  }

  /** Get the capturing behavior id */
  getCapturedId(): string | null {
    return this.captured?.id ?? null;
  }
}

/** Singleton input router for the editor */
export const inputRouter = new InputRouter();
