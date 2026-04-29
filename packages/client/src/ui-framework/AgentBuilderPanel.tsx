/**
 * `AgentBuilderPanel` — chat surface for the live game-builder agent.
 *
 * The user types a prompt; the panel POSTs to `/api/agent/design`
 * (proxied to `@hyperforge/agent-server`); when the server returns
 * a validated `UIPackManifest`, the panel calls `loadUIPackOnClient`
 * which propagates through `useActiveUIPack` so `ManifestHud`
 * re-renders with the new layout. Live-LLM-to-running-HUD in one
 * round-trip.
 *
 * Toggle visibility with `Ctrl/Cmd + Shift + B` or by mounting/
 * unmounting the component. The panel itself has no global state —
 * everything goes through the existing pack registry.
 *
 * Design:
 *   - Floating panel, top-right, draggable later (not yet)
 *   - Textarea + Submit button
 *   - "running" status while the request is in flight (typically
 *     30–60s for a real Claude tool-use loop)
 *   - Error messages surface inline; the user can retry
 *   - On success: shows the agent's final text + applied banner;
 *     the HUD has already swapped by the time the user reads this
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { loadUIPackOnClient } from "./uiPackLoader";

const DESIGN_ENDPOINT = "/api/agent/design";

interface DesignResponse {
  ok: boolean;
  pack?: unknown;
  finalText?: string;
  turns?: number;
  truncated?: boolean;
  error?: string;
  code?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; pack: unknown; finalText: string; turns: number }
  | { kind: "error"; message: string };

const PANEL_STYLE: React.CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  width: 360,
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  background: "rgba(15, 17, 25, 0.95)",
  color: "#e5e7eb",
  border: "1px solid rgba(99, 102, 241, 0.4)",
  borderRadius: 8,
  padding: 12,
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 13,
  zIndex: 9999,
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
};

const HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const TEXTAREA_STYLE: React.CSSProperties = {
  width: "100%",
  minHeight: 80,
  padding: 8,
  background: "rgba(0, 0, 0, 0.3)",
  color: "#e5e7eb",
  border: "1px solid rgba(99, 102, 241, 0.3)",
  borderRadius: 4,
  fontFamily: "inherit",
  fontSize: 13,
  resize: "vertical",
};

const BUTTON_STYLE: React.CSSProperties = {
  marginTop: 8,
  padding: "6px 12px",
  background: "#6366f1",
  color: "white",
  border: "none",
  borderRadius: 4,
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const BUTTON_DISABLED_STYLE: React.CSSProperties = {
  ...BUTTON_STYLE,
  background: "#374151",
  cursor: "not-allowed",
};

const STATUS_STYLE: React.CSSProperties = {
  marginTop: 12,
  padding: 8,
  background: "rgba(0, 0, 0, 0.3)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: 4,
  fontSize: 12,
  whiteSpace: "pre-wrap",
  overflowY: "auto",
};

export interface AgentBuilderPanelProps {
  /**
   * Override the design endpoint. Default `/api/agent/design`
   * (the Vite proxy route to `@hyperforge/agent-server`).
   */
  readonly endpoint?: string;
  /** Initial prompt text. */
  readonly initialPrompt?: string;
  /** Called after a pack is successfully applied. */
  readonly onPackApplied?: (pack: unknown) => void;
  /** Called when the panel wants to be closed (Esc key). */
  readonly onClose?: () => void;
}

export function AgentBuilderPanel({
  endpoint = DESIGN_ENDPOINT,
  initialPrompt = "",
  onPackApplied,
  onClose,
}: AgentBuilderPanelProps): React.ReactElement {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const inputId = useId();

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (status.kind === "running") return;
      if (!prompt.trim()) return;

      abortRef.current = new AbortController();
      setStatus({ kind: "running" });

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: abortRef.current.signal,
        });
        const json = (await response.json()) as DesignResponse;

        if (!response.ok || !json.ok) {
          setStatus({
            kind: "error",
            message: json.error ?? `HTTP ${response.status}`,
          });
          return;
        }

        if (!json.pack) {
          setStatus({
            kind: "error",
            message:
              "Agent finished but didn't propose a pack. Try a more specific prompt.",
          });
          return;
        }

        // Apply to the live runtime. `loadUIPackOnClient` validates
        // again (defensive — the server already validated) and
        // triggers the active-pack subscribers.
        const applied = loadUIPackOnClient(json.pack);
        if (!applied.ok) {
          setStatus({
            kind: "error",
            message: `Server returned a pack the client rejected: ${applied.error.issues.length} issue(s)`,
          });
          return;
        }

        setStatus({
          kind: "done",
          pack: json.pack,
          finalText: json.finalText ?? "",
          turns: json.turns ?? 0,
        });
        onPackApplied?.(json.pack);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setStatus({ kind: "idle" });
          return;
        }
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        abortRef.current = null;
      }
    },
    [endpoint, prompt, status.kind, onPackApplied],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Esc to close.
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div style={PANEL_STYLE} role="dialog" aria-label="Agent builder">
      <div style={HEADER_STYLE}>
        <strong>HyperForge agent builder</strong>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: "#9ca3af",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>
      <form onSubmit={submit}>
        <label
          htmlFor={inputId}
          style={{ display: "block", marginBottom: 4, color: "#9ca3af" }}
        >
          Describe the UI you want:
        </label>
        <textarea
          id={inputId}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Build me a minimal HUD with HP and chat in the bottom-left."
          style={TEXTAREA_STYLE}
          disabled={status.kind === "running"}
        />
        {status.kind === "running" ? (
          <button type="button" onClick={cancel} style={BUTTON_STYLE}>
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!prompt.trim()}
            style={prompt.trim() ? BUTTON_STYLE : BUTTON_DISABLED_STYLE}
          >
            Design HUD
          </button>
        )}
      </form>

      {status.kind === "running" && (
        <div style={STATUS_STYLE}>
          Asking Claude to design your HUD… (typically 30–60 seconds)
        </div>
      )}

      {status.kind === "done" && (
        <div style={STATUS_STYLE}>
          <strong style={{ color: "#22c55e" }}>
            ✓ HUD applied ({status.turns} turn{status.turns === 1 ? "" : "s"})
          </strong>
          {"\n\n"}
          {status.finalText}
        </div>
      )}

      {status.kind === "error" && (
        <div style={{ ...STATUS_STYLE, color: "#f87171" }}>
          <strong>Error</strong>
          {"\n"}
          {status.message}
        </div>
      )}
    </div>
  );
}

/**
 * `AgentBuilderPanelToggle` — hotkey-driven wrapper over
 * `AgentBuilderPanel`. Mount this once in the InterfaceManager;
 * `Ctrl/Cmd + Shift + B` toggles the panel's visibility. The
 * panel itself is unmounted while hidden so there's zero cost
 * when not in use.
 */
export function AgentBuilderPanelToggle(): React.ReactElement | null {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const isToggle =
        (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "b";
      if (isToggle) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <AgentBuilderPanel onClose={() => setOpen(false)} />,
    document.body,
  );
}
