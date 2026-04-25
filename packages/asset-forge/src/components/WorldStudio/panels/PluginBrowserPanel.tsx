/**
 * PluginBrowserPanel — Phase I5 plugin catalog tab for the bottom dock.
 *
 * Read-only slice:
 *   1. On mount, fetches `GET /api/plugins/registry` (listed
 *      newest-first by the server).
 *   2. Renders a searchable list — filter matches against plugin id,
 *      name, description, and tags.
 *   3. Clicking a row expands it inline and fetches the full bundle
 *      descriptor (lazy — each detail is a second round-trip).
 *
 * Out-of-scope for this cut: install/uninstall controls, enable
 * toggles, dependency tree view. Those surface in later I5 slices
 * once the runtime side of plugin install lands.
 */

import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getPublishedPlugin,
  listPublishedPlugins,
  type PluginRegistryDetailResponse,
  type PluginRegistryListEntry,
} from "../../../utils/pluginApi";

type ListStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; entries: PluginRegistryListEntry[] };

type DetailCache = Record<
  string,
  PluginRegistryDetailResponse | Error | "loading"
>;

function entryKey(entry: PluginRegistryListEntry): string {
  return `${entry.id}@${entry.version}`;
}

function formatPublishedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function PluginBrowserPanel() {
  const [status, setStatus] = useState<ListStatus>({ kind: "idle" });
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detailCache, setDetailCache] = useState<DetailCache>({});
  // Guard against stale state updates when the component re-fetches
  // quickly (e.g. user spams the refresh button).
  const fetchIdRef = useRef(0);

  const reload = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setStatus({ kind: "loading" });
    try {
      const entries = await listPublishedPlugins();
      if (fetchId !== fetchIdRef.current) return;
      setStatus({ kind: "ready", entries });
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredEntries = useMemo(() => {
    if (status.kind !== "ready") return [];
    const needle = filter.trim().toLowerCase();
    if (needle.length === 0) return status.entries;
    return status.entries.filter((e) => {
      const key = entryKey(e);
      if (key.toLowerCase().includes(needle)) return true;
      // Also match against cached manifest fields if we've already
      // fetched them — lets tag searches work for previously-expanded
      // plugins without a broad prefetch.
      const cached = detailCache[key];
      if (cached && cached !== "loading" && !(cached instanceof Error)) {
        const m = cached.bundle.manifest;
        if (m.name.toLowerCase().includes(needle)) return true;
        if (m.description.toLowerCase().includes(needle)) return true;
        for (const tag of m.tags) {
          if (tag.toLowerCase().includes(needle)) return true;
        }
      }
      return false;
    });
  }, [status, filter, detailCache]);

  const toggleExpanded = useCallback(
    async (entry: PluginRegistryListEntry) => {
      const key = entryKey(entry);
      const isOpen = expanded[key] === true;
      setExpanded((prev) => ({ ...prev, [key]: !isOpen }));
      if (isOpen) return;
      if (detailCache[key] !== undefined) return;
      setDetailCache((prev) => ({ ...prev, [key]: "loading" }));
      try {
        const detail = await getPublishedPlugin(entry.id, entry.version);
        setDetailCache((prev) => ({ ...prev, [key]: detail }));
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setDetailCache((prev) => ({ ...prev, [key]: e }));
      }
    },
    [expanded, detailCache],
  );

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Toolbar: search + refresh + count */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 border-b border-border-primary"
        style={{ background: "var(--bg-secondary)" }}
      >
        <div className="relative flex-1 max-w-sm">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
          />
          <input
            type="text"
            placeholder="Filter plugins…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-[11px] bg-bg-primary border border-border-primary rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={() => void reload()}
          disabled={status.kind === "loading"}
          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50 transition-colors"
          title="Reload registry"
        >
          {status.kind === "loading" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <RefreshCw size={11} />
          )}
          <span>Reload</span>
        </button>
        <span className="text-[11px] text-text-tertiary ml-auto">
          {status.kind === "ready"
            ? `${filteredEntries.length} / ${status.entries.length}`
            : null}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {status.kind === "idle" || status.kind === "loading" ? (
          <div className="flex items-center justify-center py-8 text-text-tertiary text-[11px]">
            <Loader2 size={14} className="animate-spin mr-2" />
            Loading plugin registry…
          </div>
        ) : null}

        {status.kind === "error" ? (
          <div className="flex items-start gap-2 px-3 py-3 text-[11px] text-red-400">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Failed to load registry</div>
              <div className="text-text-tertiary mt-0.5">{status.message}</div>
            </div>
          </div>
        ) : null}

        {status.kind === "ready" && status.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-text-tertiary text-[11px]">
            <Package size={24} className="mb-2 opacity-50" />
            <div>No plugins published yet.</div>
            <div className="mt-1 text-[10px]">
              Use <code>hyperforge-plugin publish</code> to add one.
            </div>
          </div>
        ) : null}

        {status.kind === "ready" && status.entries.length > 0 ? (
          filteredEntries.length === 0 ? (
            <div className="py-6 text-center text-[11px] text-text-tertiary">
              No plugins match &ldquo;{filter}&rdquo;.
            </div>
          ) : (
            <ul className="divide-y divide-border-primary">
              {filteredEntries.map((entry) => {
                const key = entryKey(entry);
                const isOpen = expanded[key] === true;
                const detail = detailCache[key];
                return (
                  <li key={entry.registryId} className="text-[11px]">
                    <button
                      onClick={() => void toggleExpanded(entry)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-tertiary transition-colors"
                    >
                      {isOpen ? (
                        <ChevronDown
                          size={11}
                          className="text-text-tertiary flex-shrink-0"
                        />
                      ) : (
                        <ChevronRight
                          size={11}
                          className="text-text-tertiary flex-shrink-0"
                        />
                      )}
                      <Package
                        size={11}
                        className="text-text-secondary flex-shrink-0"
                      />
                      <span className="text-text-primary font-medium">
                        {entry.id}
                      </span>
                      <span className="text-text-tertiary">
                        @{entry.version}
                      </span>
                      <span className="text-text-tertiary ml-auto text-[10px]">
                        {formatPublishedAt(entry.publishedAt)}
                      </span>
                    </button>
                    {isOpen ? (
                      <PluginDetailView detail={detail} entry={entry} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}

interface PluginDetailViewProps {
  detail: PluginRegistryDetailResponse | Error | "loading" | undefined;
  entry: PluginRegistryListEntry;
}

function PluginDetailView({ detail, entry }: PluginDetailViewProps) {
  if (detail === undefined || detail === "loading") {
    return (
      <div className="px-8 py-2 text-text-tertiary text-[11px] flex items-center gap-1.5">
        <Loader2 size={11} className="animate-spin" />
        Loading bundle…
      </div>
    );
  }
  if (detail instanceof Error) {
    return (
      <div className="px-8 py-2 text-red-400 text-[11px] flex items-start gap-1.5">
        <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
        <span>{detail.message}</span>
      </div>
    );
  }
  const manifest = detail.bundle.manifest;
  const contributions = manifest.contributions;
  const contribRows: Array<[string, string[]]> = [
    ["systems", [...contributions.systems]],
    ["entities", [...contributions.entities]],
    ["widgets", [...contributions.widgets]],
    ["manifestSchemas", [...contributions.manifestSchemas]],
    ["paletteCategories", [...contributions.paletteCategories]],
    ["toolbarTools", [...contributions.toolbarTools]],
    ["commands", [...contributions.commands]],
  ];

  return (
    <div className="px-8 pb-3 pt-1 space-y-2">
      {manifest.description ? (
        <div className="text-text-secondary">{manifest.description}</div>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-text-tertiary">name</dt>
        <dd className="text-text-primary">{manifest.name}</dd>

        <dt className="text-text-tertiary">author</dt>
        <dd className="text-text-primary">
          {manifest.author.name}
          {manifest.author.email ? (
            <span className="text-text-tertiary">
              {" "}
              &lt;{manifest.author.email}&gt;
            </span>
          ) : null}
        </dd>

        <dt className="text-text-tertiary">license</dt>
        <dd className="text-text-primary">{manifest.license}</dd>

        <dt className="text-text-tertiary">entry</dt>
        <dd className="text-text-primary font-mono">{manifest.entry}</dd>

        <dt className="text-text-tertiary">hyperforgeApi</dt>
        <dd className="text-text-primary font-mono">
          {manifest.hyperforgeApi}
        </dd>

        <dt className="text-text-tertiary">published</dt>
        <dd className="text-text-primary">
          {formatPublishedAt(entry.publishedAt)}
        </dd>

        {manifest.homepage ? (
          <>
            <dt className="text-text-tertiary">homepage</dt>
            <dd className="text-text-primary">
              <a
                href={manifest.homepage}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {manifest.homepage}
              </a>
            </dd>
          </>
        ) : null}

        {manifest.repository ? (
          <>
            <dt className="text-text-tertiary">repository</dt>
            <dd className="text-text-primary">
              <a
                href={manifest.repository}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {manifest.repository}
              </a>
            </dd>
          </>
        ) : null}
      </dl>

      {manifest.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {manifest.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-[1px] text-[10px] rounded bg-bg-tertiary text-text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {manifest.dependencies.length > 0 ? (
        <div>
          <div className="text-text-tertiary text-[10px] uppercase tracking-wide mb-0.5">
            dependencies
          </div>
          <ul className="space-y-0.5">
            {manifest.dependencies.map((d) => (
              <li key={d.id} className="font-mono text-text-primary">
                {d.id}{" "}
                <span className="text-text-tertiary">{d.versionRange}</span>
                {d.optional ? (
                  <span className="text-text-tertiary"> (optional)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="text-text-tertiary text-[10px] uppercase tracking-wide mb-0.5">
          contributions
        </div>
        <ul className="space-y-0.5">
          {contribRows
            .filter(([, items]) => items.length > 0)
            .map(([label, items]) => (
              <li key={label}>
                <span className="text-text-tertiary">{label}:</span>{" "}
                <span className="font-mono text-text-primary">
                  {items.join(", ")}
                </span>
              </li>
            ))}
          {contribRows.every(([, items]) => items.length === 0) ? (
            <li className="text-text-tertiary italic">none declared</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
