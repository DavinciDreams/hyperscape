/**
 * Pure staging ledger for plugin files that the user has
 * dropped onto the Plugin Browser (e.g. local `.zip`
 * archives for side-loading). The substrate deliberately
 * stores *pure descriptors* — `{filename, sizeBytes,
 * mimeType, contentHash, stagedAtMs, status}` — not the
 * File/Blob handles themselves. The caller owns the bytes.
 *
 * Lifecycle per entry:
 *   staged → queued → processing → installed | rejected
 *
 * Terminal states (`installed`, `rejected`) persist until
 * `remove()` or `clear()` so the UI can render a trailing
 * "last drop" toast.
 *
 * Distinct from:
 *   - `PluginBrowserInstallQueue` — single active op per
 *     plugin-id, not per file.
 *   - `PluginBrowserDownloadProgress` — byte-level
 *     network progress for a *remote* source.
 *
 * Pure state, caller-owned, never throws. Invalid input
 * silently no-op'd.
 */

export type PluginBrowserStagedStatus =
  | "staged"
  | "queued"
  | "processing"
  | "installed"
  | "rejected";

export interface PluginBrowserStagedFile {
  readonly id: number;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly contentHash: string;
  readonly stagedAtMs: number;
  readonly status: PluginBrowserStagedStatus;
  readonly reason?: string;
}

export interface PluginBrowserDragDropStaging {
  /**
   * Stage a new descriptor. Rejects empty filename,
   * non-finite/negative sizeBytes, empty mimeType, empty
   * contentHash, or non-finite stagedAtMs. Duplicate
   * contentHashes are NOT auto-deduped — the caller can
   * see repeats via `findByHash()`.
   */
  stage(
    filename: string,
    sizeBytes: number,
    mimeType: string,
    contentHash: string,
    stagedAtMs: number,
  ): PluginBrowserStagedFile | undefined;
  /**
   * Advance an entry to a new status. Enforces the forward
   * lifecycle:
   *   staged → queued → processing → installed | rejected
   * Returns false on illegal transition, unknown id, or
   * when already terminal. `reason` is only kept for
   * `rejected` (normalized away otherwise). Idempotent on
   * unchanged status (returns false).
   */
  setStatus(
    entryId: number,
    status: PluginBrowserStagedStatus,
    reason?: string,
  ): boolean;
  /** Lookup by id. */
  get(entryId: number): PluginBrowserStagedFile | undefined;
  /** All entries matching a contentHash, insertion order. */
  findByHash(contentHash: string): readonly PluginBrowserStagedFile[];
  /** Remove one entry. */
  remove(entryId: number): boolean;
  /** All entries in insertion order. */
  all(): readonly PluginBrowserStagedFile[];
  /** Entries filtered by status, insertion order. */
  byStatus(
    status: PluginBrowserStagedStatus,
  ): readonly PluginBrowserStagedFile[];
  /** Active (non-terminal) entries: staged | queued | processing. */
  active(): readonly PluginBrowserStagedFile[];
  /** Total entry count. */
  count(): number;
  /** Count of entries currently in `status`. */
  countByStatus(status: PluginBrowserStagedStatus): number;
  /** Wipe every entry including active ones. */
  clear(): void;
}

const VALID_STATUS: readonly PluginBrowserStagedStatus[] = [
  "staged",
  "queued",
  "processing",
  "installed",
  "rejected",
];

const TERMINAL: readonly PluginBrowserStagedStatus[] = [
  "installed",
  "rejected",
];

function isValidStatus(s: unknown): s is PluginBrowserStagedStatus {
  return (
    typeof s === "string" && (VALID_STATUS as readonly string[]).includes(s)
  );
}

function isTerminal(s: PluginBrowserStagedStatus): boolean {
  return (TERMINAL as readonly string[]).includes(s);
}

function isLegalTransition(
  from: PluginBrowserStagedStatus,
  to: PluginBrowserStagedStatus,
): boolean {
  if (from === "staged") return to === "queued" || to === "rejected";
  if (from === "queued") return to === "processing" || to === "rejected";
  if (from === "processing") return to === "installed" || to === "rejected";
  return false;
}

/**
 * Create a caller-owned drag-drop staging ledger.
 */
export function createPluginBrowserDragDropStaging(): PluginBrowserDragDropStaging {
  const entries: PluginBrowserStagedFile[] = [];
  let nextId = 1;

  function isValidText(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function isValidSize(n: number): boolean {
    return typeof n === "number" && Number.isFinite(n) && n >= 0;
  }

  function isValidTime(n: number): boolean {
    return typeof n === "number" && Number.isFinite(n);
  }

  function findIndex(id: number): number {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].id === id) return i;
    }
    return -1;
  }

  return {
    stage(
      filename: string,
      sizeBytes: number,
      mimeType: string,
      contentHash: string,
      stagedAtMs: number,
    ): PluginBrowserStagedFile | undefined {
      if (!isValidText(filename)) return undefined;
      if (!isValidSize(sizeBytes)) return undefined;
      if (!isValidText(mimeType)) return undefined;
      if (!isValidText(contentHash)) return undefined;
      if (!isValidTime(stagedAtMs)) return undefined;
      const entry: PluginBrowserStagedFile = {
        id: nextId++,
        filename,
        sizeBytes,
        mimeType,
        contentHash,
        stagedAtMs,
        status: "staged",
      };
      entries.push(entry);
      return entry;
    },
    setStatus(
      entryId: number,
      status: PluginBrowserStagedStatus,
      reason?: string,
    ): boolean {
      if (typeof entryId !== "number" || !Number.isFinite(entryId)) {
        return false;
      }
      if (!isValidStatus(status)) return false;
      const idx = findIndex(entryId);
      if (idx < 0) return false;
      const prev = entries[idx];
      if (prev.status === status) return false;
      if (isTerminal(prev.status)) return false;
      if (!isLegalTransition(prev.status, status)) return false;
      const normalizedReason =
        status === "rejected" && typeof reason === "string" && reason.length > 0
          ? reason
          : undefined;
      const next: PluginBrowserStagedFile = normalizedReason
        ? { ...prev, status, reason: normalizedReason }
        : { ...prev, status };
      entries[idx] = next;
      return true;
    },
    get(entryId: number): PluginBrowserStagedFile | undefined {
      if (typeof entryId !== "number" || !Number.isFinite(entryId)) {
        return undefined;
      }
      const idx = findIndex(entryId);
      if (idx < 0) return undefined;
      return entries[idx];
    },
    findByHash(contentHash: string): readonly PluginBrowserStagedFile[] {
      if (!isValidText(contentHash)) return [];
      return entries.filter((e) => e.contentHash === contentHash);
    },
    remove(entryId: number): boolean {
      if (typeof entryId !== "number" || !Number.isFinite(entryId)) {
        return false;
      }
      const idx = findIndex(entryId);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      return true;
    },
    all(): readonly PluginBrowserStagedFile[] {
      return entries.slice();
    },
    byStatus(
      status: PluginBrowserStagedStatus,
    ): readonly PluginBrowserStagedFile[] {
      if (!isValidStatus(status)) return [];
      return entries.filter((e) => e.status === status);
    },
    active(): readonly PluginBrowserStagedFile[] {
      return entries.filter((e) => !isTerminal(e.status));
    },
    count(): number {
      return entries.length;
    },
    countByStatus(status: PluginBrowserStagedStatus): number {
      if (!isValidStatus(status)) return 0;
      let n = 0;
      for (const e of entries) if (e.status === status) n++;
      return n;
    },
    clear(): void {
      entries.length = 0;
    },
  };
}
