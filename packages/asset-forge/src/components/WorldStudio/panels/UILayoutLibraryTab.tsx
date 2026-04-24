/**
 * UILayoutLibraryTab — studio-embedded UI Layout browser.
 *
 * Variant of `UILayoutLibraryPanel` that binds to the current
 * World Studio project's team (no team picker) and opens layouts
 * by navigating to the asset-scoped editor route.
 *
 * Lives in the Content/Validation/Console/History dock as a
 * sibling tab, so authors can create and jump into UI layouts
 * without leaving the studio shell.
 */

import {
  UILayoutManifestSchema,
  type UILayoutManifest,
} from "@hyperforge/ui-framework";
import { CheckCircle2, FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { buildUILayoutEditorPath } from "../../../constants";
import {
  createUILayout,
  listTeamUILayouts,
  type UILayoutSummary,
} from "../../../utils/uiLayoutApi";
import { fetchGame } from "../../../utils/worldProjectApi";
import { useStudioProject } from "../WorldStudioContext";

// Same starter as UILayoutLibraryPanel — deliberately duplicated here
// so editor code does not depend on the standalone library component.
// If the starter template grows beyond "empty", hoist it to a shared
// helper under `utils/uiLayoutApi.ts`.
function makeStarterLayout(name: string, id: string): UILayoutManifest {
  return UILayoutManifestSchema.parse({
    id,
    name,
    grid: { columns: 24, rows: 16 },
    instances: [],
  });
}

type LoadStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; layouts: UILayoutSummary[] };

export function UILayoutLibraryTab() {
  const navigate = useNavigate();
  const { currentTeamId, currentGameId } = useStudioProject();

  const [status, setStatus] = useState<LoadStatus>({ kind: "idle" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Which layout is pinned as active for the current game. Used to
  // render the "ACTIVE" badge on the matching row. Silently null when
  // no game is loaded.
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTeamId || !currentGameId) {
      setActiveLayoutId(null);
      return;
    }
    let cancelled = false;
    fetchGame(currentTeamId, currentGameId)
      .then((g) => {
        if (!cancelled) setActiveLayoutId(g.activeUiLayoutId);
      })
      .catch(() => {
        if (!cancelled) setActiveLayoutId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTeamId, currentGameId]);

  const reload = useCallback((teamId: string) => {
    setStatus({ kind: "loading" });
    listTeamUILayouts(teamId)
      .then((layouts) => setStatus({ kind: "ready", layouts }))
      .catch((err: unknown) => {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }, []);

  useEffect(() => {
    if (!currentTeamId) {
      setStatus({ kind: "idle" });
      return;
    }
    reload(currentTeamId);
  }, [currentTeamId, reload]);

  const handleCreate = async () => {
    if (!currentTeamId || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const ts = Date.now();
      const manifestId = `layout_${ts}`;
      const displayName = `New Layout ${new Date(ts).toLocaleTimeString()}`;
      const manifest = makeStarterLayout(displayName, manifestId);
      const created = await createUILayout(currentTeamId, {
        name: displayName,
        manifestData: manifest,
      });
      navigate(buildUILayoutEditorPath(currentTeamId, created.id));
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const sortedLayouts = useMemo(() => {
    if (status.kind !== "ready") return [];
    return [...status.layouts].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [status]);

  if (!currentTeamId) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
        Load a project to browse its UI layouts.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border-primary/30 px-3 py-1">
        <span className="text-[10px] text-text-tertiary">
          {status.kind === "ready"
            ? `${status.layouts.length} layout${
                status.layouts.length === 1 ? "" : "s"
              }`
            : ""}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => reload(currentTeamId)}
            className="flex items-center gap-1 rounded border border-border-primary/50 bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-tertiary hover:border-primary/50 hover:text-primary"
            title="Refresh"
          >
            <RefreshCw size={10} />
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1 rounded border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <Plus size={10} />
            )}
            New
          </button>
        </div>
      </div>

      {createError && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] text-red-400">
          Failed to create: {createError}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {status.kind === "loading" && (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={16} className="animate-spin text-primary" />
          </div>
        )}

        {status.kind === "error" && (
          <p className="p-3 text-xs text-red-400">
            Failed to load: {status.message}
          </p>
        )}

        {status.kind === "ready" && sortedLayouts.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <FileText size={20} className="text-text-tertiary" />
            <p className="text-xs text-text-secondary">No UI layouts yet.</p>
            <p className="text-[10px] text-text-tertiary">
              Click &quot;New&quot; to create one.
            </p>
          </div>
        )}

        {status.kind === "ready" && sortedLayouts.length > 0 && (
          <ul className="flex flex-col">
            {sortedLayouts.map((layout) => (
              <li key={layout.id}>
                <button
                  onClick={() =>
                    navigate(buildUILayoutEditorPath(currentTeamId, layout.id))
                  }
                  className="flex w-full items-center gap-2 border-b border-border-primary/30 px-3 py-1.5 text-left text-xs hover:bg-bg-tertiary/50"
                >
                  <FileText size={12} className="text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-text-primary">
                      {layout.name}
                      {activeLayoutId === layout.id && (
                        <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 text-[9px] text-amber-400">
                          <CheckCircle2 size={8} />
                          ACTIVE
                        </span>
                      )}
                      {layout.isTemplate && (
                        <span className="ml-2 rounded bg-primary/15 px-1 text-[9px] text-primary">
                          TPL
                        </span>
                      )}
                      {layout.isPublic && (
                        <span className="ml-1 rounded bg-amber-500/15 px-1 text-[9px] text-amber-400">
                          PUB
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[10px] text-text-tertiary">
                      {layout.slug} · v{layout.version} ·{" "}
                      {new Date(layout.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
