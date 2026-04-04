/**
 * GenerationWizardDialog — 3-stage world generation wizard
 *
 * Stages: Towns → Roads & Zones → Population
 * Each stage independently generates and previews content with 3D viewport
 * ghost overlays. Re-roll per stage with cascading invalidation.
 */

import {
  X,
  Wand2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  MapPin,
  Skull,
  TreePine,
  RefreshCw,
  Check,
  Home,
  Route,
  Users,
  AlertTriangle,
} from "lucide-react";
import React, { useState, useCallback, useReducer, useRef } from "react";

import type { AutoGenConfig, AutoGenResult } from "../types";
import {
  useZoneAutoGen,
  DEFAULT_AUTOGEN_CONFIG,
  DEFAULT_TIERS,
  mergeStageResults,
  type TownStageResult,
  type RoadZoneStageResult,
  type PopulationStageResult,
} from "../hooks/useZoneAutoGen";
import { useWorldStudio, type WizardPreviewData } from "../WorldStudioContext";
import {
  machineReducer,
  createInitialMachineState,
  WIZARD_STEPS,
} from "../utils/generationStateMachine";

// ============== TYPES ==============

export type WizardMode = "full" | "zones-only" | "population-only";

interface GenerationWizardDialogProps {
  open: boolean;
  onClose: () => void;
  mode: WizardMode;
}

// Step icons for the 3 stages
const STEP_ICONS = [Home, Route, Users];

// ============== COMPONENT ==============

