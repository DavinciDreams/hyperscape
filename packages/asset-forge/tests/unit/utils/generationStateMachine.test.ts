import { describe, it, expect } from "vitest";
import {
  createInitialMachineState,
  machineReducer,
  isValidTransition,
  getValidTransitions,
  WIZARD_STEPS,
  type GenerationMachineState,
  type MachineAction,
} from "@/components/WorldStudio/utils/generationStateMachine";

// ────────────────────────────────────────
// createInitialMachineState
// ────────────────────────────────────────

describe("createInitialMachineState", () => {
  it("starts in idle state", () => {
    const state = createInitialMachineState();
    expect(state.current).toBe("idle");
  });

  it("starts at step 0", () => {
    const state = createInitialMachineState();
    expect(state.stepIndex).toBe(0);
  });

  it("starts with 0 progress", () => {
    const state = createInitialMachineState();
    expect(state.progress).toBe(0);
  });

  it("has no error message", () => {
    const state = createInitialMachineState();
    expect(state.errorMessage).toBeNull();
  });

  it("has empty completed steps", () => {
    const state = createInitialMachineState();
    expect(state.completedSteps.size).toBe(0);
  });

  it("has no batch ID", () => {
    const state = createInitialMachineState();
    expect(state.batchId).toBeNull();
  });

  it("has empty stage results", () => {
    const state = createInitialMachineState();
    expect(state.stageResults).toEqual({});
  });
});

// ────────────────────────────────────────
// WIZARD_STEPS
// ────────────────────────────────────────

describe("WIZARD_STEPS", () => {
  it("has exactly 3 steps", () => {
    expect(WIZARD_STEPS).toHaveLength(3);
  });

  it("has sequential zero-based indices", () => {
    WIZARD_STEPS.forEach((step, i) => {
      expect(step.index).toBe(i);
    });
  });

  it("has named steps: Towns, Roads & Zones, Population", () => {
    expect(WIZARD_STEPS[0].name).toBe("Towns");
    expect(WIZARD_STEPS[1].name).toBe("Roads & Zones");
    expect(WIZARD_STEPS[2].name).toBe("Population");
  });
});

// ────────────────────────────────────────
// isValidTransition
// ────────────────────────────────────────

describe("isValidTransition", () => {
  it("allows idle -> configuring", () => {
    const state = createInitialMachineState();
    expect(isValidTransition(state, "configuring")).toBe(true);
  });

  it("disallows idle -> generating (must configure first)", () => {
    const state = createInitialMachineState();
    expect(isValidTransition(state, "generating")).toBe(false);
  });

  it("disallows idle -> applying", () => {
    const state = createInitialMachineState();
    expect(isValidTransition(state, "applying")).toBe(false);
  });

  it("allows configuring -> generating", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
    };
    expect(isValidTransition(state, "generating")).toBe(true);
  });

  it("allows configuring -> idle (cancel)", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
    };
    expect(isValidTransition(state, "idle")).toBe(true);
  });

  it("allows generating -> previewing", () => {
    const state = {
      ...createInitialMachineState(),
      current: "generating" as const,
    };
    expect(isValidTransition(state, "previewing")).toBe(true);
  });

  it("allows generating -> error", () => {
    const state = {
      ...createInitialMachineState(),
      current: "generating" as const,
    };
    expect(isValidTransition(state, "error")).toBe(true);
  });

  it("allows previewing -> applying", () => {
    const state = {
      ...createInitialMachineState(),
      current: "previewing" as const,
    };
    expect(isValidTransition(state, "applying")).toBe(true);
  });

  it("allows error -> configuring (retry)", () => {
    const state = { ...createInitialMachineState(), current: "error" as const };
    expect(isValidTransition(state, "configuring")).toBe(true);
  });

  it("allows error -> idle (cancel)", () => {
    const state = { ...createInitialMachineState(), current: "error" as const };
    expect(isValidTransition(state, "idle")).toBe(true);
  });
});

// ────────────────────────────────────────
// getValidTransitions
// ────────────────────────────────────────

describe("getValidTransitions", () => {
  it("returns [configuring] from idle", () => {
    const state = createInitialMachineState();
    expect(getValidTransitions(state)).toEqual(["configuring"]);
  });

  it("returns [generating, idle] from configuring", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
    };
    expect(getValidTransitions(state)).toEqual(["generating", "idle"]);
  });

  it("returns [configuring, idle] from complete", () => {
    const state = {
      ...createInitialMachineState(),
      current: "complete" as const,
    };
    expect(getValidTransitions(state)).toEqual(["configuring", "idle"]);
  });
});

// ────────────────────────────────────────
// machineReducer — happy path
// ────────────────────────────────────────

