import {
  Package,
  Play,
  Download,
  RotateCcw,
  Loader2,
  Upload,
  PersonStanding,
  Eye,
  EyeOff,
} from "lucide-react";
import React, { useRef, useState, useCallback } from "react";
import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";

import { ShellExtractionService } from "../../services/armor-pipeline/ShellExtractionService";
import { ShellRiggingService } from "../../services/armor-pipeline/ShellRiggingService";
import {
  AVATAR_OPTIONS,
  ANIMATION_URLS,
  SLOT_LABELS,
} from "../../services/armor-pipeline/constants";
import type {
  RiggedArmorResult,
  EquipmentSlotName,
} from "../../services/armor-pipeline/types";
import type { ArmorKitPiece } from "../../pages/ArmorPipelinePage";
import {
  ShellPreviewViewer,
  type ShellPreviewViewerRef,
} from "./ShellPreviewViewer";

interface ArmorPreviewTabProps {
  /** Full armor kit from the pipeline (accumulated from TextureGeneratorTab) */
  armorKit: Map<string, ArmorKitPiece>;
}

export const ArmorPreviewTab: React.FC<ArmorPreviewTabProps> = ({
  armorKit,
}) => {
  const viewerRef = useRef<ShellPreviewViewerRef>(null);
  const shellServiceRef = useRef<ShellExtractionService | null>(null);
  const riggingServiceRef = useRef<ShellRiggingService | null>(null);

  // State
  const [avatarUrl, setAvatarUrl] = useState(AVATAR_OPTIONS[0].url);
  const [isRigging, setIsRigging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Per-piece state
  const [riggedPieces, setRiggedPieces] = useState<
    Map<string, RiggedArmorResult>
  >(new Map());
  /** Which kit pieces are enabled for rigging */
  const [enabledPieces, setEnabledPieces] = useState<Set<string>>(new Set());
  /** Which rigged pieces are currently visible */
  const [visiblePieces, setVisiblePieces] = useState<Set<string>>(new Set());

  // Sync enabledPieces when kit changes — auto-enable new pieces
  React.useEffect(() => {
    setEnabledPieces((prev) => {
      const next = new Set(prev);
      for (const key of armorKit.keys()) {
        next.add(key); // auto-enable new pieces
      }
      // Remove pieces no longer in kit
      for (const key of next) {
        if (!armorKit.has(key)) next.delete(key);
      }
      return next;
    });
  }, [armorKit]);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [
      ...prev.slice(-50),
      `[${new Date().toLocaleTimeString()}] ${msg}`,
    ]);
  }, []);

  /** Parse slot label from key like "body_plate" */
  const pieceLabel = (key: string) => {
    const [slot, bulk] = key.split("_");
    const slotLabel = SLOT_LABELS[slot as EquipmentSlotName] ?? slot;
    return `${slotLabel} (${bulk})`;
  };

  /** Rig all enabled pieces */
  const handleRigAll = useCallback(async () => {
    const piecesToRig = Array.from(enabledPieces).filter((k) =>
      armorKit.has(k),
    );
    if (piecesToRig.length === 0) {
      setError("No pieces to rig. Texture some shells first (Tab 2).");
      return;
    }

    setIsRigging(true);
    setError(null);
    setRiggedPieces(new Map());
    setVisiblePieces(new Set());

    try {
      if (!shellServiceRef.current) {
        shellServiceRef.current = new ShellExtractionService();
      }
      if (!riggingServiceRef.current) {
        riggingServiceRef.current = new ShellRiggingService();
      }

      // Load VRM once for all pieces
      addLog(`Loading avatar: ${avatarUrl}`);
      const {
        vrm,
        skeleton: vrmSkeleton,
        scene: vrmScene,
      } = await shellServiceRef.current.loadVRM(avatarUrl);

      // Set up the avatar in the viewer (ghost material + mixer)
      viewerRef.current?.setupAvatar(vrmScene, vrm as unknown as VRM);
      addLog("Avatar loaded. Rigging pieces...");

      // Rig each piece
      const newRigged = new Map<string, RiggedArmorResult>();
      const newVisible = new Set<string>();

      for (const key of piecesToRig) {
        const piece = armorKit.get(key)!;
        addLog(`Rigging ${pieceLabel(key)}...`);

        const result = await riggingServiceRef.current.rigTexturedShell(
          piece.shell,
          piece.texturedUrl,
          vrmSkeleton,
        );

        newRigged.set(key, result);
        newVisible.add(key);

        // Add to viewer
        viewerRef.current?.addArmorPiece(key, result.skinnedMesh);

        addLog(
          `  ${pieceLabel(key)}: ${result.vertexCount} verts, match=${result.vertexMatch}`,
        );
      }

      setRiggedPieces(newRigged);
      setVisiblePieces(newVisible);
      addLog(
        `All ${piecesToRig.length} pieces rigged. Use animation buttons to test.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog(`ERROR: ${msg}`);
    } finally {
      setIsRigging(false);
    }
  }, [avatarUrl, armorKit, enabledPieces, addLog]);

  /** Toggle a piece's enabled state (for rigging) */
  const toggleEnabled = (key: string) => {
    setEnabledPieces((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** Toggle a rigged piece's visibility */
  const toggleVisible = (key: string) => {
    const isVisible = visiblePieces.has(key);
    const newVisible = new Set(visiblePieces);
    if (isVisible) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setVisiblePieces(newVisible);
    viewerRef.current?.setArmorPieceVisible(key, !isVisible);
  };

  /** Play an animation */
  const handlePlayAnimation = useCallback(
    async (animUrl: string, name: string) => {
      if (riggedPieces.size === 0) return;
      try {
        addLog(`Playing animation: ${name}`);
        setIsAnimating(true);
        await viewerRef.current?.playAnimation(animUrl);
      } catch (err) {
        addLog(`Animation error: ${err}`);
      }
    },
    [riggedPieces, addLog],
  );

  /** Stop animation (T-Pose) */
  const handleStopAnimation = useCallback(() => {
    viewerRef.current?.stopAnimation();
    setIsAnimating(false);
    addLog("Stopped animation (T-Pose)");
  }, [addLog]);

  /** Download all visible rigged pieces as GLBs */
  const handleDownloadAll = useCallback(async () => {
    if (!riggingServiceRef.current) return;

    for (const [key, result] of riggedPieces) {
      if (!visiblePieces.has(key)) continue;
      try {
        addLog(`Exporting ${pieceLabel(key)}...`);
        const blob = await riggingServiceRef.current.exportRiggedGLB(result);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rigged_${key}.glb`;
        a.click();
        URL.revokeObjectURL(url);
        addLog(`  ${pieceLabel(key)}: ${(blob.size / 1024).toFixed(1)}KB`);
      } catch (err) {
        addLog(`Export error for ${key}: ${err}`);
      }
    }
  }, [riggedPieces, visiblePieces, addLog]);

  /** Load a local GLB for a specific slot */
  const handleLoadGLB = useCallback(() => {
    // For standalone testing — uses the first enabled piece's shell as reference
    const firstKey = Array.from(enabledPieces).find((k) => armorKit.has(k));
    if (!firstKey) {
      setError("No kit pieces available. Texture shells in Tab 2 first.");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".glb,.gltf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const piece = armorKit.get(firstKey)!;
      const fileUrl = URL.createObjectURL(file);

      setIsRigging(true);
      setError(null);

      try {
        if (!shellServiceRef.current)
          shellServiceRef.current = new ShellExtractionService();
        if (!riggingServiceRef.current)
          riggingServiceRef.current = new ShellRiggingService();

        addLog(`Loading avatar: ${avatarUrl}`);
        const {
          vrm,
          skeleton: vrmSkeleton,
          scene: vrmScene,
        } = await shellServiceRef.current.loadVRM(avatarUrl);

        if (riggedPieces.size === 0) {
          viewerRef.current?.setupAvatar(vrmScene, vrm as unknown as VRM);
        }

        addLog(`Rigging local GLB: ${file.name}`);
        const result = await riggingServiceRef.current.rigTexturedShell(
          piece.shell,
          fileUrl,
          vrmSkeleton,
        );
        URL.revokeObjectURL(fileUrl);

        const key = `${result.slotName}_${result.bulkClass}`;
        viewerRef.current?.addArmorPiece(key, result.skinnedMesh);

        setRiggedPieces((prev) => new Map(prev).set(key, result));
        setVisiblePieces((prev) => new Set(prev).add(key));
        addLog(`Rigged ${pieceLabel(key)} from local file.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        addLog(`ERROR: ${msg}`);
      } finally {
        setIsRigging(false);
      }
    };
    input.click();
  }, [avatarUrl, armorKit, enabledPieces, riggedPieces, addLog]);

  /** Reset everything */
  const handleReset = useCallback(() => {
    viewerRef.current?.clear();
    setRiggedPieces(new Map());
    setVisiblePieces(new Set());
    setError(null);
    setLogs([]);
    setIsAnimating(false);
  }, []);

  const hasKit = armorKit.size > 0;
  const hasRigged = riggedPieces.size > 0;

  return (
    <div className="flex h-full">
      {/* Left panel — Controls */}
      <div className="w-80 flex-shrink-0 border-r border-border-primary bg-bg-primary overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Header */}
          <div>
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Package size={20} className="text-primary" />
              Armor Preview
            </h2>
            <p className="text-xs text-text-tertiary mt-1">
              POC-3: Rig &amp; preview armor kit on animated avatar
            </p>
          </div>

          {/* Avatar Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Avatar
            </label>
            <select
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary"
            >
              {AVATAR_OPTIONS.map((opt) => (
                <option key={opt.url} value={opt.url}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Kit Pieces */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              Armor Kit ({armorKit.size} piece{armorKit.size !== 1 ? "s" : ""})
            </label>
            {!hasKit ? (
              <p className="text-xs text-text-tertiary italic px-1">
                No pieces yet. Texture shells in Tab 2 and click &quot;Add to
                Kit&quot;.
              </p>
            ) : (
              <div className="space-y-1">
                {Array.from(armorKit.keys()).map((key) => {
                  const isEnabled = enabledPieces.has(key);
                  const isRiggedPiece = riggedPieces.has(key);
                  const isVisible = visiblePieces.has(key);

                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-bg-secondary border border-border-primary"
                    >
                      {/* Enable checkbox (pre-rig) */}
                      {!hasRigged && (
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => toggleEnabled(key)}
                          className="accent-primary"
                        />
                      )}

                      {/* Visibility toggle (post-rig) */}
                      {hasRigged && isRiggedPiece && (
                        <button
                          onClick={() => toggleVisible(key)}
                          className="text-text-tertiary hover:text-text-primary"
                          title={isVisible ? "Hide" : "Show"}
                        >
                          {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                      )}

                      <span
                        className={`text-xs font-medium flex-1 ${
                          (hasRigged ? isVisible : isEnabled)
                            ? "text-text-primary"
                            : "text-text-tertiary"
                        }`}
                      >
                        {pieceLabel(key)}
                      </span>

                      {isRiggedPiece && (
                        <span className="text-[10px] text-green-400">
                          rigged
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rig Actions */}
          <div className="space-y-2 pt-2 border-t border-border-primary">
            <button
              onClick={handleRigAll}
              disabled={isRigging || !hasKit || enabledPieces.size === 0}
              className="w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2
                bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRigging ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Rigging...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Rig {enabledPieces.size} Piece
                  {enabledPieces.size !== 1 ? "s" : ""}
                </>
              )}
            </button>

            <button
              onClick={handleLoadGLB}
              disabled={isRigging || !hasKit}
              className="w-full px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5
                bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary hover:border-border-secondary
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={14} />
              Load Local GLB
            </button>
          </div>

          {/* Animation Controls */}
          {hasRigged && (
            <div className="space-y-2 pt-2 border-t border-border-primary">
              <label className="text-sm font-medium text-text-secondary">
                Animation
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={handleStopAnimation}
                  className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                    !isAnimating
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-bg-secondary text-text-tertiary border border-border-primary hover:border-border-secondary"
                  }`}
                >
                  <PersonStanding size={12} />
                  T-Pose
                </button>
                <button
                  onClick={() =>
                    handlePlayAnimation(ANIMATION_URLS.walking, "Walk")
                  }
                  className="px-2 py-1.5 rounded-md text-xs font-medium bg-bg-secondary text-text-tertiary border border-border-primary hover:border-border-secondary transition-all flex items-center justify-center gap-1"
                >
                  <Play size={12} />
                  Walk
                </button>
                <button
                  onClick={() =>
                    handlePlayAnimation(ANIMATION_URLS.running, "Run")
                  }
                  className="px-2 py-1.5 rounded-md text-xs font-medium bg-bg-secondary text-text-tertiary border border-border-primary hover:border-border-secondary transition-all flex items-center justify-center gap-1"
                >
                  <Play size={12} />
                  Run
                </button>
              </div>
            </div>
          )}

          {/* Export + Reset */}
          {hasRigged && (
            <div className="flex gap-2">
              <button
                onClick={handleDownloadAll}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5
                  bg-bg-secondary border border-border-primary text-text-secondary hover:text-text-primary hover:border-border-secondary"
              >
                <Download size={14} />
                Download All
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
          )}

          {/* Stats */}
          {hasRigged && (
            <div className="p-3 bg-bg-secondary rounded-lg border border-border-primary space-y-1">
              <h3 className="text-xs font-semibold text-text-primary">
                Rigging Stats
              </h3>
              {Array.from(riggedPieces.entries()).map(([key, result]) => (
                <p key={key} className="text-xs text-text-tertiary">
                  {pieceLabel(key)}: {result.vertexCount} verts
                  {result.vertexMatch ? " (direct)" : " (nearest)"}
                </p>
              ))}
              <p className="text-xs text-text-tertiary mt-1">
                Total bones:{" "}
                {riggedPieces.values().next().value?.skeleton.bones.length ?? 0}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Center — 3D Viewer */}
      <div className="flex-1 flex flex-col">
        <ShellPreviewViewer ref={viewerRef} className="flex-1" />

        {/* Bottom log panel */}
        <div className="h-32 border-t border-border-primary bg-bg-primary overflow-y-auto">
          <div className="p-2 space-y-0.5">
            {logs.length === 0 ? (
              <p className="text-xs text-text-tertiary italic">
                Add textured pieces from Tab 2, then click &quot;Rig&quot; to
                preview full armor kit
              </p>
            ) : (
              logs.map((log, i) => (
                <p
                  key={i}
                  className={`text-xs font-mono ${
                    log.includes("ERROR")
                      ? "text-red-400"
                      : log.includes("rigged") || log.includes("All")
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
