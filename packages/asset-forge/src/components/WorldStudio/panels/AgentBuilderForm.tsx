/**
 * AgentBuilderForm — host-agnostic chat-with-the-agent form.
 *
 * Embedded in `AutomationPanel` (the World Studio "AI" tab). The
 * form posts to `@hyperforge/agent-server`, receives a validated
 * `UIPackManifest`, and surfaces it back to the host via
 * `onPackReceived`. The host decides what to do with it — preview
 * in PIE, save into the game data file, copy to clipboard, etc.
 *
 * Why host-agnostic: World Studio is the IDE that authors the game
 * data file. The agent's pack JSON is one fragment of that data
 * file. Persistence + preview + integration with PIE all happen on
 * the WS side; this form's only job is to drive the agent loop.
 *
 * Default endpoint: http://localhost:5180/design (the agent-server's
 * default port; CORS is permissive on the server). Override with
 * the `endpoint` prop or by setting AGENT_SERVER_URL on the
 * dev-server config.
 */

import { useCallback, useId, useRef, useState, type FormEvent } from "react";

const DEFAULT_ENDPOINT = "http://localhost:5180/design";

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

export interface AgentBuilderFormProps {
  /** Override the design endpoint. */
  readonly endpoint?: string;
  /** Initial prompt text. */
  readonly initialPrompt?: string;
  /**
   * Called whenever a valid pack comes back from the server. The
   * host (AutomationPanel here) decides what to do — preview, save
   * to the game data file, copy, etc.
   */
  readonly onPackReceived?: (pack: unknown, finalText: string) => void;
}

export function AgentBuilderForm({
  endpoint = DEFAULT_ENDPOINT,
  initialPrompt = "",
  onPackReceived,
}: AgentBuilderFormProps): React.ReactElement {
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

        const finalText = json.finalText ?? "";
        setStatus({
          kind: "done",
          pack: json.pack,
          finalText,
          turns: json.turns ?? 0,
        });
        onPackReceived?.(json.pack, finalText);
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
    [endpoint, prompt, status.kind, onPackReceived],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="flex flex-col gap-2 p-3 border border-bg-tertiary rounded bg-bg-secondary">
      <div className="text-sm font-semibold text-text-primary">
        Agent builder
      </div>
      <div className="text-xs text-text-tertiary">
        Describe what you want; the agent composes a UI pack from the catalog.
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          Prompt
        </label>
        <textarea
          id={inputId}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Build me a minimal HUD with HP and chat in the bottom-left."
          className="w-full min-h-20 p-2 bg-bg-primary border border-bg-tertiary rounded text-sm text-text-primary"
          disabled={status.kind === "running"}
        />
        {status.kind === "running" ? (
          <button
            type="button"
            onClick={cancel}
            className="px-3 py-1 bg-accent-primary text-white rounded text-sm font-semibold"
          >
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!prompt.trim()}
            className={
              prompt.trim()
                ? "px-3 py-1 bg-accent-primary text-white rounded text-sm font-semibold cursor-pointer"
                : "px-3 py-1 bg-bg-tertiary text-text-tertiary rounded text-sm font-semibold cursor-not-allowed"
            }
          >
            Design HUD
          </button>
        )}
      </form>

      {status.kind === "running" && (
        <div className="text-xs text-text-secondary p-2 bg-bg-primary rounded">
          Asking Claude to design your HUD… (typically 30–60 seconds)
        </div>
      )}

      {status.kind === "done" && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-success p-2 bg-bg-primary rounded">
            ✓ Pack composed ({status.turns} turn{status.turns === 1 ? "" : "s"})
          </div>
          <div className="text-xs text-text-secondary p-2 bg-bg-primary rounded">
            Press <strong>Play</strong> in the toolbar to see this HUD render
            over your world.
          </div>
          {status.finalText && (
            <div className="text-xs text-text-secondary p-2 bg-bg-primary rounded whitespace-pre-wrap max-h-32 overflow-y-auto">
              {status.finalText}
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
              View pack JSON
            </summary>
            <pre className="text-xs mt-1 p-2 bg-bg-primary rounded text-text-primary overflow-x-auto max-h-64">
              {JSON.stringify(status.pack, null, 2)}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText(
                  JSON.stringify(status.pack, null, 2),
                );
              }
            }}
            className="px-3 py-1 text-xs bg-bg-tertiary text-text-primary rounded cursor-pointer"
          >
            Copy pack JSON
          </button>
        </div>
      )}

      {status.kind === "error" && (
        <div className="text-xs text-error p-2 bg-bg-primary rounded whitespace-pre-wrap">
          <div className="font-semibold">Error</div>
          {status.message}
        </div>
      )}
    </div>
  );
}