describe("machineReducer — happy path flow", () => {
  it("idle -> configuring via START_CONFIGURE", () => {
    const state = createInitialMachineState();
    const next = machineReducer(state, { type: "START_CONFIGURE" });
    expect(next.current).toBe("configuring");
    expect(next.errorMessage).toBeNull();
  });

  it("configuring -> generating via START_GENERATE", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
    };
    const next = machineReducer(state, { type: "START_GENERATE" });
    expect(next.current).toBe("generating");
    expect(next.progress).toBe(0);
  });

  it("tracks progress during generation", () => {
    const state = {
      ...createInitialMachineState(),
      current: "generating" as const,
    };
    const next = machineReducer(state, {
      type: "GENERATION_PROGRESS",
      progress: 42,
      label: "Flood filling zones...",
    });
    expect(next.progress).toBe(42);
    expect(next.progressLabel).toBe("Flood filling zones...");
  });

  it("generating -> previewing via GENERATION_COMPLETE", () => {
    const state = {
      ...createInitialMachineState(),
      current: "generating" as const,
      stepIndex: 1,
    };
    const next = machineReducer(state, { type: "GENERATION_COMPLETE" });
    expect(next.current).toBe("previewing");
    expect(next.progress).toBe(100);
    expect(next.completedSteps.has(1)).toBe(true);
  });

  it("previewing -> applying via START_APPLY", () => {
    const state = {
      ...createInitialMachineState(),
      current: "previewing" as const,
    };
    const next = machineReducer(state, { type: "START_APPLY" });
    expect(next.current).toBe("applying");
    expect(next.progress).toBe(0);
  });

  it("applying -> complete via APPLY_COMPLETE", () => {
    const state = {
      ...createInitialMachineState(),
      current: "applying" as const,
    };
    const next = machineReducer(state, {
      type: "APPLY_COMPLETE",
      batchId: "batch-123",
    });
    expect(next.current).toBe("complete");
    expect(next.batchId).toBe("batch-123");
    expect(next.progress).toBe(100);
  });
});

// ────────────────────────────────────────
// machineReducer — error & recovery
// ────────────────────────────────────────

describe("machineReducer — error handling", () => {
  it("generating -> error via FAIL", () => {
    const state = {
      ...createInitialMachineState(),
      current: "generating" as const,
    };
    const next = machineReducer(state, {
      type: "FAIL",
      message: "Terrain query failed",
    });
    expect(next.current).toBe("error");
    expect(next.errorMessage).toBe("Terrain query failed");
    expect(next.recoverable).toBe(true); // default
  });

  it("FAIL respects recoverable flag", () => {
    const state = {
      ...createInitialMachineState(),
      current: "applying" as const,
    };
    const next = machineReducer(state, {
      type: "FAIL",
      message: "Fatal",
      recoverable: false,
    });
    expect(next.recoverable).toBe(false);
  });

  it("RETRY returns to configuring when recoverable", () => {
    const state = {
      ...createInitialMachineState(),
      current: "error" as const,
      recoverable: true,
      errorMessage: "oops",
    };
    const next = machineReducer(state, { type: "RETRY" });
    expect(next.current).toBe("configuring");
    expect(next.errorMessage).toBeNull();
  });

  it("RETRY is no-op when not recoverable", () => {
    const state = {
      ...createInitialMachineState(),
      current: "error" as const,
      recoverable: false,
      errorMessage: "Fatal error",
    };
    const next = machineReducer(state, { type: "RETRY" });
    expect(next.current).toBe("error"); // unchanged
  });

  it("RETRY is no-op when not in error state", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
    };
    const next = machineReducer(state, { type: "RETRY" });
    expect(next.current).toBe("configuring"); // unchanged
  });
});

// ────────────────────────────────────────
// machineReducer — cancel & reset
// ────────────────────────────────────────

describe("machineReducer — cancel & reset", () => {
  it("CANCEL returns to idle and clears progress", () => {
    const state = {
      ...createInitialMachineState(),
      current: "generating" as const,
      progress: 50,
      progressLabel: "Working...",
    };
    const next = machineReducer(state, { type: "CANCEL" });
    expect(next.current).toBe("idle");
    expect(next.progress).toBe(0);
    expect(next.progressLabel).toBe("");
    expect(next.errorMessage).toBeNull();
  });

  it("RESET returns to full initial state", () => {
    const state = {
      ...createInitialMachineState(),
      current: "complete" as const,
      stepIndex: 2,
      progress: 100,
      batchId: "batch-1",
      completedSteps: new Set([0, 1, 2]),
    };
    const next = machineReducer(state, { type: "RESET" });
    expect(next).toEqual(createInitialMachineState());
  });
});

// ────────────────────────────────────────
// machineReducer — step navigation
// ────────────────────────────────────────

