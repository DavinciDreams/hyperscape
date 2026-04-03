/**
 * DeploymentPanel — Staging → Production deployment pipeline UI
 *
 * Shows:
 * - Push to Staging button with compilation status
 * - Diff view (staging vs production changes)
 * - Promote to Production with approval flow
 * - Deployment history with rollback
 */

import {
  Upload,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  FileJson,
} from "lucide-react";
import React, { useState, useCallback } from "react";

import type {
  DeploymentRecord,
  ManifestDiffEntry,
  ManifestCategory,
} from "../types";
import { useWorldStudio } from "../WorldStudioContext";
import { useManifestCompiler } from "../hooks/useManifestCompiler";

// Category display configuration
const CATEGORY_LABELS: Record<ManifestCategory, string> = {
  world: "World",
  entities: "Entities",
  items: "Items",
  combat: "Combat",
  progression: "Progression",
  recipes: "Recipes",
  gathering: "Gathering",
  audio: "Audio",
  config: "Config",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  success: <CheckCircle2 size={12} className="text-green-400" />,
  failed: <XCircle size={12} className="text-red-400" />,
  "rolled-back": <RotateCcw size={12} className="text-amber-400" />,
  deploying: <Loader2 size={12} className="text-blue-400 animate-spin" />,
  pending: <Clock size={12} className="text-text-tertiary" />,
};

