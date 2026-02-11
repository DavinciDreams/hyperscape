import { Download, RotateCcw, Box, Eye } from "lucide-react";
import React, { useRef } from "react";

import { useWasmFittingStore } from "../store/useWasmFittingStore";
import { cn } from "../styles";
import { getAssetModelUrl } from "../utils/api";

import {
  ArmorFittingViewer,
  ArmorFittingViewerRef,
  ArmorAssetList,
  FittingProgress,
} from "@/components/ArmorFitting";
import { ErrorNotification, EmptyState } from "@/components/common";
import { useAssets } from "@/hooks";

// Simple slider component
const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  unit?: string;
}> = ({ label, value, min, max, step, onChange, unit }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <span className="text-xs font-mono text-primary">
        {value.toFixed(step < 1 ? (step < 0.01 ? 3 : 2) : 0)}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-bg-tertiary
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer
        [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
    />
  </div>
);

export const WasmFittingPage: React.FC = () => {
  const { assets, loading } = useAssets();
  const viewerRef = useRef<ArmorFittingViewerRef>(null);

  const {
    selectedAvatar,
    selectedArmor,
    assetTypeFilter,
    offset,
    sdfResolution,
    conformStrength,
    smoothingStrength,
    smoothingPasses,
    boundaryFalloff,
    isFitting,
    fittingProgress,
    fittingStartTime,
    isArmorFitted,
    showWireframe,
    lastError,
    handleAssetSelect,
    setAssetTypeFilter,
    setOffset,
    setSdfResolution,
    setConformStrength,
    setSmoothingStrength,
    setSmoothingPasses,
    setBoundaryFalloff,
    performFitting,
    resetFitting,
    exportFittedArmor,
    setShowWireframe,
    clearError,
    isReadyToFit,
    currentProgress,
  } = useWasmFittingStore();

  return (
    <div className="page-container">
      {/* Error Toast */}
      {lastError && (
        <ErrorNotification error={lastError} onClose={clearError} />
      )}

      {/* Left Panel - Asset Selection */}
      <div className="card overflow-hidden w-80 flex flex-col bg-gradient-to-br from-bg-primary to-bg-secondary">
        <ArmorAssetList
          assets={assets}
          loading={loading}
          assetType={assetTypeFilter}
          selectedAsset={
            assetTypeFilter === "avatar" ? selectedAvatar : selectedArmor
          }
          selectedAvatar={selectedAvatar}
          selectedArmor={selectedArmor}
          selectedHelmet={null}
          onAssetSelect={handleAssetSelect}
          onAssetTypeChange={(type) => {
            if (type === "avatar" || type === "armor") {
              setAssetTypeFilter(type);
            }
          }}
          equipmentSlot="Spine2"
        />
      </div>

      {/* Center - 3D Viewport */}
      <div className="flex-1 flex flex-col">
        <div className="overflow-hidden flex-1 relative bg-gradient-to-br from-bg-primary to-bg-secondary rounded-xl">
          {selectedAvatar || selectedArmor ? (
            <>
              <ArmorFittingViewer
                ref={viewerRef}
                avatarUrl={
                  selectedAvatar?.hasModel
                    ? getAssetModelUrl(selectedAvatar.id)
                    : undefined
                }
                armorUrl={
                  selectedArmor?.hasModel
                    ? getAssetModelUrl(selectedArmor.id)
                    : undefined
                }
                showWireframe={showWireframe}
                equipmentSlot="Spine2"
                selectedAvatar={selectedAvatar}
                onModelsLoaded={() => console.log("Models loaded")}
              />

              {/* Action Buttons */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-10">
                <button
                  onClick={() => {
                    resetFitting();
                    viewerRef.current?.resetTransform();
                  }}
                  className="px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2.5
                    bg-bg-primary/80 backdrop-blur-sm border border-white/10 text-text-primary
                    hover:bg-bg-secondary hover:border-white/20 hover:scale-105"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Wireframe toggle */}
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={() => setShowWireframe(!showWireframe)}
                  className={cn(
                    "p-2.5 rounded-lg transition-all duration-200 border",
                    showWireframe
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-bg-primary/80 border-white/10 text-text-secondary hover:text-text-primary",
                  )}
                  title="Toggle wireframe"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>

              {/* Fitting Progress */}
              {isFitting && (
                <FittingProgress
                  progress={fittingProgress}
                  message={currentProgress()}
                  startTime={fittingStartTime}
                />
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <EmptyState
                icon={Box}
                title="SDF Armor Fitting"
                description="Select an avatar and armor piece to begin SDF-based volumetric fitting"
              />
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Controls */}
      <div className="card overflow-hidden w-80 flex flex-col bg-gradient-to-br from-bg-primary to-bg-secondary">
        <div className="p-4 border-b border-border-primary bg-bg-primary bg-opacity-30">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Box className="w-5 h-5 text-primary" />
            SDF Fitting
          </h2>
          <p className="text-xs text-text-tertiary mt-1">
            Signed distance field projection with trilinear interpolation
          </p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-4 space-y-5">
            {/* Status */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary/50 border border-white/5">
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  selectedAvatar && selectedArmor
                    ? "bg-green-400"
                    : "bg-text-tertiary",
                )}
              />
              <span className="text-xs text-text-secondary">
                {!selectedAvatar
                  ? "Select an avatar"
                  : !selectedArmor
                    ? "Select armor"
                    : isArmorFitted
                      ? "Armor fitted"
                      : "Ready to fit"}
              </span>
            </div>

            {/* Parameters */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-text-primary">
                Parameters
              </h3>

              <Slider
                label="Surface Offset"
                value={offset}
                min={0.01}
                max={0.12}
                step={0.005}
                onChange={setOffset}
                unit="m"
              />

              <Slider
                label="SDF Resolution"
                value={sdfResolution}
                min={32}
                max={128}
                step={16}
                onChange={setSdfResolution}
              />

              <Slider
                label="Conform Strength"
                value={conformStrength}
                min={0}
                max={1}
                step={0.05}
                onChange={setConformStrength}
              />

              <Slider
                label="Smoothing Strength"
                value={smoothingStrength}
                min={0}
                max={1}
                step={0.05}
                onChange={setSmoothingStrength}
              />

              <Slider
                label="Relaxation Passes"
                value={smoothingPasses}
                min={1}
                max={15}
                step={1}
                onChange={setSmoothingPasses}
              />

              <Slider
                label="Boundary Falloff"
                value={boundaryFalloff}
                min={0}
                max={1}
                step={0.05}
                onChange={setBoundaryFalloff}
              />
            </div>

            {/* Fit Button */}
            <button
              onClick={() => performFitting(viewerRef)}
              disabled={!isReadyToFit()}
              className={cn(
                "w-full py-3 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2",
                isReadyToFit()
                  ? "bg-primary text-white hover:brightness-110 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
                  : "bg-bg-tertiary text-text-tertiary cursor-not-allowed",
              )}
            >
              {isFitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  <span>Fitting...</span>
                </>
              ) : (
                <>
                  <Box className="w-4 h-4" />
                  <span>Fit Armor (SDF)</span>
                </>
              )}
            </button>

            {/* Export */}
            {isArmorFitted && (
              <button
                onClick={() => exportFittedArmor(viewerRef)}
                className="w-full py-2.5 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2
                  bg-bg-secondary border border-white/10 text-text-primary hover:border-white/20 hover:bg-bg-tertiary"
              >
                <Download className="w-4 h-4" />
                <span>Export Fitted Armor</span>
              </button>
            )}

            {/* Algorithm Info */}
            <div className="mt-6 p-3 rounded-lg bg-bg-tertiary/30 border border-white/5">
              <h4 className="text-xs font-medium text-text-secondary mb-2">
                How it works
              </h4>
              <ol className="text-[11px] text-text-tertiary space-y-1.5 list-decimal list-inside">
                <li>Build 3D signed distance field from body mesh</li>
                <li>
                  Trilinear-sample SDF at each armor vertex for smooth distance
                </li>
                <li>
                  Compute gradient via central differences (continuous
                  direction)
                </li>
                <li>
                  Project each vertex to the offset isosurface along gradient
                </li>
                <li>
                  Laplacian smooth displacement deltas, then push-out safety net
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WasmFittingPage;