describe("machineReducer — step navigation", () => {
  it("NEXT_STEP increments stepIndex and enters configuring", () => {
    const state = {
      ...createInitialMachineState(),
      current: "complete" as const,
      stepIndex: 0,
    };
    const next = machineReducer(state, { type: "NEXT_STEP" });
    expect(next.stepIndex).toBe(1);
    expect(next.current).toBe("configuring");
  });

  it("NEXT_STEP is no-op at final step", () => {
    const state = {
      ...createInitialMachineState(),
      current: "complete" as const,
      stepIndex: WIZARD_STEPS.length - 1,
    };
    const next = machineReducer(state, { type: "NEXT_STEP" });
    expect(next.stepIndex).toBe(WIZARD_STEPS.length - 1); // unchanged
  });

  it("PREV_STEP decrements stepIndex", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
      stepIndex: 2,
    };
    const next = machineReducer(state, { type: "PREV_STEP" });
    expect(next.stepIndex).toBe(1);
    expect(next.current).toBe("configuring");
  });

  it("PREV_STEP is no-op at step 0", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
      stepIndex: 0,
    };
    const next = machineReducer(state, { type: "PREV_STEP" });
    expect(next.stepIndex).toBe(0); // unchanged
  });

  it("JUMP_TO_STEP works for completed steps", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
      stepIndex: 2,
      completedSteps: new Set([0, 1, 2]),
    };
    const next = machineReducer(state, { type: "JUMP_TO_STEP", stepIndex: 0 });
    expect(next.stepIndex).toBe(0);
    expect(next.current).toBe("configuring");
  });

  it("JUMP_TO_STEP disallows jumping forward to uncompleted step", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
      stepIndex: 0,
      completedSteps: new Set(),
    };
    const next = machineReducer(state, { type: "JUMP_TO_STEP", stepIndex: 2 });
    expect(next.stepIndex).toBe(0); // unchanged
  });

  it("JUMP_TO_STEP ignores invalid negative index", () => {
    const state = createInitialMachineState();
    const next = machineReducer(state, { type: "JUMP_TO_STEP", stepIndex: -1 });
    expect(next).toBe(state);
  });

  it("JUMP_TO_STEP ignores index beyond step count", () => {
    const state = createInitialMachineState();
    const next = machineReducer(state, {
      type: "JUMP_TO_STEP",
      stepIndex: WIZARD_STEPS.length,
    });
    expect(next).toBe(state);
  });
});

// ────────────────────────────────────────
// machineReducer — regenerate step
// ────────────────────────────────────────

describe("machineReducer — REGENERATE_STEP", () => {
  it("clears current step and all downstream completions", () => {
    const state = {
      ...createInitialMachineState(),
      current: "complete" as const,
      stepIndex: 2,
      completedSteps: new Set([0, 1, 2]),
      stageResults: {
        towns: { towns: [] } as never,
        roadsZones: { roads: [] } as never,
        population: { mobs: [] } as never,
      },
    };
    const next = machineReducer(state, {
      type: "REGENERATE_STEP",
      stepIndex: 1,
    });
    expect(next.stepIndex).toBe(1);
    expect(next.current).toBe("configuring");
    expect(next.completedSteps.has(0)).toBe(true); // preserved
    expect(next.completedSteps.has(1)).toBe(false); // cleared
    expect(next.completedSteps.has(2)).toBe(false); // downstream cleared
    expect(next.stageResults.towns).toBeDefined(); // preserved
    expect(next.stageResults.roadsZones).toBeUndefined(); // cleared
    expect(next.stageResults.population).toBeUndefined(); // cleared
  });

  it("clears all results when regenerating step 0", () => {
    const state = {
      ...createInitialMachineState(),
      current: "complete" as const,
      completedSteps: new Set([0, 1, 2]),
      stageResults: {
        towns: {} as never,
        roadsZones: {} as never,
        population: {} as never,
      },
    };
    const next = machineReducer(state, {
      type: "REGENERATE_STEP",
      stepIndex: 0,
    });
    expect(next.stageResults.towns).toBeUndefined();
    expect(next.stageResults.roadsZones).toBeUndefined();
    expect(next.stageResults.population).toBeUndefined();
  });

  it("ignores invalid step index", () => {
    const state = createInitialMachineState();
    expect(
      machineReducer(state, { type: "REGENERATE_STEP", stepIndex: -1 }),
    ).toBe(state);
    expect(
      machineReducer(state, {
        type: "REGENERATE_STEP",
        stepIndex: WIZARD_STEPS.length,
      }),
    ).toBe(state);
  });
});

// ────────────────────────────────────────
// machineReducer — invalid transitions are no-ops
// ────────────────────────────────────────

describe("machineReducer — invalid transitions are no-ops", () => {
  it("START_GENERATE from idle is no-op", () => {
    const state = createInitialMachineState();
    const next = machineReducer(state, { type: "START_GENERATE" });
    expect(next).toBe(state);
  });

  it("START_APPLY from idle is no-op", () => {
    const state = createInitialMachineState();
    const next = machineReducer(state, { type: "START_APPLY" });
    expect(next).toBe(state);
  });

  it("GENERATION_PROGRESS from configuring is no-op", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
    };
    const next = machineReducer(state, {
      type: "GENERATION_PROGRESS",
      progress: 50,
      label: "test",
    });
    expect(next).toBe(state);
  });

  it("GENERATION_COMPLETE from configuring is no-op", () => {
    const state = {
      ...createInitialMachineState(),
      current: "configuring" as const,
    };
    const next = machineReducer(state, { type: "GENERATION_COMPLETE" });
    expect(next).toBe(state);
  });
});
