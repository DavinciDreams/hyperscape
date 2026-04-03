/**
 * GenerationWizardDialog — 7-step world generation wizard
 *
 * Steps: Terrain → Towns → Roads → Zones → Population → POIs → Review
 * Each step: Configure → Generate (progress) → Preview (validation)
 * Uses generationStateMachine for state management.
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
  Mountain,
  Home,
  Route,
  Layers,
  Users,
  Landmark,
  FileCheck,
  AlertTriangle,
  SkipForward,
} from "lucide-react";
import React, { useState, useCallback, useReducer, useMemo } from "react";

import type {
  AutoGenConfig,
  AutoGenResult,
  DifficultyTierConfig,
} from "../types";
import {
  useZoneAutoGen,
  DEFAULT_AUTOGEN_CONFIG,
  DEFAULT_TIERS,
} from "../hooks/useZoneAutoGen";
import {
  type GenerationMachineState,
  type MachineAction,
  machineReducer,
  createInitialMachineState,
  WIZARD_STEPS,
  isValidTransition,
} from "../utils/generationStateMachine";

// ============== TYPES ==============

export type WizardMode = "full" | "zones-only" | "population-only";

interface GenerationWizardDialogProps {
  open: boolean;
  onClose: () => void;
  mode: WizardMode;
}

// Step icons
const STEP_ICONS = [Mountain, Home, Route, Layers, Users, Landmark, FileCheck];

// ============== COMPONENT ==============

export function GenerationWizardDialog({
  open,
  onClose,
  mode,
}: GenerationWizardDialogProps) {
  const { generate, apply, clearAutogen } = useZoneAutoGen();
  const [machine, dispatch] = useReducer(
    machineReducer,
    createInitialMachineState(),
  );
  const [config, setConfig] = useState<AutoGenConfig>({
    ...DEFAULT_AUTOGEN_CONFIG,
  });
  const [result, setResult] = useState<AutoGenResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Determine which steps to show based on mode
  const visibleSteps = useMemo(() => {
    switch (mode) {
      case "zones-only":
        return WIZARD_STEPS.filter((s) => s.index === 3 || s.index === 4);
      case "population-only":
        return WIZARD_STEPS.filter((s) => s.index === 4);
      default:
        return WIZARD_STEPS;
    }
  }, [mode]);

  const currentStep = WIZARD_STEPS[machine.stepIndex];
  const isFirstVisibleStep = machine.stepIndex === visibleSteps[0]?.index;
  const isLastVisibleStep =
    machine.stepIndex === visibleSteps[visibleSteps.length - 1]?.index;

  // Start configuring on open
  const handleStart = useCallback(() => {
    dispatch({ type: "RESET" });
    if (mode === "zones-only") {
      dispatch({ type: "START_CONFIGURE" });
      dispatch({ type: "JUMP_TO_STEP", stepIndex: 3 });
    } else if (mode === "population-only") {
      dispatch({ type: "START_CONFIGURE" });
      dispatch({ type: "JUMP_TO_STEP", stepIndex: 4 });
    } else {
      dispatch({ type: "START_CONFIGURE" });
    }
  }, [mode]);

  // Auto-start on open
  React.useEffect(() => {
    if (open) handleStart();
  }, [open, handleStart]);

  const handleGenerate = useCallback(() => {
    dispatch({ type: "START_GENERATE" });
    setError(null);

    requestAnimationFrame(() => {
      try {
        // For now, zones+population steps use the existing pipeline
        if (machine.stepIndex === 3 || machine.stepIndex === 4) {
          dispatch({
            type: "GENERATION_PROGRESS",
            progress: 30,
            label: "Sampling difficulty grid...",
          });
          const r = generate(config);
          if (!r) {
            dispatch({
              type: "FAIL",
              message: "No world loaded or viewport not ready.",
            });
            return;
          }
          setResult(r);
          dispatch({ type: "GENERATION_COMPLETE" });
        } else {
          // Other steps: mark as complete (placeholder for future pipeline stages)
          dispatch({
            type: "GENERATION_PROGRESS",
            progress: 50,
            label: `Generating ${currentStep?.name ?? ""}...`,
          });
          setTimeout(() => {
            dispatch({ type: "GENERATION_COMPLETE" });
          }, 300);
        }
      } catch (err) {
        dispatch({
          type: "FAIL",
          message: err instanceof Error ? err.message : "Generation failed",
        });
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }, [generate, config, machine.stepIndex, currentStep]);

  const handleApply = useCallback(() => {
    if (!result) return;
    dispatch({ type: "START_APPLY" });
    try {
      apply(result);
      dispatch({ type: "APPLY_COMPLETE", batchId: `wizard-${Date.now()}` });
    } catch (err) {
      dispatch({
        type: "FAIL",
        message: err instanceof Error ? err.message : "Apply failed",
      });
    }
  }, [apply, result]);

  const handleNextStep = useCallback(() => {
    if (isLastVisibleStep) {
      // Apply on the final step
      handleApply();
    } else {
      dispatch({ type: "NEXT_STEP" });
    }
  }, [isLastVisibleStep, handleApply]);

  const handlePrevStep = useCallback(() => {
    dispatch({ type: "PREV_STEP" });
  }, []);

  const handleClose = useCallback(() => {
    dispatch({ type: "RESET" });
    setResult(null);
    setError(null);
    onClose();
  }, [onClose]);

  const handleNewSeed = useCallback(() => {
    setConfig((c) => ({ ...c, seed: Math.floor(Math.random() * 999999) }));
  }, []);

  const handleRetry = useCallback(() => {
    dispatch({ type: "RETRY" });
    setError(null);
  }, []);

  const handleSkipStep = useCallback(() => {
    dispatch({ type: "NEXT_STEP" });
  }, []);

  if (!open) return null;

  const modeTitle =
    mode === "zones-only"
      ? "Generate Zones"
      : mode === "population-only"
        ? "Populate World"
        : "Generate World";
  const isGenerating = machine.current === "generating";
  const isPreviewing = machine.current === "previewing";
  const isComplete = machine.current === "complete";
  const isError = machine.current === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-primary border border-border-primary rounded-lg shadow-2xl w-[820px] max-h-[85vh] flex flex-col">
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

        {/* Step Indicator */}
        {visibleSteps.length > 1 && (
          <div className="px-4 py-2 border-b border-border-primary flex-shrink-0">
            <StepBar
              steps={visibleSteps}
              currentIndex={machine.stepIndex}
              completedSteps={machine.completedSteps}
              onJump={(idx) =>
                dispatch({ type: "JUMP_TO_STEP", stepIndex: idx })
              }
            />
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
              onRetry={handleRetry}
              onCancel={handleClose}
            />
          ) : isComplete ? (
            <CompleteView result={result} onClose={handleClose} />
          ) : (
            <div className="flex min-h-[400px]">
              {/* Left: Config panel */}
              <div className="w-[280px] border-r border-border-primary p-4 overflow-y-auto flex-shrink-0">
                <StepConfig
                  stepIndex={machine.stepIndex}
                  config={config}
                  onConfigChange={setConfig}
                  onNewSeed={handleNewSeed}
                />
              </div>
              {/* Right: Preview/Stats */}
              <div className="flex-1 p-4 overflow-y-auto">
                {isPreviewing && result ? (
                  <StepPreview stepIndex={machine.stepIndex} result={result} />
                ) : (
                  <StepPlaceholder stepIndex={machine.stepIndex} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isComplete && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary flex-shrink-0">
            <div className="flex items-center gap-2">
              {!isFirstVisibleStep && !isGenerating && !isError && (
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                  onClick={handlePrevStep}
                >
                  <ChevronLeft size={14} /> Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {currentStep?.optional &&
                !isPreviewing &&
                !isGenerating &&
                !isError && (
                  <button
                    className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
                    onClick={handleSkipStep}
                  >
                    <SkipForward size={12} /> Skip
                  </button>
                )}
              {machine.current === "configuring" && (
                <button
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90"
                  onClick={handleGenerate}
                >
                  Generate {currentStep?.name ?? ""} <ChevronRight size={14} />
                </button>
              )}
              {isPreviewing && !isLastVisibleStep && (
                <button
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90"
                  onClick={handleNextStep}
                >
                  Next: {WIZARD_STEPS[machine.stepIndex + 1]?.name ?? ""}{" "}
                  <ChevronRight size={14} />
                </button>
              )}
              {isPreviewing && isLastVisibleStep && (
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
        const isFuture = !isCompleted && !isCurrent;
        const Icon = STEP_ICONS[step.index] ?? Layers;
        const canClick = isCompleted || step.index <= currentIndex;

        return (
          <React.Fragment key={step.index}>
            {i > 0 && (
              <div
                className={`flex-1 h-px mx-1 ${isCompleted ? "bg-green-500" : "bg-border-primary border-t border-dashed border-border-secondary"}`}
              />
            )}
            <button
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-colors ${
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
  result,
  onClose,
}: {
  result: AutoGenResult | null;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-3">
      <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
        <Check size={24} className="text-green-400" />
      </div>
      <h3 className="text-sm font-semibold text-text-primary">
        World Generation Complete
      </h3>
      {result && (
        <p className="text-xs text-text-secondary max-w-sm text-center">
          Created {result.stats.zonesGenerated} zones with{" "}
          {result.stats.totalMobs} mob spawns and {result.stats.totalResources}{" "}
          resources. All entities tagged{" "}
          <code className="bg-bg-tertiary px-1 rounded">source: procgen</code>.
        </p>
      )}
      <button
        className="px-4 py-1.5 rounded bg-bg-tertiary text-text-primary text-xs font-medium hover:bg-bg-secondary mt-2"
        onClick={onClose}
      >
        Done
      </button>
    </div>
  );
}

// ============== STEP CONFIG PANELS ==============

function StepConfig({
  stepIndex,
  config,
  onConfigChange,
  onNewSeed,
}: {
  stepIndex: number;
  config: AutoGenConfig;
  onConfigChange: (c: AutoGenConfig) => void;
  onNewSeed: () => void;
}) {
  switch (stepIndex) {
    case 0:
      return <TerrainConfig />;
    case 1:
      return <TownConfig seed={config.seed} onNewSeed={onNewSeed} />;
    case 2:
      return <RoadConfig />;
    case 3:
      return (
        <ZoneConfig
          config={config}
          onConfigChange={onConfigChange}
          onNewSeed={onNewSeed}
        />
      );
    case 4:
      return (
        <PopulationConfig config={config} onConfigChange={onConfigChange} />
      );
    case 5:
      return <POIConfig />;
    case 6:
      return <ReviewConfig />;
    default:
      return null;
  }
}

function TerrainConfig() {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-text-primary">Terrain</h4>
      <p className="text-[10px] text-text-tertiary">
        Terrain is defined by your current world foundation. Adjust terrain
        settings in the Creation panel before starting the wizard.
      </p>
      <div className="p-2 rounded bg-bg-tertiary text-[10px] text-text-secondary">
        Using current terrain as foundation for generation.
      </div>
    </div>
  );
}

function TownConfig({
  seed,
  onNewSeed,
}: {
  seed: number;
  onNewSeed: () => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-text-primary">Towns</h4>
      <p className="text-[10px] text-text-tertiary">
        Towns are placed by the terrain system. This step verifies placement and
        assigns NPCs + stores to buildings.
      </p>
      <div className="p-2 rounded bg-bg-tertiary text-[10px] text-text-secondary">
        Town generation uses existing foundation towns.
      </div>
    </div>
  );
}

function RoadConfig() {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-text-primary">Roads</h4>
      <p className="text-[10px] text-text-tertiary">
        Inter-town roads are generated using MST connectivity with BFS
        pathfinding and Chaikin smoothing.
      </p>
      <div className="p-2 rounded bg-bg-tertiary text-[10px] text-text-secondary">
        Roads connect towns via minimum spanning tree + extra connections.
      </div>
    </div>
  );
}

function ZoneConfig({
  config,
  onConfigChange,
  onNewSeed,
}: {
  config: AutoGenConfig;
  onConfigChange: (c: AutoGenConfig) => void;
  onNewSeed: () => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-text-primary">Zones</h4>
      <div className="space-y-2">
        <ConfigField
          label="Seed"
          type="number"
          value={config.seed}
          onChange={(v) => onConfigChange({ ...config, seed: v })}
          suffix={
            <button
              className="p-0.5 rounded hover:bg-bg-secondary text-text-tertiary"
              onClick={onNewSeed}
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
            onConfigChange({ ...config, gridResolution: Math.max(5, v) })
          }
          min={5}
          max={50}
        />
        <ConfigField
          label="Min Zone Area (m²)"
          type="number"
          value={config.minZoneArea}
          onChange={(v) =>
            onConfigChange({ ...config, minZoneArea: Math.max(100, v) })
          }
          min={100}
        />
        <ConfigField
          label="Max Zone Span (m)"
          type="number"
          value={config.maxZoneSpan}
          onChange={(v) =>
            onConfigChange({ ...config, maxZoneSpan: Math.max(50, v) })
          }
          min={50}
        />
      </div>
      {/* Tier summary */}
      <div className="space-y-1">
        <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
          Tiers
        </span>
        {config.tiers.map((tier) => (
          <div key={tier.name} className="flex items-center gap-2 text-[10px]">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: tier.color }}
            />
            <span className="text-text-secondary">{tier.name}</span>
            <span className="text-text-tertiary ml-auto">
              {tier.scalarRange[0].toFixed(2)}-{tier.scalarRange[1].toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PopulationConfig({
  config,
  onConfigChange,
}: {
  config: AutoGenConfig;
  onConfigChange: (c: AutoGenConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-text-primary">
        Entity Population
      </h4>
      <div className="space-y-2">
        <ConfigField
          label="Mob Spacing (m)"
          type="number"
          value={config.mobSpacing}
          onChange={(v) =>
            onConfigChange({ ...config, mobSpacing: Math.max(5, v) })
          }
          min={5}
        />
        <ConfigField
          label="Resource Spacing (m)"
          type="number"
          value={config.resourceSpacing}
          onChange={(v) =>
            onConfigChange({ ...config, resourceSpacing: Math.max(3, v) })
          }
          min={3}
        />
      </div>
      <p className="text-[10px] text-text-tertiary">
        Mobs placed first, then resources with mob-proximity buffer. Buffer
        distances per tier control the RuneScape-style risk/reward feel.
      </p>
    </div>
  );
}

function POIConfig() {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-text-primary">
        POIs & Landmarks
      </h4>
      <p className="text-[10px] text-text-tertiary">
        Points of interest (dungeons, shrines, ruins, etc.) are placed with
        category-based spacing constraints.
      </p>
      <div className="p-2 rounded bg-bg-tertiary text-[10px] text-text-secondary">
        POI counts configured in world-config.json
      </div>
    </div>
  );
}

function ReviewConfig() {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-text-primary">
        Review & Compile
      </h4>
      <p className="text-[10px] text-text-tertiary">
        Review all generated content. Validation checks run automatically. Apply
        commits all entities to the world state.
      </p>
    </div>
  );
}

// ============== STEP PREVIEW PANELS ==============

function StepPreview({
  stepIndex,
  result,
}: {
  stepIndex: number;
  result: AutoGenResult;
}) {
  switch (stepIndex) {
    case 3:
    case 4:
      return <ZonePopulationPreview result={result} />;
    default:
      return (
        <div className="text-center py-8 text-text-tertiary text-xs">
          <Check size={20} className="mx-auto mb-2 text-green-400" />
          Step complete. Click "Next" to continue.
        </div>
      );
  }
}

function ZonePopulationPreview({ result }: { result: AutoGenResult }) {
  const { stats, zones } = result;
  return (
    <div className="space-y-4">
      {stats.landBounds && (
        <div className="px-2 py-1.5 rounded bg-bg-tertiary text-xs text-text-secondary">
          Land area: {Math.round(stats.landBounds.maxX - stats.landBounds.minX)}
          m × {Math.round(stats.landBounds.maxZ - stats.landBounds.minZ)}m
          <span className="text-text-tertiary ml-1">
            ({Math.round(stats.totalArea).toLocaleString()}m² zoned)
          </span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <MiniStatCard
          label="Zones"
          value={stats.zonesGenerated}
          icon={MapPin}
        />
        <MiniStatCard label="Mobs" value={stats.totalMobs} icon={Skull} />
        <MiniStatCard
          label="Resources"
          value={stats.totalResources}
          icon={TreePine}
        />
        <MiniStatCard
          label="Time"
          value={`${stats.generationTimeMs}ms`}
          icon={RefreshCw}
        />
      </div>

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
                <span className="text-text-primary font-medium">
                  {tb.tierName}
                </span>
                <div className="flex items-center gap-3 text-text-secondary tabular-nums">
                  <span>{tb.zoneCount} zones</span>
                  <span>{tb.mobCount} mobs</span>
                  <span>{tb.resourceCount} res</span>
                </div>
              </div>
            ))}
        </div>
      </div>

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
                <span>{Math.round(zone.area).toLocaleString()}m²</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepPlaceholder({ stepIndex }: { stepIndex: number }) {
  const step = WIZARD_STEPS[stepIndex];
  const descriptions: Record<number, string> = {
    0: "Configure terrain settings, then generate to sample the world.",
    1: "Town placement and NPC assignment will be previewed here.",
    2: "Road network connecting all towns will be previewed here.",
    3: "Difficulty-graded zones will be previewed here after generation.",
    4: "Mob and resource population will be previewed here.",
    5: "Points of interest and landmarks will be previewed here.",
    6: "Full review with validation and compile options.",
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12">
      <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center mb-3">
        {React.createElement(STEP_ICONS[stepIndex] ?? Layers, {
          size: 20,
          className: "text-text-tertiary",
        })}
      </div>
      <span className="text-xs text-text-secondary">
        {descriptions[stepIndex] ?? "Click Generate to continue."}
      </span>
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