export function GenerationWizardDialog({
  open,
  onClose,
  mode,
}: GenerationWizardDialogProps) {
  const {
    generateTownStage,
    generateRoadZoneStage,
    generatePopulationStage,
    apply,
  } = useZoneAutoGen();
  const { state: studioState, actions } = useWorldStudio();
  const manifestsLoaded = studioState.manifests.loaded;
  const [machine, dispatch] = useReducer(
    machineReducer,
    createInitialMachineState(),
  );
  const [config, setConfig] = useState<AutoGenConfig>({
    ...DEFAULT_AUTOGEN_CONFIG,
  });

  // Per-stage config overrides
  const [townCount, setTownCount] = useState(4);
  const [minTownSpacing, setMinTownSpacing] = useState(400);
  const [townSeed, setTownSeed] = useState(DEFAULT_AUTOGEN_CONFIG.seed);
  const [rzSeed, setRzSeed] = useState(DEFAULT_AUTOGEN_CONFIG.seed);

  // Stage results stored locally (also mirrored in machine.stageResults)
  const stageResultsRef = useRef<{
    towns?: TownStageResult;
    roadsZones?: RoadZoneStageResult;
    population?: PopulationStageResult;
  }>({});

  // Read world town config defaults on open
  React.useEffect(() => {
    if (open) {
      dispatch({ type: "RESET" });
      dispatch({ type: "START_CONFIGURE" });
      stageResultsRef.current = {};

      // Initialize from world config if available
      const world = studioState.builder.editing.world;
      if (world?.foundation.config.towns) {
        setTownCount(world.foundation.config.towns.townCount);
        setMinTownSpacing(world.foundation.config.towns.minTownSpacing);
      }
      const seed = world?.foundation.config.seed ?? DEFAULT_AUTOGEN_CONFIG.seed;
      setTownSeed(seed);
      setRzSeed(seed);
      setConfig({ ...DEFAULT_AUTOGEN_CONFIG, seed });

      // For zones-only / population-only, pre-fill town result from existing towns
      if (mode === "zones-only" || mode === "population-only") {
        // Skip to step 1 for zones-only, step 2 for population-only
        // Pre-fill towns from existing foundation
        const existingTownResult = generateTownStage(
          { ...DEFAULT_AUTOGEN_CONFIG, seed },
          { seed },
        );
        if (existingTownResult) {
          stageResultsRef.current.towns = existingTownResult;
          dispatch({
            type: "SET_STAGE_RESULT",
            stepIndex: 0,
            result: existingTownResult,
          });
          // Mark step 0 as complete and jump
          dispatch({ type: "GENERATION_COMPLETE" });
          if (mode === "zones-only") {
            dispatch({ type: "NEXT_STEP" });
          } else {
            // population-only: also need road/zone result
            const rzResult = generateRoadZoneStage(
              { ...DEFAULT_AUTOGEN_CONFIG, seed },
              existingTownResult,
            );
            if (rzResult) {
              stageResultsRef.current.roadsZones = rzResult;
              dispatch({
                type: "SET_STAGE_RESULT",
                stepIndex: 1,
                result: rzResult,
              });
            }
            dispatch({ type: "NEXT_STEP" }); // to step 1
            dispatch({ type: "START_GENERATE" });
            dispatch({ type: "GENERATION_COMPLETE" });
            dispatch({ type: "NEXT_STEP" }); // to step 2
          }
        }
      }
    }
    // Clear preview on close
    return () => {
      actions.clearWizardPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updatePreview = useCallback(() => {
    const vp = studioState.builder.editing.world
      ? (actions as Record<string, unknown>)
      : null;
    const offset =
      ((studioState.builder.editing.world?.foundation.config.terrain
        .worldSize ?? 0) *
        (studioState.builder.editing.world?.foundation.config.terrain
          .tileSize ?? 1)) /
      2;

    const preview: WizardPreviewData = {
      towns: stageResultsRef.current.towns,
      roadsZones: stageResultsRef.current.roadsZones,
      population: stageResultsRef.current.population,
      worldCenterOffset: offset,
    };
    actions.setWizardPreview(preview);
  }, [studioState.builder.editing.world, actions]);

  const handleGenerate = useCallback(() => {
    dispatch({ type: "START_GENERATE" });

    requestAnimationFrame(() => {
      try {
        const step = machine.stepIndex;

        if (step === 0) {
          // Town stage
          dispatch({
            type: "GENERATION_PROGRESS",
            progress: 30,
            label: "Scanning land and placing towns...",
          });
          const result = generateTownStage(config, {
            seed: townSeed,
            townCount,
            minTownSpacing,
          });
          if (!result) {
            dispatch({
              type: "FAIL",
              message: "No land found or viewport not ready.",
            });
            return;
          }
          stageResultsRef.current.towns = result;
          dispatch({ type: "SET_STAGE_RESULT", stepIndex: 0, result });
          dispatch({ type: "GENERATION_COMPLETE" });
          updatePreview();
        } else if (step === 1) {
          // Roads + Zones stage
          const townResult = stageResultsRef.current.towns;
          if (!townResult) {
            dispatch({
              type: "FAIL",
              message: "Town stage must be completed first.",
            });
            return;
          }
          dispatch({
            type: "GENERATION_PROGRESS",
            progress: 30,
            label: "Sampling difficulty grid...",
          });
          const result = generateRoadZoneStage(config, townResult, {
            seed: rzSeed,
          });
          if (!result) {
            dispatch({
              type: "FAIL",
              message: "Road/zone generation failed.",
            });
            return;
          }
          stageResultsRef.current.roadsZones = result;
          dispatch({ type: "SET_STAGE_RESULT", stepIndex: 1, result });
          dispatch({ type: "GENERATION_COMPLETE" });
          updatePreview();
        } else if (step === 2) {
          // Population stage
          const townResult = stageResultsRef.current.towns;
          const rzResult = stageResultsRef.current.roadsZones;
          if (!townResult || !rzResult) {
            dispatch({
              type: "FAIL",
              message: "Previous stages must be completed first.",
            });
            return;
          }
          dispatch({
            type: "GENERATION_PROGRESS",
            progress: 30,
            label: "Populating entities...",
          });
          const result = generatePopulationStage(config, townResult, rzResult);
          if (!result) {
            dispatch({
              type: "FAIL",
              message: "Population generation failed.",
            });
            return;
          }
          stageResultsRef.current.population = result;
          dispatch({ type: "SET_STAGE_RESULT", stepIndex: 2, result });
          dispatch({ type: "GENERATION_COMPLETE" });
          updatePreview();
        }
      } catch (err) {
        dispatch({
          type: "FAIL",
          message: err instanceof Error ? err.message : "Generation failed",
        });
      }
    });
  }, [
    machine.stepIndex,
    config,
    townSeed,
    townCount,
    minTownSpacing,
    rzSeed,
    generateTownStage,
    generateRoadZoneStage,
    generatePopulationStage,
    updatePreview,
  ]);

  const handleReroll = useCallback(() => {
    const step = machine.stepIndex;
    // New seed for this stage
    const newSeed = Math.floor(Math.random() * 999999);
    if (step === 0) {
      setTownSeed(newSeed);
    } else if (step === 1) {
      setRzSeed(newSeed);
    } else {
      setConfig((c) => ({ ...c, seed: newSeed }));
    }
    // Clear downstream results
    dispatch({ type: "REGENERATE_STEP", stepIndex: step });
    if (step <= 0) {
      delete stageResultsRef.current.towns;
      delete stageResultsRef.current.roadsZones;
      delete stageResultsRef.current.population;
    } else if (step <= 1) {
      delete stageResultsRef.current.roadsZones;
      delete stageResultsRef.current.population;
    } else {
      delete stageResultsRef.current.population;
    }
    updatePreview();
  }, [machine.stepIndex, updatePreview]);

  const handleApply = useCallback(() => {
    const townResult = stageResultsRef.current.towns;
    const rzResult = stageResultsRef.current.roadsZones;
    const popResult = stageResultsRef.current.population;
    if (!townResult || !rzResult || !popResult) return;

    dispatch({ type: "START_APPLY" });
    try {
      const merged: AutoGenResult = mergeStageResults(
        townResult,
        rzResult,
        popResult,
        config,
        0,
      );
      apply(merged);
      actions.clearWizardPreview();
      dispatch({ type: "APPLY_COMPLETE", batchId: `wizard-${Date.now()}` });
    } catch (err) {
      dispatch({
        type: "FAIL",
        message: err instanceof Error ? err.message : "Apply failed",
      });
    }
  }, [apply, config, actions]);

  const handleClose = useCallback(() => {
    dispatch({ type: "RESET" });
    stageResultsRef.current = {};
    actions.clearWizardPreview();
    onClose();
  }, [onClose, actions]);

  if (!open) return null;

  const currentStep = WIZARD_STEPS[machine.stepIndex];
  const isFirstStep = machine.stepIndex === 0;
  const isLastStep = machine.stepIndex === WIZARD_STEPS.length - 1;
  const isGenerating = machine.current === "generating";
  const isPreviewing = machine.current === "previewing";
  const isComplete = machine.current === "complete";
  const isError = machine.current === "error";
  const allStagesComplete =
    machine.completedSteps.has(0) &&
    machine.completedSteps.has(1) &&
    machine.completedSteps.has(2);

  const modeTitle =
    mode === "zones-only"
      ? "Generate Zones"
      : mode === "population-only"
        ? "Populate World"
        : "Generate World";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-primary border border-border-primary rounded-lg shadow-2xl w-[900px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-primary" />
            <span className="text-sm font-semibold text-text-primary">
              {modeTitle}
            </span>
          </div>
          <button
            className="p-1 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary"
            onClick={handleClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Step Bar */}
        <div className="px-4 py-2 border-b border-border-primary flex-shrink-0">
          <StepBar
            steps={WIZARD_STEPS}
            currentIndex={machine.stepIndex}
            completedSteps={machine.completedSteps}
            onJump={(idx) => dispatch({ type: "JUMP_TO_STEP", stepIndex: idx })}
          />
        </div>

        {/* Manifest loading warning */}
        {!manifestsLoaded && (
          <div className="mx-4 mt-2 px-3 py-2 rounded bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
            <span className="text-[11px] text-amber-300">
              Game manifests not loaded yet. Entity population requires manifest
              data.
            </span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isGenerating ? (
            <GeneratingView
              progress={machine.progress}
              label={machine.progressLabel}
              onCancel={() => dispatch({ type: "CANCEL" })}
            />
          ) : isError ? (
            <ErrorView
              message={machine.errorMessage ?? "Unknown error"}
              recoverable={machine.recoverable}
              onRetry={() => dispatch({ type: "RETRY" })}
              onCancel={handleClose}
            />
          ) : isComplete ? (
            <CompleteView
              stageResults={stageResultsRef.current}
              onClose={handleClose}
            />
          ) : (
            <div className="flex min-h-[400px]">
              {/* Left: Config panel */}
              <div className="w-[280px] border-r border-border-primary p-4 overflow-y-auto flex-shrink-0">
                <StageConfigPanel
                  stepIndex={machine.stepIndex}
                  config={config}
                  onConfigChange={setConfig}
                  townCount={townCount}
                  onTownCountChange={setTownCount}
                  minTownSpacing={minTownSpacing}
                  onMinTownSpacingChange={setMinTownSpacing}
                  townSeed={townSeed}
                  onTownSeedChange={setTownSeed}
                  rzSeed={rzSeed}
                  onRzSeedChange={setRzSeed}
                />
              </div>
              {/* Right: Preview/Stats */}
              <div className="flex-1 p-4 overflow-y-auto">
                {isPreviewing ? (
                  <StagePreviewPanel
                    stepIndex={machine.stepIndex}
                    stageResults={stageResultsRef.current}
                  />
                ) : (
                  <StagePlaceholder
                    stepIndex={machine.stepIndex}
                    hasPriorStages={
                      machine.stepIndex === 0 ||
                      (machine.stepIndex === 1 &&
                        machine.completedSteps.has(0)) ||
                      (machine.stepIndex === 2 &&
                        machine.completedSteps.has(0) &&
                        machine.completedSteps.has(1))
                    }
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isComplete && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary flex-shrink-0">
            <div className="flex items-center gap-2">
              {!isFirstStep && !isGenerating && !isError && (
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                  onClick={() => dispatch({ type: "PREV_STEP" })}
                >
                  <ChevronLeft size={14} /> Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Re-roll button */}
              {isPreviewing && (
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary border border-border-primary"
                  onClick={handleReroll}
                >
                  <RefreshCw size={12} /> Re-roll
                </button>
              )}
              {/* Generate button */}
              {machine.current === "configuring" && (
                <button
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90"
                  onClick={handleGenerate}
                >
                  Generate {currentStep?.name ?? ""} <ChevronRight size={14} />
                </button>
              )}
              {/* Next step button */}
              {isPreviewing && !isLastStep && (
                <button
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90"
                  onClick={() => dispatch({ type: "NEXT_STEP" })}
                >
                  Next: {WIZARD_STEPS[machine.stepIndex + 1]?.name ?? ""}{" "}
                  <ChevronRight size={14} />
                </button>
              )}
              {/* Apply button */}
              {isPreviewing && isLastStep && allStagesComplete && (
                <button
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-500"
                  onClick={handleApply}
                >
                  <Check size={14} /> Apply to World
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============== STEP BAR ==============

function StepBar({
  steps,
  currentIndex,
  completedSteps,
  onJump,
}: {
  steps: typeof WIZARD_STEPS;
  currentIndex: number;
  completedSteps: Set<number>;
  onJump: (idx: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const isCompleted = completedSteps.has(step.index);
        const isCurrent = step.index === currentIndex;
        const Icon = STEP_ICONS[step.index] ?? Route;
        const canClick = isCompleted || step.index <= currentIndex;

        return (
          <React.Fragment key={step.index}>
            {i > 0 && (
              <div
                className={`flex-1 h-px mx-1 ${isCompleted ? "bg-green-500" : "bg-border-primary border-t border-dashed border-border-secondary"}`}
              />
            )}
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] transition-colors ${
                isCurrent
                  ? "bg-primary/15 text-primary font-medium"
                  : isCompleted
                    ? "text-green-400 hover:bg-bg-tertiary cursor-pointer"
                    : "text-text-tertiary cursor-default"
              }`}
              onClick={() => canClick && onJump(step.index)}
              disabled={!canClick}
            >
              {isCompleted ? (
                <Check size={12} className="text-green-400" />
              ) : (
                <Icon size={12} />
              )}
              {step.name}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============== GENERATING VIEW ==============

function GeneratingView({
  progress,
  label,
  onCancel,
}: {
  progress: number;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <Loader2 size={32} className="text-primary animate-spin" />
      <div className="text-sm text-text-primary font-medium">
        {label || "Generating..."}
      </div>
      <div className="w-64 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[10px] text-text-tertiary tabular-nums">
        {Math.round(progress)}%
      </span>
      <button
        className="text-xs text-text-tertiary hover:text-text-secondary mt-4"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}

// ============== ERROR VIEW ==============

function ErrorView({
  message,
  recoverable,
  onRetry,
  onCancel,
}: {
  message: string;
  recoverable: boolean;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
        <AlertTriangle size={24} className="text-red-400" />
      </div>
      <div className="text-sm text-text-primary font-medium">
        Generation Failed
      </div>
      <p className="text-xs text-text-secondary max-w-md text-center">
        {message}
      </p>
      <div className="flex items-center gap-2">
        {recoverable && (
          <button
            className="px-4 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90"
            onClick={onRetry}
          >
            Retry
          </button>
        )}
        <button
          className="px-4 py-1.5 rounded bg-bg-tertiary text-text-primary text-xs hover:bg-bg-secondary"
          onClick={onCancel}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ============== COMPLETE VIEW ==============

function CompleteView({
  stageResults,
  onClose,
}: {
  stageResults: {
    towns?: TownStageResult;
    roadsZones?: RoadZoneStageResult;
    population?: PopulationStageResult;
  };
  onClose: () => void;
}) {
  const townCount = stageResults.towns?.generatedTowns.length ?? 0;
  const zoneCount = stageResults.roadsZones?.stats.zonesGenerated ?? 0;
  const mobCount = stageResults.population?.stats.totalMobs ?? 0;
  const resCount = stageResults.population?.stats.totalResources ?? 0;
  const roadCount = stageResults.roadsZones?.roads.length ?? 0;

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-3">
      <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
        <Check size={24} className="text-green-400" />
      </div>
      <h3 className="text-sm font-semibold text-text-primary">
        World Generation Complete
      </h3>
      <p className="text-xs text-text-secondary max-w-sm text-center">
        Created {townCount} towns, {zoneCount} zones, {roadCount} roads,{" "}
        {mobCount} mob spawns, and {resCount} resources. All entities tagged{" "}
        <code className="bg-bg-tertiary px-1 rounded">source: procgen</code>.
      </p>
      <button
        className="px-4 py-1.5 rounded bg-bg-tertiary text-text-primary text-xs font-medium hover:bg-bg-secondary mt-2"
        onClick={onClose}
      >
        Done
      </button>
    </div>
  );
}

// ============== STAGE CONFIG PANELS ==============

function StageConfigPanel({
  stepIndex,
  config,
  onConfigChange,
  townCount,
  onTownCountChange,
  minTownSpacing,
  onMinTownSpacingChange,
  townSeed,
  onTownSeedChange,
  rzSeed,
  onRzSeedChange,
}: {
  stepIndex: number;
  config: AutoGenConfig;
  onConfigChange: (c: AutoGenConfig) => void;
  townCount: number;
  onTownCountChange: (n: number) => void;
  minTownSpacing: number;
  onMinTownSpacingChange: (n: number) => void;
  townSeed: number;
  onTownSeedChange: (n: number) => void;
  rzSeed: number;
  onRzSeedChange: (n: number) => void;
}) {
  if (stepIndex === 0) {
    return (
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-text-primary">Towns</h4>
        <p className="text-[10px] text-text-tertiary">
          Generate towns with strategic placement: starter town near origin, one
          per biome, then fill remaining slots for coverage.
        </p>
        <div className="space-y-2">
          <ConfigField
            label="Seed"
            type="number"
            value={townSeed}
            onChange={onTownSeedChange}
            suffix={
              <button
                className="p-0.5 rounded hover:bg-bg-secondary text-text-tertiary"
                onClick={() =>
                  onTownSeedChange(Math.floor(Math.random() * 999999))
                }
              >
                <RefreshCw size={10} />
              </button>
            }
          />
          <ConfigField
            label="Town Count"
            type="number"
            value={townCount}
            onChange={(v) => onTownCountChange(Math.max(1, Math.min(8, v)))}
            min={1}
            max={8}
          />
          <ConfigField
            label="Min Spacing (m)"
            type="number"
            value={minTownSpacing}
            onChange={(v) =>
              onMinTownSpacingChange(Math.max(200, Math.min(800, v)))
            }
            min={200}
            max={800}
          />
        </div>
      </div>
    );
  }

  if (stepIndex === 1) {
    return (
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-text-primary">Roads & Zones</h4>
        <p className="text-[10px] text-text-tertiary">
          Generate difficulty zones via flood-fill + road network between towns.
          Zones are graded by distance from towns + biome modifiers.
        </p>
        <div className="space-y-2">
          <ConfigField
            label="Seed"
            type="number"
            value={rzSeed}
            onChange={onRzSeedChange}
            suffix={
              <button
                className="p-0.5 rounded hover:bg-bg-secondary text-text-tertiary"
                onClick={() =>
                  onRzSeedChange(Math.floor(Math.random() * 999999))
                }
              >
                <RefreshCw size={10} />
              </button>
            }
          />
          <ConfigField
            label="Grid Resolution (m)"
            type="number"
            value={config.gridResolution}
            onChange={(v) =>
              onConfigChange({
                ...config,
                gridResolution: Math.max(5, Math.min(50, v)),
              })
            }
            min={5}
            max={50}
          />
          <ConfigField
            label="Min Zone Area (m²)"
            type="number"
            value={config.minZoneArea}
            onChange={(v) =>
              onConfigChange({
                ...config,
                minZoneArea: Math.max(100, Math.min(50000, v)),
              })
            }
            min={100}
            max={50000}
          />
          <ConfigField
            label="Max Zone Span (m)"
            type="number"
            value={config.maxZoneSpan}
            onChange={(v) =>
              onConfigChange({
                ...config,
                maxZoneSpan: Math.max(50, Math.min(1000, v)),
              })
            }
            min={50}
            max={1000}
          />
        </div>
        {/* Tier summary */}
        <div className="space-y-1">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
            Tiers
          </span>
          {config.tiers.map((tier) => (
            <div
              key={tier.name}
              className="flex items-center gap-2 text-[10px]"
            >
              <div
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: tier.color }}
              />
              <span className="text-text-secondary">{tier.name}</span>
              <span className="text-text-tertiary ml-auto">
                {tier.scalarRange[0].toFixed(2)}-
                {tier.scalarRange[1].toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: Population
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-text-primary">
        Entity Population
      </h4>
      <p className="text-[10px] text-text-tertiary">
        Scatter mobs and resources across zones. Mobs placed first, then
        resources with mob-proximity buffer per tier.
      </p>
      <div className="space-y-2">
        <ConfigField
          label="Mob Spacing (m)"
          type="number"
          value={config.mobSpacing}
          onChange={(v) =>
            onConfigChange({
              ...config,
              mobSpacing: Math.max(5, Math.min(30, v)),
            })
          }
          min={5}
          max={30}
        />
        <ConfigField
          label="Resource Spacing (m)"
          type="number"
          value={config.resourceSpacing}
          onChange={(v) =>
            onConfigChange({
              ...config,
              resourceSpacing: Math.max(3, Math.min(20, v)),
            })
          }
          min={3}
          max={20}
        />
      </div>
      {/* Density presets */}
      <div>
        <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
          Density Preset
        </span>
        <div className="flex gap-1 mt-1">
          {(
            [
              { label: "Sparse", mob: 25, res: 15 },
              { label: "Normal", mob: 15, res: 8 },
              { label: "Dense", mob: 8, res: 4 },
            ] as const
          ).map((preset) => (
            <button
              key={preset.label}
              className={`px-2 py-1 rounded text-[10px] border ${
                config.mobSpacing === preset.mob &&
                config.resourceSpacing === preset.res
                  ? "border-primary text-primary bg-primary/10"
                  : "border-border-primary text-text-secondary hover:bg-bg-tertiary"
              }`}
              onClick={() =>
                onConfigChange({
                  ...config,
                  mobSpacing: preset.mob,
                  resourceSpacing: preset.res,
                })
              }
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============== STAGE PREVIEW PANELS ==============

function StagePreviewPanel({
  stepIndex,
  stageResults,
}: {
  stepIndex: number;
  stageResults: {
    towns?: TownStageResult;
    roadsZones?: RoadZoneStageResult;
    population?: PopulationStageResult;
  };
}) {
  if (stepIndex === 0 && stageResults.towns) {
    return <TownPreview data={stageResults.towns} />;
  }
  if (stepIndex === 1 && stageResults.roadsZones) {
    return <RoadZonePreview data={stageResults.roadsZones} />;
  }
  if (stepIndex === 2 && stageResults.population) {
    return (
      <PopulationPreview
        data={stageResults.population}
        zones={stageResults.roadsZones?.zones}
      />
    );
  }
  return null;
}

function TownPreview({ data }: { data: TownStageResult }) {
  const { generatedTowns, landBounds } = data;
  const landW = Math.round(landBounds.maxX - landBounds.minX);
  const landH = Math.round(landBounds.maxZ - landBounds.minZ);

  return (
    <div className="space-y-4">
      <div className="px-2 py-1.5 rounded bg-bg-tertiary text-xs text-text-secondary">
        Land area: {landW}m × {landH}m
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStatCard label="Towns" value={generatedTowns.length} icon={Home} />
        <MiniStatCard
          label="Buildings"
          value={generatedTowns.reduce((sum, t) => sum + t.buildings.length, 0)}
          icon={MapPin}
        />
        <MiniStatCard
          label="Landmarks"
          value={generatedTowns.reduce(
            (sum, t) => sum + (t.landmarks?.length ?? 0),
            0,
          )}
          icon={MapPin}
        />
      </div>

      <div>
        <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
          Towns ({generatedTowns.length})
        </h4>
        <div className="space-y-1">
          {generatedTowns.map((town) => (
            <div
              key={town.id}
              className="flex items-center justify-between px-2 py-1.5 rounded bg-bg-tertiary text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Home size={12} className="text-amber-400 flex-shrink-0" />
                <span className="text-text-primary font-medium truncate">
                  {town.name}
                </span>
              </div>
              <div className="flex items-center gap-3 text-text-tertiary flex-shrink-0 ml-2 tabular-nums">
                <span className="capitalize">{town.size}</span>
                <span>{town.biome}</span>
                <span>{town.buildings.length} bldg</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoadZonePreview({ data }: { data: RoadZoneStageResult }) {
  const { zones, roads, stats } = data;

  return (
    <div className="space-y-4">
      <div className="px-2 py-1.5 rounded bg-bg-tertiary text-xs text-text-secondary">
        {Math.round(stats.totalArea).toLocaleString()}m² zoned
        <span className="text-text-tertiary ml-1">
          ({stats.zoneMerged} zones merged)
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStatCard
          label="Zones"
          value={stats.zonesGenerated}
          icon={MapPin}
        />
        <MiniStatCard label="Roads" value={roads.length} icon={Route} />
        <MiniStatCard
          label="Road Length"
          value={`${Math.round(
            roads.reduce(
              (sum, r) =>
                sum +
                r.path.reduce((len, p, i) => {
                  if (i === 0) return 0;
                  const prev = r.path[i - 1];
                  return (
                    len + Math.sqrt((p.x - prev.x) ** 2 + (p.z - prev.z) ** 2)
                  );
                }, 0),
              0,
            ),
          )}m`}
          icon={Route}
        />
      </div>

      {/* Tier breakdown */}
      <div>
        <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
          Tier Breakdown
        </h4>
        <div className="space-y-0.5">
          {stats.tierBreakdown
            .filter((tb) => tb.zoneCount > 0)
            .map((tb) => (
              <div
                key={tb.tierName}
                className="flex items-center justify-between px-2 py-1 rounded bg-bg-tertiary text-xs"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-sm"
                    style={{
                      backgroundColor:
                        DEFAULT_TIERS.find((t) => t.name === tb.tierName)
                          ?.color ?? "#888",
                    }}
                  />
                  <span className="text-text-primary font-medium">
                    {tb.tierName}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-text-secondary tabular-nums">
                  <span>{tb.zoneCount} zones</span>
                  <span>{Math.round(tb.area).toLocaleString()}m²</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Zone list */}
      <div>
        <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
          Zones ({zones.length})
        </h4>
        <div className="max-h-[180px] overflow-y-auto space-y-px border border-border-primary rounded">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="flex items-center justify-between px-2 py-1 text-xs hover:bg-bg-tertiary"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{
                    backgroundColor:
                      DEFAULT_TIERS[zone.tierIndex]?.color ?? "#888",
                  }}
                />
                <span className="text-text-primary truncate">{zone.name}</span>
              </div>
              <div className="flex items-center gap-2 text-text-tertiary flex-shrink-0 ml-2 tabular-nums">
                <span>{zone.biome}</span>
                <span>{Math.round(zone.area).toLocaleString()}m²</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PopulationPreview({
  data,
  zones,
}: {
  data: PopulationStageResult;
  zones?: RoadZoneStageResult["zones"];
}) {
  const { mobSpawns, resources, stats } = data;

  // Count entities by type
  const mobCounts = new Map<string, number>();
  for (const m of mobSpawns) {
    mobCounts.set(m.name, (mobCounts.get(m.name) ?? 0) + 1);
  }
  const resCounts = new Map<string, number>();
  for (const r of resources) {
    resCounts.set(r.name, (resCounts.get(r.name) ?? 0) + 1);
  }

  // Tier distribution
  const tierDistribution = new Map<
    string,
    { mobs: number; resources: number }
  >();
  if (zones) {
    for (const zone of zones) {
      const tierName = DEFAULT_TIERS[zone.tierIndex]?.name ?? "Unknown";
      const entry = tierDistribution.get(tierName) ?? {
        mobs: 0,
        resources: 0,
      };
      entry.mobs += mobSpawns.filter(
        (m) => m.sourceRegionId === zone.id,
      ).length;
      entry.resources += resources.filter(
        (r) => r.sourceRegionId === zone.id,
      ).length;
      tierDistribution.set(tierName, entry);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <MiniStatCard label="Mobs" value={stats.totalMobs} icon={Skull} />
        <MiniStatCard
          label="Resources"
          value={stats.totalResources}
          icon={TreePine}
        />
      </div>

      {/* Tier distribution */}
      {tierDistribution.size > 0 && (
        <div>
          <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
            Entities by Tier
          </h4>
          <div className="space-y-0.5">
            {[...tierDistribution.entries()]
              .filter(([, v]) => v.mobs > 0 || v.resources > 0)
              .map(([tierName, counts]) => (
                <div
                  key={tierName}
                  className="flex items-center justify-between px-2 py-1 rounded bg-bg-tertiary text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-sm"
                      style={{
                        backgroundColor:
                          DEFAULT_TIERS.find((t) => t.name === tierName)
                            ?.color ?? "#888",
                      }}
                    />
                    <span className="text-text-primary font-medium">
                      {tierName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-text-secondary tabular-nums">
                    <span>{counts.mobs} mobs</span>
                    <span>{counts.resources} res</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Mob types */}
      <div>
        <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
          Mob Types ({mobCounts.size})
        </h4>
        <div className="max-h-[120px] overflow-y-auto space-y-px border border-border-primary rounded">
          {[...mobCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => (
              <div
                key={name}
                className="flex items-center justify-between px-2 py-1 text-xs hover:bg-bg-tertiary"
              >
                <span className="text-text-primary">{name}</span>
                <span className="text-text-tertiary tabular-nums">
                  ×{count}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Resource types */}
      <div>
        <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
          Resource Types ({resCounts.size})
        </h4>
        <div className="max-h-[120px] overflow-y-auto space-y-px border border-border-primary rounded">
          {[...resCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => (
              <div
                key={name}
                className="flex items-center justify-between px-2 py-1 text-xs hover:bg-bg-tertiary"
              >
                <span className="text-text-primary">{name}</span>
                <span className="text-text-tertiary tabular-nums">
                  ×{count}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ============== PLACEHOLDER ==============

function StagePlaceholder({
  stepIndex,
  hasPriorStages,
}: {
  stepIndex: number;
  hasPriorStages: boolean;
}) {
  const descriptions: Record<number, string> = {
    0: "Configure town count and spacing, then generate to place towns on the terrain.",
    1: "Generate difficulty zones and road network based on town placement.",
    2: "Populate mobs and resources across the generated zones.",
  };

  const Icon = STEP_ICONS[stepIndex] ?? Route;

  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12">
      <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center mb-3">
        <Icon size={20} className="text-text-tertiary" />
      </div>
      <span className="text-xs text-text-secondary">
        {descriptions[stepIndex] ?? "Click Generate to continue."}
      </span>
      {!hasPriorStages && stepIndex > 0 && (
        <span className="text-[10px] text-amber-400 mt-2">
          Complete previous stages first.
        </span>
      )}
    </div>
  );
}

// ============== SHARED UI PRIMITIVES ==============

function MiniStatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof MapPin;
}) {
  return (
    <div className="bg-bg-tertiary rounded p-2 text-center">
      <Icon size={12} className="mx-auto text-text-tertiary mb-0.5" />
      <div className="text-xs font-semibold text-text-primary">{value}</div>
      <div className="text-[9px] text-text-tertiary">{label}</div>
    </div>
  );
}

function ConfigField({
  label,
  type,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  type: "number";
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] text-text-tertiary uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-center gap-1 mt-0.5">
        <input
          type={type}
          className="flex-1 bg-bg-tertiary border border-border-primary rounded px-2 py-1 text-xs text-text-primary w-full"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        />
        {suffix}
      </div>
    </div>
  );
}
