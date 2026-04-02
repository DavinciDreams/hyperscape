/**
 * ZoneAutoGenDialog — Modal dialog for one-click zone auto-generation
 *
 * Three steps:
 * 1. Config: Adjust tiers, densities, seed, spacing
 * 2. Preview: Review generated zones, stats, and spawn tables
 * 3. Apply: Commit to state
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
} from "lucide-react";
import React, { useState, useCallback, useMemo } from "react";

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

// ============== PROPS ==============

interface ZoneAutoGenDialogProps {
  open: boolean;
  onClose: () => void;
}

// ============== STEP TYPES ==============

type DialogStep = "config" | "preview" | "applied";

// ============== COMPONENT ==============

export function ZoneAutoGenDialog({ open, onClose }: ZoneAutoGenDialogProps) {
  const { generate, apply, clearAutogen } = useZoneAutoGen();
  const [step, setStep] = useState<DialogStep>("config");
  const [config, setConfig] = useState<AutoGenConfig>({
    ...DEFAULT_AUTOGEN_CONFIG,
  });
  const [result, setResult] = useState<AutoGenResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    setError(null);
    // Use requestAnimationFrame to allow UI to update before heavy computation
    requestAnimationFrame(() => {
      try {
        const r = generate(config);
        if (!r) {
          setError(
            "No world loaded or viewport not ready. Open a world first.",
          );
          setGenerating(false);
          return;
        }
        setResult(r);
        setStep("preview");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
      setGenerating(false);
    });
  }, [generate, config]);

  const handleApply = useCallback(() => {
    if (!result) return;
    apply(result);
    setStep("applied");
  }, [apply, result]);

  const handleClose = useCallback(() => {
    setStep("config");
    setResult(null);
    setError(null);
    onClose();
  }, [onClose]);

  const handleBack = useCallback(() => {
    if (step === "preview") setStep("config");
  }, [step]);

  const handleNewSeed = useCallback(() => {
    setConfig((c) => ({ ...c, seed: Math.floor(Math.random() * 999999) }));
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-primary border border-border-primary rounded-lg shadow-2xl w-[640px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-primary" />
            <span className="text-sm font-semibold text-text-primary">
              Auto-Generate Zones
            </span>
            <StepIndicator current={step} />
          </div>
          <button
            className="p-1 rounded hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary"
            onClick={handleClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {step === "config" && (
            <ConfigStep
              config={config}
              onConfigChange={setConfig}
              onNewSeed={handleNewSeed}
            />
          )}
          {step === "preview" && result && <PreviewStep result={result} />}
          {step === "applied" && result && <AppliedStep result={result} />}
          {error && (
            <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary flex-shrink-0">
          <div>
            {step === "preview" && (
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                onClick={handleBack}
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "config" && (
              <button
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    Generate Preview <ChevronRight size={14} />
                  </>
                )}
              </button>
            )}
            {step === "preview" && (
              <button
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-500"
                onClick={handleApply}
              >
                Apply to World <ChevronRight size={14} />
              </button>
            )}
            {step === "applied" && (
              <button
                className="px-4 py-1.5 rounded bg-bg-tertiary text-text-primary text-xs font-medium hover:bg-bg-secondary"
                onClick={handleClose}
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== SUB-COMPONENTS ==============

function StepIndicator({ current }: { current: DialogStep }) {
  const steps: Array<{ key: DialogStep; label: string }> = [
    { key: "config", label: "Configure" },
    { key: "preview", label: "Preview" },
    { key: "applied", label: "Applied" },
  ];
  return (
    <div className="flex items-center gap-1 ml-3">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          {i > 0 && <ChevronRight size={10} className="text-text-tertiary" />}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              s.key === current
                ? "bg-primary/15 text-primary font-medium"
                : "text-text-tertiary"
            }`}
          >
            {s.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ============== CONFIG STEP ==============

function ConfigStep({
  config,
  onConfigChange,
  onNewSeed,
}: {
  config: AutoGenConfig;
  onConfigChange: (c: AutoGenConfig) => void;
  onNewSeed: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        Generate difficulty-graded zones with RuneScape-style mob and resource
        progression. Safe towns radiate outward into increasingly dangerous
        territory.
      </p>

      {/* Global settings */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider">
            Seed
          </label>
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="number"
              className="flex-1 bg-bg-tertiary border border-border-primary rounded px-2 py-1 text-xs text-text-primary w-full"
              value={config.seed}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  seed: parseInt(e.target.value) || 0,
                })
              }
            />
            <button
              className="p-1 rounded hover:bg-bg-tertiary text-text-tertiary"
              onClick={onNewSeed}
              title="Randomize seed"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider">
            Grid Resolution (m)
          </label>
          <input
            type="number"
            className="bg-bg-tertiary border border-border-primary rounded px-2 py-1 text-xs text-text-primary w-full mt-0.5"
            value={config.gridResolution}
            min={5}
            max={50}
            onChange={(e) =>
              onConfigChange({
                ...config,
                gridResolution: Math.max(5, parseInt(e.target.value) || 10),
              })
            }
          />
        </div>
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider">
            Min Zone Area (m²)
          </label>
          <input
            type="number"
            className="bg-bg-tertiary border border-border-primary rounded px-2 py-1 text-xs text-text-primary w-full mt-0.5"
            value={config.minZoneArea}
            min={100}
            onChange={(e) =>
              onConfigChange({
                ...config,
                minZoneArea: Math.max(100, parseInt(e.target.value) || 2000),
              })
            }
          />
        </div>
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider">
            Max Zone Span (m)
          </label>
          <input
            type="number"
            className="bg-bg-tertiary border border-border-primary rounded px-2 py-1 text-xs text-text-primary w-full mt-0.5"
            value={config.maxZoneSpan}
            min={50}
            onChange={(e) =>
              onConfigChange({
                ...config,
                maxZoneSpan: Math.max(50, parseInt(e.target.value) || 200),
              })
            }
          />
        </div>
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider">
            Mob Spacing (m)
          </label>
          <input
            type="number"
            className="bg-bg-tertiary border border-border-primary rounded px-2 py-1 text-xs text-text-primary w-full mt-0.5"
            value={config.mobSpacing}
            min={5}
            onChange={(e) =>
              onConfigChange({
                ...config,
                mobSpacing: Math.max(5, parseInt(e.target.value) || 15),
              })
            }
          />
        </div>
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider">
            Resource Spacing (m)
          </label>
          <input
            type="number"
            className="bg-bg-tertiary border border-border-primary rounded px-2 py-1 text-xs text-text-primary w-full mt-0.5"
            value={config.resourceSpacing}
            min={3}
            onChange={(e) =>
              onConfigChange({
                ...config,
                resourceSpacing: Math.max(3, parseInt(e.target.value) || 8),
              })
            }
          />
        </div>
      </div>

      {/* Tier table */}
      <div>
        <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
          Difficulty Tiers
        </h4>
        <div className="border border-border-primary rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-tertiary text-text-tertiary">
                <th className="px-2 py-1 text-left font-medium">Tier</th>
                <th className="px-2 py-1 text-left font-medium">Scalar</th>
                <th className="px-2 py-1 text-left font-medium">Mob Lvl</th>
                <th className="px-2 py-1 text-left font-medium">Res Lvl</th>
                <th className="px-2 py-1 text-left font-medium">Mob Dens</th>
                <th className="px-2 py-1 text-left font-medium">Res Dens</th>
                <th className="px-2 py-1 text-left font-medium">Buffer</th>
              </tr>
            </thead>
            <tbody>
              {config.tiers.map((tier, idx) => (
                <TierRow
                  key={idx}
                  tier={tier}
                  idx={idx}
                  onChange={(updated) => {
                    const newTiers = [...config.tiers];
                    newTiers[idx] = updated;
                    onConfigChange({ ...config, tiers: newTiers });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TierRow({
  tier,
  idx,
  onChange,
}: {
  tier: DifficultyTierConfig;
  idx: number;
  onChange: (t: DifficultyTierConfig) => void;
}) {
  return (
    <tr className="border-t border-border-primary hover:bg-bg-tertiary/50">
      <td className="px-2 py-1">
        <div className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: tier.color }}
          />
          <span className="text-text-primary">{tier.name}</span>
        </div>
      </td>
      <td className="px-2 py-1 text-text-secondary tabular-nums">
        {tier.scalarRange[0].toFixed(2)}-{tier.scalarRange[1].toFixed(2)}
      </td>
      <td className="px-2 py-1 text-text-secondary tabular-nums">
        {tier.levelRange[0]}-{tier.levelRange[1]}
      </td>
      <td className="px-2 py-1 text-text-secondary tabular-nums">
        {tier.resourceLevelRange[0]}-{tier.resourceLevelRange[1]}
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          className="bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-[10px] text-text-primary w-12"
          value={tier.mobDensityMultiplier}
          step={0.1}
          min={0}
          max={5}
          onChange={(e) =>
            onChange({
              ...tier,
              mobDensityMultiplier: parseFloat(e.target.value) || 0,
            })
          }
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          className="bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-[10px] text-text-primary w-12"
          value={tier.resourceDensityMultiplier}
          step={0.1}
          min={0}
          max={5}
          onChange={(e) =>
            onChange({
              ...tier,
              resourceDensityMultiplier: parseFloat(e.target.value) || 0,
            })
          }
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          className="bg-bg-tertiary border border-border-primary rounded px-1 py-0.5 text-[10px] text-text-primary w-12"
          value={tier.mobResourceBuffer}
          min={0}
          max={100}
          onChange={(e) =>
            onChange({
              ...tier,
              mobResourceBuffer: parseInt(e.target.value) || 0,
            })
          }
        />
      </td>
    </tr>
  );
}

// ============== PREVIEW STEP ==============

function PreviewStep({ result }: { result: AutoGenResult }) {
  const { stats, zones } = result;

  return (
    <div className="space-y-4">
      {/* Land area info */}
      {stats.landBounds && (
        <div className="px-2 py-1.5 rounded bg-bg-tertiary text-xs text-text-secondary">
          Land area detected:{" "}
          {Math.round(stats.landBounds.maxX - stats.landBounds.minX)}m x{" "}
          {Math.round(stats.landBounds.maxZ - stats.landBounds.minZ)}m
          <span className="text-text-tertiary ml-1">
            ({Math.round(stats.totalArea).toLocaleString()}m² zoned)
          </span>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Zones" value={stats.zonesGenerated} icon={MapPin} />
        <StatCard label="Mobs" value={stats.totalMobs} icon={Skull} />
        <StatCard
          label="Resources"
          value={stats.totalResources}
          icon={TreePine}
        />
        <StatCard
          label="Time"
          value={`${stats.generationTimeMs}ms`}
          icon={RefreshCw}
        />
      </div>

      {/* Tier breakdown */}
      <div>
        <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
          Tier Breakdown
        </h4>
        <div className="space-y-1">
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
                <div className="flex items-center gap-3 text-text-secondary">
                  <span>{tb.zoneCount} zones</span>
                  <span>{tb.mobCount} mobs</span>
                  <span>{tb.resourceCount} resources</span>
                  <span>{Math.round(tb.area).toLocaleString()}m²</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Zone list */}
      <div>
        <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
          Generated Zones ({zones.length})
        </h4>
        <div className="max-h-[200px] overflow-y-auto space-y-0.5 border border-border-primary rounded">
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
              <div className="flex items-center gap-2 text-text-tertiary flex-shrink-0 ml-2">
                <span>{Math.round(zone.area).toLocaleString()}m²</span>
                <span>
                  {zone.spawnRules.mobs?.table.length ?? 0}m/
                  {zone.spawnRules.resources?.table.length ?? 0}r
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
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
      <Icon size={14} className="mx-auto text-text-tertiary mb-1" />
      <div className="text-sm font-semibold text-text-primary">{value}</div>
      <div className="text-[10px] text-text-tertiary">{label}</div>
    </div>
  );
}

// ============== APPLIED STEP ==============

function AppliedStep({ result }: { result: AutoGenResult }) {
  return (
    <div className="text-center py-6 space-y-3">
      <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
        <Wand2 size={24} className="text-green-400" />
      </div>
      <h3 className="text-sm font-semibold text-text-primary">
        Zones Applied Successfully
      </h3>
      <p className="text-xs text-text-secondary max-w-sm mx-auto">
        Created {result.stats.zonesGenerated} zones with{" "}
        {result.stats.totalMobs} mob spawns and {result.stats.totalResources}{" "}
        resources. All entities are tagged{" "}
        <code className="bg-bg-tertiary px-1 rounded">source: procgen</code> for
        easy regeneration.
      </p>
      <p className="text-[10px] text-text-tertiary">
        Zones are visible in the Outliner. Use "Clear Auto-Gen" to remove all
        generated content.
      </p>
    </div>
  );
}