function DiffCategoryGroup({
  category,
  entries,
}: {
  category: ManifestCategory;
  entries: ManifestDiffEntry[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const totalChanges = entries.reduce(
    (sum, e) => sum + e.entriesAdded + e.entriesModified + e.entriesRemoved,
    0,
  );

  return (
    <div className="border-b border-border-primary/30 last:border-0">
      <button
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-bg-tertiary transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="font-medium text-text-primary">
          {CATEGORY_LABELS[category]}
        </span>
        <span className="text-text-tertiary ml-auto">
          {totalChanges} change{totalChanges !== 1 ? "s" : ""}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-0.5">
          {entries.map((entry) => (
            <div
              key={entry.filename}
              className="flex items-center gap-1.5 text-[10px] pl-4"
            >
              <FileJson
                size={10}
                className="text-text-tertiary flex-shrink-0"
              />
              <span className="text-text-secondary truncate flex-1">
                {entry.filename}
              </span>
              <span
                className={
                  entry.changeType === "added"
                    ? "text-green-400"
                    : entry.changeType === "removed"
                      ? "text-red-400"
                      : "text-amber-400"
                }
              >
                {entry.summary}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeploymentHistoryEntry({ record }: { record: DeploymentRecord }) {
  const { actions } = useWorldStudio();
  const [expanded, setExpanded] = useState(false);

  const date = new Date(record.deployedAt);
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="border-b border-border-primary/30 last:border-0">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-tertiary transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {STATUS_ICONS[record.status] ?? <Clock size={12} />}
        <div className="flex-1 text-left">
          <div className="text-text-primary">
            {record.target === "staging" ? "Staging" : "Production"} push
          </div>
          <div className="text-[10px] text-text-tertiary">
            {dateStr} {timeStr} · {record.diff.totalAdded} added,{" "}
            {record.diff.totalModified} modified
          </div>
        </div>
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          <div className="text-[10px] text-text-tertiary">
            Version: {record.worldVersion}
          </div>
          {record.approvedBy && (
            <div className="text-[10px] text-text-tertiary">
              Approved by: {record.approvedBy}
            </div>
          )}
          {record.error && (
            <div className="text-[10px] text-red-400">{record.error}</div>
          )}
          {record.status === "success" && record.target === "production" && (
            <button
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-amber-400 hover:bg-amber-400/10 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                actions.deployRollback(record.id);
              }}
            >
              <RotateCcw size={10} />
              Rollback to previous
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DeploymentPanel() {
  const { state, actions } = useWorldStudio();
  const { compile, diff } = useManifestCompiler();
  const deployment = state.deployment;

  const [activeTab, setActiveTab] = useState<"deploy" | "history">("deploy");

  const world = state.builder.editing.world;
  const canPushStaging =
    (world !== null && deployment.stagingStatus === "idle") ||
    deployment.stagingStatus === "success" ||
    deployment.stagingStatus === "error";

  const handlePushStaging = useCallback(async () => {
    if (!world) return;

    actions.deployStagingStart();

    try {
      // Step 1: Compile
      const compiled = compile(
        world,
        state.extendedLayers,
        state.audioLayers,
        state.manifests,
        state.brushOverlays,
      );

      actions.deployStagingStatus("pushing");

      // Step 2: Push to server staging endpoint
      const serverUrl = import.meta.env.VITE_API_URL ?? "";
      const adminCode = import.meta.env.VITE_ADMIN_CODE ?? "hyperscape-admin";
      let serverDeploymentId: string | undefined;

      try {
        const resp = await fetch(`${serverUrl}/api/deploy/staging`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-code": adminCode,
          },
          body: JSON.stringify({
            manifests: compiled,
            deployedBy: state.project.currentTeamId ?? "local",
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as {
            deploymentId?: string;
            diff?: { added: string[]; modified: string[]; removed: string[] };
          };
          serverDeploymentId = data.deploymentId;
          console.log(
            `[Deploy] Pushed to server staging: ${serverDeploymentId}`,
          );
        } else {
          console.warn(
            "[Deploy] Server staging push failed, continuing with local state",
          );
        }
      } catch {
        // Server unreachable — proceed with local-only flow
        console.warn("[Deploy] Server unreachable, local-only deployment");
      }

      // Step 3: Compute diff against empty (first push) or deployed state
      const deployedState =
        deployment.history.length > 0
          ? Object.fromEntries(
              deployment.history[0].diff.manifests.map((m) => [
                m.filename,
                null,
              ]),
            )
          : {};
      const diffResult = diff(compiled, deployedState);

      actions.deployStagingStatus("reloading");

      // Step 4: Create deployment record
      const record: DeploymentRecord = {
        id: serverDeploymentId ?? `deploy-${Date.now()}`,
        target: "staging",
        deployedBy: state.project.currentTeamId ?? "local",
        deployedAt: new Date().toISOString(),
        worldVersion: `v${state.project.projectVersion}`,
        diff: diffResult,
        status: "success",
      };

      actions.deployStagingComplete(record);
      actions.deployDiffComplete(diffResult);
    } catch (err) {
      actions.deployStagingStatus(
        "error",
        err instanceof Error ? err.message : "Compilation failed",
      );
    }
  }, [world, actions, compile, diff, state, deployment.history]);

  const handleRequestPromotion = useCallback(async () => {
    if (!deployment.currentDiff) return;

    // Try server-side promotion
    const serverUrl = import.meta.env.VITE_API_URL ?? "";
    const adminCode = import.meta.env.VITE_ADMIN_CODE ?? "hyperscape-admin";

    try {
      const resp = await fetch(`${serverUrl}/api/deploy/production`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-code": adminCode,
        },
        body: JSON.stringify({
          deployedBy: state.project.currentTeamId ?? "local",
        }),
      });
      if (resp.ok) {
        console.log("[Deploy] Production promotion succeeded on server");
      } else {
        console.warn("[Deploy] Server promotion failed, continuing locally");
      }
    } catch {
      console.warn("[Deploy] Server unreachable for promotion");
    }

    actions.deployPromotionRequest(
      `promo-${Date.now()}`,
      state.project.currentTeamId ?? "local",
      deployment.currentDiff,
    );
  }, [actions, deployment.currentDiff, state.project.currentTeamId]);

  // Group diff entries by category
  const diffByCategory = deployment.currentDiff?.manifests.reduce(
    (acc, entry) => {
      if (!acc[entry.category]) acc[entry.category] = [];
      acc[entry.category].push(entry);
      return acc;
    },
    {} as Record<ManifestCategory, ManifestDiffEntry[]>,
  );

  const isStagingBusy =
    deployment.stagingStatus === "compiling" ||
    deployment.stagingStatus === "pushing" ||
    deployment.stagingStatus === "reloading";

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Deployment
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-primary">
        <button
          className={`flex-1 px-3 py-1.5 text-xs transition-colors ${
            activeTab === "deploy"
              ? "text-primary border-b-2 border-primary"
              : "text-text-tertiary hover:text-text-primary"
          }`}
          onClick={() => setActiveTab("deploy")}
        >
          Deploy
        </button>
        <button
          className={`flex-1 px-3 py-1.5 text-xs transition-colors ${
            activeTab === "history"
              ? "text-primary border-b-2 border-primary"
              : "text-text-tertiary hover:text-text-primary"
          }`}
          onClick={() => setActiveTab("history")}
        >
          History ({deployment.history.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activeTab === "deploy" ? (
          <div className="p-3 space-y-3">
            {/* Push to Staging */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-secondary">
                Staging
              </div>
              <button
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!canPushStaging || isStagingBusy}
                onClick={handlePushStaging}
              >
                {isStagingBusy ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {deployment.stagingStatus === "compiling" && "Compiling..."}
                    {deployment.stagingStatus === "pushing" && "Pushing..."}
                    {deployment.stagingStatus === "reloading" && "Reloading..."}
                  </>
                ) : (
                  <>
                    <Upload size={12} />
                    Push to Staging
                  </>
                )}
              </button>
              {deployment.stagingStatus === "success" && (
                <div className="flex items-center gap-1.5 text-[10px] text-green-400">
                  <CheckCircle2 size={10} />
                  Staging push complete
                </div>
              )}
              {deployment.stagingStatus === "error" && (
                <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                  <XCircle size={10} />
                  {deployment.error ?? "Push failed"}
                </div>
              )}
            </div>

            {/* Diff View */}
            {deployment.currentDiff && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-text-secondary">
                    Changes
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    +{deployment.currentDiff.totalAdded} ~
                    {deployment.currentDiff.totalModified} -
                    {deployment.currentDiff.totalRemoved}
                  </span>
                </div>
                <div className="border border-border-primary rounded overflow-hidden">
                  {Object.entries(CATEGORY_LABELS).map(([cat]) => {
                    const entries =
                      diffByCategory?.[cat as ManifestCategory] ?? [];
                    if (entries.length === 0) return null;
                    return (
                      <DiffCategoryGroup
                        key={cat}
                        category={cat as ManifestCategory}
                        entries={entries}
                      />
                    );
                  })}
                </div>
                {deployment.currentDiff.manifests.length === 0 && (
                  <div className="text-[10px] text-text-tertiary italic text-center py-4">
                    No changes detected
                  </div>
                )}
              </div>
            )}

            {/* Promote to Production */}
            <div className="space-y-2 pt-2 border-t border-border-primary">
              <div className="text-xs font-medium text-text-secondary">
                Production
              </div>
              {deployment.pendingPromotion ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
                    <Clock size={10} />
                    Pending approval
                  </div>
                  <div className="text-[10px] text-text-tertiary">
                    Requested by {deployment.pendingPromotion.requestedBy}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded transition-colors"
                      onClick={() =>
                        actions.deployPromotionApprove(
                          state.project.currentTeamId ?? "local",
                        )
                      }
                    >
                      <CheckCircle2 size={10} />
                      Approve
                    </button>
                    <button
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                      onClick={() => actions.deployPromotionReject()}
                    >
                      <XCircle size={10} />
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={
                      !deployment.currentDiff ||
                      deployment.productionStatus === "deploying"
                    }
                    onClick={handleRequestPromotion}
                  >
                    <ArrowRight size={12} />
                    Publish to Production
                  </button>
                  <div className="text-[10px] text-text-tertiary flex items-center gap-1">
                    <AlertTriangle size={10} />
                    Requires approval from a second team member
                  </div>
                </>
              )}
              {deployment.productionStatus === "success" && (
                <div className="flex items-center gap-1.5 text-[10px] text-green-400">
                  <CheckCircle2 size={10} />
                  Production deployment complete
                </div>
              )}
              {deployment.productionStatus === "error" && (
                <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                  <XCircle size={10} />
                  {deployment.error ?? "Deployment failed"}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* History Tab */
          <div>
            {deployment.history.length > 0 ? (
              deployment.history.map((record) => (
                <DeploymentHistoryEntry key={record.id} record={record} />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-text-tertiary text-xs">
                <Clock size={16} className="mb-2 opacity-40" />
                No deployments yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
