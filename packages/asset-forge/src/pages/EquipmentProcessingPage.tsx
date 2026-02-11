import {
  Download,
  RotateCcw,
  Cog,
  Eye,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Bug,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { useEquipmentProcessingStore } from "../store/useEquipmentProcessingStore";
import { cn } from "../styles";
import { getAssetModelUrl } from "../utils/api";

import {
  ArmorFittingViewer,
  ArmorFittingViewerRef,
  ArmorAssetList,
} from "@/components/ArmorFitting";
import { ErrorNotification, EmptyState } from "@/components/common";
import { useAssets } from "@/hooks";

type EquipmentSlot =
  | "body"
  | "legs"
  | "helmet"
  | "boots"
  | "gloves"
  | "cape"
  | "shield";

const SLOT_OPTIONS: { value: EquipmentSlot; label: string }[] = [
  { value: "body", label: "Body" },
  { value: "legs", label: "Legs" },
  { value: "helmet", label: "Helmet" },
  { value: "boots", label: "Boots" },
  { value: "gloves", label: "Gloves" },
  { value: "cape", label: "Cape" },
  { value: "shield", label: "Shield" },
];

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

export const EquipmentProcessingPage: React.FC = () => {
  const { assets, loading } = useAssets();
  const viewerRef = useRef<ArmorFittingViewerRef>(null);

  const {
    selectedAvatar,
    selectedArmor,
    assetTypeFilter,
    slot,
    offset,
    maxInfluences,
    smoothingPasses,
    dockerReady,
    dockerBuilding,
    isProcessing,
    isProcessed,
    jobStatus,
    showWireframe,
    showPreview,
    lastError,
    handleAssetSelect,
    setAssetTypeFilter,
    setSlot,
    setOffset,
    setMaxInfluences,
    setSmoothingPasses,
    checkDockerReady,
    startProcessing,
    resetProcessing,
    previewRiggedModel,
    exportRiggedArmor,
    setShowWireframe,
    clearError,
    isReadyToProcess,
  } = useEquipmentProcessingStore();

  // Poll Docker readiness on mount and while building
  useEffect(() => {
    checkDockerReady();
    const interval = setInterval(
      () => {
        checkDockerReady();
      },
      dockerBuilding ? 3000 : 10000,
    );
    return () => clearInterval(interval);
  }, [dockerBuilding, checkDockerReady]);

  const progressPercent = jobStatus?.progress ?? 0;
  const progressMessage = jobStatus?.message ?? "";

  // Animation preview state
  const [vrmAnimation, setVrmAnimation] = useState<string | null>(null);

  // Always use GLB for display (VRM loaded hidden for animation pipeline only)
  const avatarUrl = selectedAvatar?.hasModel
    ? getAssetModelUrl(selectedAvatar.id)
    : undefined;

  // VRM URL for animation retargeting (loaded hidden, not displayed)
  const vrmUrl = selectedAvatar?.hasModel
    ? `/gdd-assets/${selectedAvatar.id}/${selectedAvatar.id}.vrm`
    : undefined;

  // Track rigged file metadata for on-screen verification
  const [riggedFileInfo, setRiggedFileInfo] = useState<{
    modified: string;
    sizeKB: number;
    fetchedAt: string;
    url: string;
  } | null>(null);

  // Use the dedicated no-cache API route for rigged GLBs.
  // Cache-busting query param ensures both the browser HTTP cache AND
  // Three.js's in-memory THREE.Cache (keyed by URL) return fresh data.
  const riggedArmorUrl =
    isProcessed && selectedArmor
      ? `/api/equipment/rigged/${selectedArmor.id}?t=${jobStatus?.completedAt ?? Date.now()}`
      : selectedArmor?.hasModel
        ? getAssetModelUrl(selectedArmor.id)
        : undefined;

  // Debug material modes for diagnosing dark spots / gaps
  type DebugMode =
    | "none"
    | "flat-color"
    | "normals"
    | "face-orientation"
    | "uv-checker";
  const [debugMode, setDebugMode] = useState<DebugMode>("none");
  const savedMaterialRef = useRef<THREE.Material | THREE.Material[] | null>(
    null,
  );

  const applyDebugMaterial = useCallback((mode: DebugMode) => {
    const meshes = viewerRef.current?.getMeshes();
    const armorMeshObj = meshes?.armor;
    if (!armorMeshObj) return;

    // Save original material on first debug use
    if (!savedMaterialRef.current && mode !== "none") {
      savedMaterialRef.current = armorMeshObj.material;
    }

    if (mode === "none") {
      // Restore original
      if (savedMaterialRef.current) {
        armorMeshObj.material = savedMaterialRef.current;
        savedMaterialRef.current = null;
      }
      return;
    }

    if (mode === "flat-color") {
      // Solid grey — isolates geometry from textures
      armorMeshObj.material = new THREE.MeshStandardMaterial({
        color: 0x888888,
        side: THREE.DoubleSide,
        flatShading: false,
        metalness: 0,
        roughness: 0.8,
      });
    } else if (mode === "normals") {
      // Normal-mapped colors: RGB = XYZ normal direction
      armorMeshObj.material = new THREE.MeshNormalMaterial({
        side: THREE.DoubleSide,
        flatShading: false,
      });
    } else if (mode === "face-orientation") {
      // Front = blue, back = red — shows flipped faces
      armorMeshObj.material = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {},
        vertexShader: `
          void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          void main() {
            gl_FragColor = gl_FrontFacing ? vec4(0.3, 0.5, 1.0, 1.0) : vec4(1.0, 0.2, 0.2, 1.0);
          }
        `,
      });
    } else if (mode === "uv-checker") {
      // Checkerboard via UVs — shows UV distortion
      armorMeshObj.material = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {},
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          void main() {
            float checker = mod(floor(vUv.x * 10.0) + floor(vUv.y * 10.0), 2.0);
            gl_FragColor = mix(vec4(0.2, 0.2, 0.2, 1.0), vec4(1.0, 1.0, 1.0, 1.0), checker);
          }
        `,
      });
    }
    if (!Array.isArray(armorMeshObj.material)) {
      armorMeshObj.material.needsUpdate = true;
    }
  }, []);

  useEffect(() => {
    applyDebugMaterial(debugMode);
  }, [debugMode, applyDebugMaterial]);

  // Fetch rigged file metadata whenever the rigged URL changes
  const fetchFileInfo = useCallback(async (url: string) => {
    try {
      const res = await fetch(url, { method: "HEAD" });
      const modified = res.headers.get("last-modified") ?? "unknown";
      const size = parseInt(res.headers.get("x-file-size") ?? "0", 10);
      setRiggedFileInfo({
        modified,
        sizeKB: Math.round(size / 1024),
        fetchedAt: new Date().toLocaleTimeString(),
        url: url.split("?")[0],
      });
    } catch {
      // ignore — info badge just won't show
    }
  }, []);

  useEffect(() => {
    if (
      isProcessed &&
      riggedArmorUrl &&
      riggedArmorUrl.includes("/api/equipment/rigged/")
    ) {
      fetchFileInfo(riggedArmorUrl);
    } else {
      setRiggedFileInfo(null);
    }
  }, [isProcessed, riggedArmorUrl, fetchFileInfo]);

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
                avatarUrl={avatarUrl}
                armorUrl={riggedArmorUrl}
                showWireframe={showWireframe}
                equipmentSlot="Spine2"
                armorIsRigged={isProcessed}
                selectedAvatar={selectedAvatar}
                vrmAnimation={vrmAnimation}
                vrmUrl={vrmUrl}
                onModelsLoaded={() => console.log("Models loaded")}
              />

              {/* Action Buttons */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-10">
                <button
                  onClick={() => {
                    setVrmAnimation(null);
                    resetProcessing();
                    viewerRef.current?.resetTransform();
                  }}
                  className="px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2.5
                    bg-bg-primary/80 backdrop-blur-sm border border-white/10 text-text-primary
                    hover:bg-bg-secondary hover:border-white/20 hover:scale-105"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset</span>
                </button>

                {isProcessed && (
                  <button
                    onClick={() => previewRiggedModel(viewerRef)}
                    className={cn(
                      "px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2.5",
                      showPreview
                        ? "bg-primary/20 border border-primary/40 text-primary"
                        : "bg-bg-primary/80 backdrop-blur-sm border border-white/10 text-text-primary hover:bg-bg-secondary hover:border-white/20 hover:scale-105",
                    )}
                  >
                    <Play className="w-4 h-4" />
                    <span>Preview Rigged</span>
                  </button>
                )}
              </div>

              {/* Debug panel + wireframe toggle + file info */}
              <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
                <div className="flex items-start gap-2">
                  {riggedFileInfo && (
                    <div className="px-3 py-2 rounded-lg bg-bg-primary/90 backdrop-blur-sm border border-white/10 text-[11px] font-mono text-text-secondary leading-relaxed">
                      <div className="text-primary font-semibold mb-0.5">
                        Rigged GLB Loaded
                      </div>
                      <div>File: {riggedFileInfo.url}</div>
                      <div>
                        Modified:{" "}
                        <span className="text-text-primary">
                          {riggedFileInfo.modified}
                        </span>
                      </div>
                      <div>
                        Size:{" "}
                        <span className="text-text-primary">
                          {riggedFileInfo.sizeKB} KB
                        </span>
                      </div>
                      <div>
                        Fetched:{" "}
                        <span className="text-text-primary">
                          {riggedFileInfo.fetchedAt}
                        </span>
                      </div>
                    </div>
                  )}
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

                {/* Debug Material Modes */}
                {isProcessed && (
                  <div className="px-3 py-2.5 rounded-lg bg-bg-primary/90 backdrop-blur-sm border border-white/10">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Bug className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-[11px] font-semibold text-yellow-400">
                        Debug View
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {(
                        [
                          ["none", "Textured (default)"],
                          ["flat-color", "Flat Grey (geometry only)"],
                          ["normals", "Normal Map (RGB=XYZ)"],
                          [
                            "face-orientation",
                            "Face Orient (blue=front, red=back)",
                          ],
                          ["uv-checker", "UV Checker"],
                        ] as [DebugMode, string][]
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          onClick={() => setDebugMode(mode)}
                          className={cn(
                            "text-left px-2 py-1 rounded text-[11px] transition-colors",
                            debugMode === mode
                              ? "bg-yellow-400/20 text-yellow-300 font-medium"
                              : "text-text-secondary hover:text-text-primary hover:bg-white/5",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Processing Progress Overlay */}
              {isProcessing && (
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-20">
                  <div className="bg-bg-secondary rounded-2xl p-8 shadow-2xl border border-white/10 max-w-md w-full mx-8">
                    <div className="flex items-center gap-3 mb-4">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      <h3 className="text-lg font-semibold text-text-primary">
                        Processing in Blender
                      </h3>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-bg-tertiary rounded-full h-2 mb-3">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm text-text-secondary truncate mr-4">
                        {progressMessage || "Starting pipeline..."}
                      </p>
                      <span className="text-sm font-mono text-primary whitespace-nowrap">
                        {progressPercent}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <EmptyState
                icon={Cog}
                title="Equipment Processing"
                description="Select an avatar and armor piece to process with Blender's weight transfer pipeline"
              />
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Controls */}
      <div className="card overflow-hidden w-80 flex flex-col bg-gradient-to-br from-bg-primary to-bg-secondary">
        <div className="p-4 border-b border-border-primary bg-bg-primary bg-opacity-30">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Cog className="w-5 h-5 text-primary" />
            Blender Pipeline
          </h2>
          <p className="text-xs text-text-tertiary mt-1">
            NEAREST_FACE_INTERPOLATED weight transfer
          </p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-4 space-y-5">
            {/* Docker Status */}
            {!dockerReady && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                {dockerBuilding ? (
                  <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-yellow-400" />
                )}
                <span className="text-xs text-yellow-300">
                  {dockerBuilding
                    ? "Building Blender Docker image..."
                    : "Docker not available — install Docker Desktop"}
                </span>
              </div>
            )}

            {/* Status Indicator */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary/50 border border-white/5">
              {isProcessed ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : isProcessing ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : lastError ? (
                <AlertCircle className="w-4 h-4 text-red-400" />
              ) : (
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    dockerReady && selectedAvatar && selectedArmor
                      ? "bg-green-400"
                      : "bg-text-tertiary",
                  )}
                />
              )}
              <span className="text-xs text-text-secondary">
                {isProcessed
                  ? "Equipment rigged"
                  : isProcessing
                    ? "Processing..."
                    : !dockerReady
                      ? dockerBuilding
                        ? "Waiting for Docker image build..."
                        : "Docker required"
                      : !selectedAvatar
                        ? "Select an avatar"
                        : !selectedArmor
                          ? "Select armor"
                          : "Ready to process"}
              </span>
            </div>

            {/* Equipment Slot */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-text-primary">
                Equipment Slot
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {SLOT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSlot(option.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150",
                      slot === option.value
                        ? "bg-primary text-white"
                        : "bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Parameters */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-text-primary">
                Processing Parameters
              </h3>

              <Slider
                label="Surface Offset"
                value={offset}
                min={0.005}
                max={0.08}
                step={0.005}
                onChange={setOffset}
                unit="m"
              />

              <Slider
                label="Max Bone Influences"
                value={maxInfluences}
                min={1}
                max={8}
                step={1}
                onChange={setMaxInfluences}
              />

              <Slider
                label="Smoothing Passes"
                value={smoothingPasses}
                min={0}
                max={10}
                step={1}
                onChange={setSmoothingPasses}
              />
            </div>

            {/* Process Button */}
            <button
              onClick={startProcessing}
              disabled={!isReadyToProcess()}
              className={cn(
                "w-full py-3 rounded-lg font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2",
                isReadyToProcess()
                  ? "bg-primary text-white hover:brightness-110 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
                  : "bg-bg-tertiary text-text-tertiary cursor-not-allowed",
              )}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Cog className="w-4 h-4" />
                  <span>Process in Blender</span>
                </>
              )}
            </button>

            {/* Export */}
            {isProcessed && (
              <button
                onClick={exportRiggedArmor}
                className="w-full py-2.5 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2
                  bg-bg-secondary border border-white/10 text-text-primary hover:border-white/20 hover:bg-bg-tertiary"
              >
                <Download className="w-4 h-4" />
                <span>Export Rigged GLB</span>
              </button>
            )}

            {/* Animation Preview */}
            {isProcessed && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <Play className="w-4 h-4 text-primary" />
                  Animation Preview
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["idle", "walk", "run", "jump"] as const).map((anim) => (
                    <button
                      key={anim}
                      onClick={() =>
                        setVrmAnimation(vrmAnimation === anim ? null : anim)
                      }
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 capitalize",
                        vrmAnimation === anim
                          ? "bg-primary text-white"
                          : "bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/80",
                      )}
                    >
                      {anim}
                    </button>
                  ))}
                </div>
                {vrmAnimation && (
                  <button
                    onClick={() => setVrmAnimation(null)}
                    className="w-full py-1.5 rounded-md text-xs font-medium transition-all duration-150
                      bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
                  >
                    Stop Animation
                  </button>
                )}
              </div>
            )}

            {/* Pipeline Info */}
            <div className="mt-6 p-3 rounded-lg bg-bg-tertiary/30 border border-white/5">
              <h4 className="text-xs font-medium text-text-secondary mb-2">
                How it works
              </h4>
              <ol className="text-[11px] text-text-tertiary space-y-1.5 list-decimal list-inside">
                <li>Import reference body VRM with skeleton</li>
                <li>Import and align raw equipment mesh</li>
                <li>Parent equipment to body armature</li>
                <li>Transfer weights via NEAREST_FACE_INTERPOLATED</li>
                <li>Normalize, limit influences, smooth weights</li>
                <li>Filter by equipment slot bone regions</li>
                <li>Export rigged GLB with metadata sidecar</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentProcessingPage;
