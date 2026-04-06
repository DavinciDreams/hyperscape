import {
  Paintbrush,
  Info,
  Loader2,
  Download,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Wand2,
} from "lucide-react";
import React, { useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { ArmorTextureService } from "../../services/armor-pipeline/ArmorTextureService";
import type { TextureTaskStatus } from "../../services/armor-pipeline/ArmorTextureService";
import { ShellExtractionService } from "../../services/armor-pipeline/ShellExtractionService";
import type {
  EquipmentSlotName,
  BulkClass,
  ShellExtractionResult,
  ShellMesh,
} from "../../services/armor-pipeline/types";
import { BULK_OFFSETS } from "../../services/armor-pipeline/types";
import {
  AVATAR_OPTIONS,
  ALL_SLOTS,
  ALL_BULKS,
} from "../../services/armor-pipeline/constants";
import {
  ShellPreviewViewer,
  type ShellPreviewViewerRef,
} from "./ShellPreviewViewer";

/** Preset material prompts for quick testing */
const MATERIAL_PRESETS = [
  {
    id: "iron_plate",
    label: "Iron Platebody",
    prompt:
      "iron plate armor, medieval, dark grey metal, riveted plates, scratched",
    style: "realistic medieval fantasy RPG armor, detailed PBR material",
  },
  {
    id: "leather",
    label: "Leather Armor",
    prompt: "brown leather armor, stitched, worn, layered leather panels",
    style: "realistic medieval fantasy RPG armor, detailed PBR material",
  },
  {
    id: "cloth_robe",
    label: "Cloth Robe",
    prompt: "blue wizard robe, silk, flowing fabric, gold trim embroidery",
    style: "realistic medieval fantasy RPG clothing, detailed PBR material",
  },
  {
    id: "steel_plate",
    label: "Steel Platebody",
    prompt: "polished steel plate armor, silver sheen, ornate engravings",
    style: "realistic medieval fantasy RPG armor, detailed PBR material",
  },
  {
    id: "mithril",
    label: "Mithril Armor",
    prompt:
      "mithril plate armor, blue-tinted silver metal, gleaming, elven craftsmanship",
    style: "realistic medieval fantasy RPG armor, detailed PBR material",
  },
  {
    id: "dragon",
    label: "Dragon Armor",
    prompt:
      "red dragon plate armor, dark red metal, dragon scale pattern, black trim",
    style: "realistic medieval fantasy RPG armor, detailed PBR material",
  },
];

type Stage =
  | "idle"
  | "extracting"
  | "uploading"
  | "texturing"
  | "loading-result"
  | "done"
  | "error";

interface TextureGeneratorTabProps {
  onAddToKit?: (shell: ShellMesh, texturedGlbUrl: string) => void;
  /** Shared extraction cache from parent — avoids re-extracting */
  sharedExtraction?: ShellExtractionResult | null;
  /** Shared extraction function from parent */
  onExtract?: (
    avatarUrl: string,
    onProgress?: (
      p: import("../../services/armor-pipeline/types").ShellExtractionProgress,
    ) => void,
  ) => Promise<ShellExtractionResult>;
}

export const TextureGeneratorTab: React.FC<TextureGeneratorTabProps> = ({
  onAddToKit,
  sharedExtraction,
  onExtract,
}) => {
  const viewerRef = useRef<ShellPreviewViewerRef>(null);
  const shellServiceRef = useRef<ShellExtractionService | null>(null);
  const textureServiceRef = useRef<ArmorTextureService | null>(null);

  // Settings
  const [avatarUrl, setAvatarUrl] = useState(AVATAR_OPTIONS[0].url);
  const [selectedSlot, setSelectedSlot] = useState<EquipmentSlotName>("body");
  const [selectedBulk, setSelectedBulk] = useState<BulkClass>("plate");
  const [selectedPreset, setSelectedPreset] = useState<string>(
    MATERIAL_PRESETS[0].id,
  );
  const [customPrompt, setCustomPrompt] = useState("");

  // State
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Shell extraction result (reused between texturing attempts)
  const [extractionResult, setExtractionResult] =
    useState<ShellExtractionResult | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [
      ...prev.slice(-50),
      `[${new Date().toLocaleTimeString()}] ${msg}`,
    ]);
  }, []);

  const getPrompt = useCallback(() => {
    if (customPrompt.trim()) return customPrompt.trim();
    const preset = MATERIAL_PRESETS.find((p) => p.id === selectedPreset);
    return preset?.prompt ?? MATERIAL_PRESETS[0].prompt;
  }, [customPrompt, selectedPreset]);

  const handleGenerate = useCallback(async () => {
    setStage("extracting");
    setError(null);
    setProgress(0);
    setLogs([]);

    try {
      // Initialize services
      if (!shellServiceRef.current) {
        shellServiceRef.current = new ShellExtractionService();
      }
      if (!textureServiceRef.current) {
        textureServiceRef.current = new ArmorTextureService();
      }

      // Step 1: Extract shell (use shared cache or extract locally)
      let result = extractionResult ?? sharedExtraction ?? null;
      if (!result || result.avatarHeight === 0) {
        if (onExtract) {
          addLog("Extracting shell from avatar (shared)...");
          result = await onExtract(avatarUrl, (prog) => {
            setProgress(prog.progress * 25);
            addLog(prog.message);
          });
        } else {
          if (!shellServiceRef.current) {
            shellServiceRef.current = new ShellExtractionService();
          }
          addLog("Extracting shell from avatar...");
          result = await shellServiceRef.current.extractShells(
            avatarUrl,
            ALL_SLOTS,
            ALL_BULKS,
            (prog) => {
              setProgress(prog.progress * 25);
              addLog(prog.message);
            },
          );
        }
        setExtractionResult(result);
        addLog(`Shell extraction complete. ${result.shells.size} shells.`);
      } else {
        addLog("Reusing cached shell extraction.");
        setProgress(25);
      }

      // Show the avatar in the viewer
      viewerRef.current?.setAvatarScene(result.vrmScene);

      // Step 2: Export the selected shell as GLB
      const shellKey = `${selectedSlot}_${selectedBulk}`;
      const shell = result.shells.get(shellKey);
      if (!shell) {
        throw new Error(`Shell not found: ${shellKey}`);
      }

      addLog(`Exporting ${shellKey} as GLB...`);
      const glbBlob = await shellServiceRef.current.exportShellAsGLB(shell);
      addLog(`GLB exported: ${(glbBlob.size / 1024).toFixed(1)}KB`);
      setProgress(30);

      // Step 3: Upload to server + start Meshy retexture (one call)
      setStage("uploading");
      const prompt = getPrompt();
      addLog(`Uploading shell + starting Meshy retexture: "${prompt}"`);

      const { taskId: newTaskId, sizeKB } =
        await textureServiceRef.current.startTexture(
          glbBlob,
          `${shellKey}_${Date.now()}.glb`,
          prompt,
        );
      setTaskId(newTaskId);
      addLog(`Uploaded: ${sizeKB}KB. Task started: ${newTaskId}`);
      setProgress(35);
      setStage("texturing");

      // Step 5: Poll for completion
      const status = await textureServiceRef.current.waitForCompletion(
        newTaskId,
        (s: TextureTaskStatus) => {
          setProgress(35 + s.progress * 0.55); // 35-90%
          if (s.progress > 0) {
            addLog(`Texturing ${s.status}: ${Math.round(s.progress)}%`);
          }
        },
      );
      addLog("Texture generation complete!");

      // Step 6: Load the textured GLB into the viewer
      setStage("loading-result");
      setProgress(90);
      addLog("Loading textured model...");

      const downloadUrl = textureServiceRef.current.getDownloadUrl(newTaskId);
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(downloadUrl);

      viewerRef.current?.clearOverlays();

      // Add the textured mesh to the overlay group
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material.side = THREE.DoubleSide;
        }
      });

      // Show textured result — preserves Meshy's PBR materials
      viewerRef.current?.showTexturedResult(gltf.scene);

      setProgress(100);
      setStage("done");
      addLog(
        `Done! Textured ${selectedSlot}/${selectedBulk}. Task: ${newTaskId}`,
      );

      if (status.textureUrls) {
        addLog(
          `PBR maps: base=${!!status.textureUrls.baseColor} normal=${!!status.textureUrls.normal} metallic=${!!status.textureUrls.metallic} roughness=${!!status.textureUrls.roughness}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStage("error");
      addLog(`ERROR: ${msg}`);
    }
  }, [
    avatarUrl,
    selectedSlot,
    selectedBulk,
    extractionResult,
    getPrompt,
    addLog,
  ]);

  const handleDownload = useCallback(() => {
    if (!taskId || !textureServiceRef.current) return;
    const url = textureServiceRef.current.getDownloadUrl(taskId);
    const a = document.createElement("a");
    a.href = url;
    a.download = `textured_${selectedSlot}_${selectedBulk}.glb`;
    a.click();
  }, [taskId, selectedSlot, selectedBulk]);

  const handleReset = useCallback(() => {
    viewerRef.current?.clear();
    setStage("idle");
    setProgress(0);
    setTaskId(null);
    setError(null);
    setLogs([]);
    setExtractionResult(null);
  }, []);

  const isRunning = stage !== "idle" && stage !== "done" && stage !== "error";

  return (
    <div className="flex h-full">
      {/* Left panel — Controls */}
      <div className="w-80 flex-shrink-0 border-r border-border-primary bg-bg-primary overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Paintbrush size={20} className="text-primary" />
              Texture Generator
            </h2>
            <p className="text-xs text-text-tertiary mt-1">
              POC-2: AI texture generation on shells via Meshy
            </p>
          </div>

          {/* Avatar Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Avatar
            </label>
            <select
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value);
                setExtractionResult(null); // force re-extract
              }}
              className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary"
            >
              {AVATAR_OPTIONS.map((opt) => (
                <option key={opt.url} value={opt.url}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Slot Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Slot
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {ALL_SLOTS.map((slot) => (
                <button
                  key={slot}
                  onClick={() => setSelectedSlot(slot)}
                  className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                    selectedSlot === slot
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-bg-secondary text-text-tertiary border border-border-primary hover:border-border-secondary"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk Class */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Bulk Class
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_BULKS.map((bulk) => (
                <button
                  key={bulk}
                  onClick={() => setSelectedBulk(bulk)}
                  className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                    selectedBulk === bulk
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-bg-secondary text-text-tertiary border border-border-primary hover:border-border-secondary"
                  }`}
                >
                  {bulk} ({BULK_OFFSETS[bulk] * 1000}mm)
                </button>
              ))}
            </div>
          </div>

          {/* Material Preset */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Material Preset
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {MATERIAL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setSelectedPreset(preset.id);
                    setCustomPrompt("");
                  }}
                  className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all text-left ${
                    selectedPreset === preset.id && !customPrompt
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-bg-secondary text-text-tertiary border border-border-primary hover:border-border-secondary"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Custom Prompt (overrides preset)
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g., gold-trimmed bronze plate armor, ornate engravings..."
              rows={3}
              className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary resize-none"
            />
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2 border-t border-border-primary">
            <button
              onClick={handleGenerate}
              disabled={isRunning}
              className="w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2
                bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {stage === "extracting"
                    ? "Extracting Shell..."
                    : stage === "uploading"
                      ? "Uploading..."
                      : stage === "texturing"
                        ? "Texturing..."
                        : "Loading Result..."}
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate Texture
                </>
              )}
            </button>

            <div className="flex gap-2">
              <button
                onClick={handleDownload}
                disabled={!taskId || stage !== "done"}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5
                  bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary hover:border-border-secondary
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={14} />
                Download GLB
              </button>

              <button
                onClick={handleReset}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5
                  bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary hover:border-border-secondary"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>

            {/* Add to Kit — only when texture is done */}
            {stage === "done" && onAddToKit && taskId && extractionResult && (
              <button
                onClick={() => {
                  const shellKey = `${selectedSlot}_${selectedBulk}`;
                  const shell = extractionResult.shells.get(shellKey);
                  if (shell && textureServiceRef.current) {
                    const downloadUrl =
                      textureServiceRef.current.getDownloadUrl(taskId);
                    onAddToKit(shell, downloadUrl);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2
                  bg-green-600 text-white hover:bg-green-500"
              >
                <Wand2 size={16} />
                Add to Kit &amp; Preview
              </button>
            )}
          </div>

          {/* Progress */}
          {isRunning && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-text-tertiary">
                <span>{stage}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
              <AlertCircle
                size={14}
                className="text-red-400 mt-0.5 flex-shrink-0"
              />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Info box */}
          <div className="p-3 bg-bg-secondary rounded-lg border border-border-primary space-y-1.5">
            <h3 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <Info size={12} />
              Requirements
            </h3>
            <ul className="text-xs text-text-tertiary space-y-0.5 list-disc pl-3">
              <li>MESHY_API_KEY must be set in server .env</li>
              <li>Shell is sent as base64 data URI (no public URL needed)</li>
              <li>Each retexture call costs ~$0.20 and takes 2-5 min</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Center — 3D Viewer */}
      <div className="flex-1 flex flex-col">
        <ShellPreviewViewer ref={viewerRef} className="flex-1" />

        {/* Bottom log panel */}
        <div className="h-36 border-t border-border-primary bg-bg-primary overflow-y-auto">
          <div className="p-2 space-y-0.5">
            {logs.length === 0 ? (
              <p className="text-xs text-text-tertiary italic">
                Select a shell and material, then click &quot;Generate
                Texture&quot; to begin POC-2
              </p>
            ) : (
              logs.map((log, i) => (
                <p
                  key={i}
                  className={`text-xs font-mono ${
                    log.includes("ERROR")
                      ? "text-red-400"
                      : log.includes("complete") || log.includes("Done")
                        ? "text-green-400"
                        : "text-text-tertiary"
                  }`}
                >
                  {log}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
