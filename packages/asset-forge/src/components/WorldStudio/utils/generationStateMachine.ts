/**
 * generationStateMachine — Explicit state machine for the generation wizard
 *
 * States: idle → configuring → generating → previewing → applying → complete
 * Prevents invalid transitions (can't apply without preview, can't generate
 * while applying). Each step wraps in an undoable command.
 */

// ============== STATES ==============

export type GenerationState =
  | "idle"
  | "configuring"
  | "generating"
  | "previewing"
  | "applying"
  | "complete"
  | "error";

// ============== TRANSITIONS ==============

/** Valid state transitions */
const TRANSITIONS: Record<GenerationState, GenerationState[]> = {
  idle: ["configuring"],
  configuring: ["generating", "idle"],
  generating: ["previewing", "error", "configuring"],
  previewing: ["applying", "configuring", "idle"],
  applying: ["complete", "error"],
  complete: ["configuring", "idle"],
  error: ["configuring", "idle"],
};

// ============== STEP INFO ==============

export interface GenerationStep {
  /** Step index (0-based) */
  index: number;
  /** Step name for display */
  name: string;
  /** Whether this step is optional (can be skipped) */
  optional: boolean;
}

export const WIZARD_STEPS: GenerationStep[] = [
  { index: 0, name: "Terrain", optional: false },
  { index: 1, name: "Towns", optional: false },
  { index: 2, name: "Roads", optional: true },
  { index: 3, name: "Zones", optional: false },
  { index: 4, name: "Population", optional: false },
  { index: 5, name: "POIs & Landmarks", optional: true },
  { index: 6, name: "Review & Compile", optional: false },
];

// ============== STATE MACHINE ==============

export interface GenerationMachineState {
  /** Current state */
  current: GenerationState;
  /** Current wizard step index */
  stepIndex: number;
  /** Progress percentage (0-100) during generation/applying */
  progress: number;
  /** Progress label (e.g., "Flood filling zones...") */
  progressLabel: string;
  /** Error message when in error state */
  errorMessage: string | null;
  /** Whether the error is recoverable (can retry) */
  recoverable: boolean;
  /** Completed step indices */
  completedSteps: Set<number>;
  /** Generation batch ID for source tagging */
  batchId: string | null;
}

export function createInitialMachineState(): GenerationMachineState {
  return {
    current: "idle",
    stepIndex: 0,
    progress: 0,
    progressLabel: "",
    errorMessage: null,
    recoverable: false,
    completedSteps: new Set(),
    batchId: null,
  };
}

// ============== ACTIONS ==============

export type MachineAction =
  | { type: "START_CONFIGURE" }
  | { type: "START_GENERATE" }
  | { type: "GENERATION_PROGRESS"; progress: number; label: string }
  | { type: "GENERATION_COMPLETE" }
  | { type: "START_APPLY" }
  | { type: "APPLY_COMPLETE"; batchId: string }
  | { type: "FAIL"; message: string; recoverable?: boolean }
  | { type: "RETRY" }
  | { type: "CANCEL" }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "JUMP_TO_STEP"; stepIndex: number }
  | { type: "RESET" };

// ============== REDUCER ==============

export function machineReducer(
  state: GenerationMachineState,
  action: MachineAction,
): GenerationMachineState {
  switch (action.type) {
    case "START_CONFIGURE": {
      if (!canTransition(state.current, "configuring")) return state;
      return { ...state, current: "configuring", errorMessage: null };
    }

    case "START_GENERATE": {
      if (!canTransition(state.current, "generating")) return state;
      return {
        ...state,
        current: "generating",
        progress: 0,
        progressLabel: "",
        errorMessage: null,
      };
    }

    case "GENERATION_PROGRESS": {
      if (state.current !== "generating") return state;
      return {
        ...state,
        progress: action.progress,
        progressLabel: action.label,
      };
    }

    case "GENERATION_COMPLETE": {
      if (!canTransition(state.current, "previewing")) return state;
      const completed = new Set(state.completedSteps);
      completed.add(state.stepIndex);
      return {
        ...state,
        current: "previewing",
        progress: 100,
        completedSteps: completed,
      };
    }

    case "START_APPLY": {
      if (!canTransition(state.current, "applying")) return state;
      return { ...state, current: "applying", progress: 0 };
    }

    case "APPLY_COMPLETE": {
      if (!canTransition(state.current, "complete")) return state;
      return {
        ...state,
        current: "complete",
        progress: 100,
        batchId: action.batchId,
      };
    }

    case "FAIL": {
      if (!canTransition(state.current, "error")) return state;
      return {
        ...state,
        current: "error",
        errorMessage: action.message,
        recoverable: action.recoverable ?? true,
      };
    }

    case "RETRY": {
      if (state.current !== "error" || !state.recoverable) return state;
      return { ...state, current: "configuring", errorMessage: null };
    }

    case "CANCEL": {
      return {
        ...state,
        current: "idle",
        progress: 0,
        progressLabel: "",
        errorMessage: null,
      };
    }

    case "NEXT_STEP": {
      if (state.stepIndex >= WIZARD_STEPS.length - 1) return state;
      return {
        ...state,
        stepIndex: state.stepIndex + 1,
        current: "configuring",
        progress: 0,
      };
    }

    case "PREV_STEP": {
      if (state.stepIndex <= 0) return state;
      return {
        ...state,
        stepIndex: state.stepIndex - 1,
        current: "configuring",
        progress: 0,
      };
    }

    case "JUMP_TO_STEP": {
      const { stepIndex } = action;
      if (stepIndex < 0 || stepIndex >= WIZARD_STEPS.length) return state;
      // Can only jump to completed steps or the next uncompleted step
      if (!state.completedSteps.has(stepIndex) && stepIndex > state.stepIndex) {
        return state;
      }
      return {
        ...state,
        stepIndex,
        current: "configuring",
        progress: 0,
      };
    }

    case "RESET": {
      return createInitialMachineState();
    }

    default:
      return state;
  }
}

// ============== HELPERS ==============

function canTransition(from: GenerationState, to: GenerationState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Check if a specific transition is valid from the current state */
export function isValidTransition(
  state: GenerationMachineState,
  to: GenerationState,
): boolean {
  return canTransition(state.current, to);
}

/** Get all valid next states from current state */
export function getValidTransitions(
  state: GenerationMachineState,
): GenerationState[] {
  return TRANSITIONS[state.current] ?? [];
}
