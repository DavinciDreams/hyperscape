import React, { useMemo, useState } from "react";
import { BookOpen, Bot, Loader2, ScrollText, Send } from "lucide-react";
import { GAME_API_URL } from "@/lib/api-config";

type ContentMode = "npc" | "quest" | "lore";
type Quality = "balanced" | "quality" | "speed";

type GeneratedPayload = Record<string, unknown>;

const MODES: Array<{
  id: ContentMode;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: "npc", label: "NPC", icon: Bot },
  { id: "quest", label: "Quest", icon: ScrollText },
  { id: "lore", label: "Lore", icon: BookOpen },
];

function getEndpoint(mode: ContentMode): string {
  if (mode === "npc") {
    return "/api/asset-forge/api/content/generate-npc";
  }
  if (mode === "quest") {
    return "/api/asset-forge/api/content/generate-quest";
  }
  return "/api/asset-forge/api/content/generate-lore";
}

export function ContentHubPanel(): React.ReactElement {
  const [mode, setMode] = useState<ContentMode>("npc");
  const [quality, setQuality] = useState<Quality>("balanced");
  const [primary, setPrimary] = useState("merchant");
  const [prompt, setPrompt] = useState(
    "A practical town character with a strong reason to interact with players.",
  );
  const [context, setContext] = useState("");
  const [result, setResult] = useState<GeneratedPayload | null>(null);
  const [rawResponse, setRawResponse] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const fieldLabels = useMemo(() => {
    if (mode === "quest") {
      return {
        primary: "Quest Type",
        prompt: "Theme",
        placeholder: "A compact starter quest with a local mystery.",
      };
    }
    if (mode === "lore") {
      return {
        primary: "Category",
        prompt: "Topic",
        placeholder: "The origin of a trade road near the starter town.",
      };
    }
    return {
      primary: "Archetype",
      prompt: "Prompt",
      placeholder:
        "A practical town character with a strong reason to interact with players.",
    };
  }, [mode]);

  async function handleGenerate(): Promise<void> {
    setIsGenerating(true);
    setError("");
    setResult(null);
    setRawResponse("");

    const body =
      mode === "npc"
        ? { archetype: primary, prompt, context, quality }
        : mode === "quest"
          ? {
              questType: primary,
              difficulty: "medium",
              theme: prompt,
              context,
              quality,
            }
          : { category: primary, topic: prompt, context, quality };

    try {
      const response = await fetch(`${GAME_API_URL}${getEndpoint(mode)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(
          payload?.message ||
            payload?.error ||
            `Asset Forge generation failed (${response.status})`,
        );
      }

      const data = (await response.json()) as Record<string, unknown>;
      const content = data.npc ?? data.quest ?? data.lore;
      setResult(
        content && typeof content === "object"
          ? (content as GeneratedPayload)
          : data,
      );
      setRawResponse(
        typeof data.rawResponse === "string" ? data.rawResponse : "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  const activeMode = MODES.find((item) => item.id === mode) ?? MODES[0];
  const ActiveIcon = activeMode.icon;

  return (
    <div className="content-hub-panel">
      <div className="content-hub-panel__header">
        <Bot size={18} />
        <div>
          <h2>Content Hub</h2>
          <p>Generate NPCs, quests, and lore through Asset Forge.</p>
        </div>
      </div>

      <div className="content-hub-panel__body">
        <section className="content-hub-panel__controls">
          <div className="content-hub-panel__tabs">
            {MODES.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === mode ? "is-active" : ""}
                  onClick={() => setMode(item.id)}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <label>
            <span>{fieldLabels.primary}</span>
            <input
              value={primary}
              onChange={(event) => setPrimary(event.target.value)}
            />
          </label>

          <label>
            <span>{fieldLabels.prompt}</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={fieldLabels.placeholder}
              rows={4}
            />
          </label>

          <label>
            <span>World Context</span>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Optional: town, biome, faction, nearby NPCs, current event, or desired gameplay purpose."
              rows={4}
            />
          </label>

          <label>
            <span>Provider Mode</span>
            <select
              value={quality}
              onChange={(event) => setQuality(event.target.value as Quality)}
            >
              <option value="balanced">Balanced</option>
              <option value="quality">Quality</option>
              <option value="speed">Speed</option>
            </select>
          </label>

          <button
            type="button"
            className="content-hub-panel__generate"
            disabled={isGenerating || !primary.trim() || !prompt.trim()}
            onClick={() => {
              void handleGenerate();
            }}
          >
            {isGenerating ? (
              <Loader2 size={16} className="content-hub-panel__spin" />
            ) : (
              <ActiveIcon size={16} />
            )}
            <span>Generate {activeMode.label}</span>
            {!isGenerating && <Send size={14} />}
          </button>
        </section>

        <section className="content-hub-panel__result">
          {error && <div className="content-hub-panel__error">{error}</div>}
          {!error && !result && (
            <div className="content-hub-panel__empty">
              Generated content will appear here.
            </div>
          )}
          {result && (
            <>
              <pre>{JSON.stringify(result, null, 2)}</pre>
              {rawResponse && (
                <details>
                  <summary>Raw response</summary>
                  <pre>{rawResponse}</pre>
                </details>
              )}
            </>
          )}
        </section>
      </div>

      <style>{`
        .content-hub-panel {
          display: flex;
          flex-direction: column;
          min-height: 100%;
          color: #e8dcc8;
          background: #120d16;
        }
        .content-hub-panel__header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(242, 208, 138, 0.16);
          color: #f2d08a;
        }
        .content-hub-panel__header h2 {
          margin: 0;
          font-size: 15px;
          line-height: 1.2;
        }
        .content-hub-panel__header p {
          margin: 2px 0 0;
          color: rgba(232, 220, 200, 0.66);
          font-size: 11px;
        }
        .content-hub-panel__body {
          display: grid;
          grid-template-columns: minmax(210px, 280px) minmax(260px, 1fr);
          gap: 12px;
          min-height: 0;
          padding: 12px;
        }
        .content-hub-panel__controls,
        .content-hub-panel__result {
          min-height: 0;
        }
        .content-hub-panel__controls {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .content-hub-panel__tabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
        }
        .content-hub-panel button,
        .content-hub-panel input,
        .content-hub-panel textarea,
        .content-hub-panel select {
          font: inherit;
        }
        .content-hub-panel__tabs button,
        .content-hub-panel__generate {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 34px;
          border: 1px solid rgba(242, 208, 138, 0.22);
          color: rgba(232, 220, 200, 0.78);
          background: rgba(255, 255, 255, 0.04);
          border-radius: 6px;
          cursor: pointer;
        }
        .content-hub-panel__tabs button.is-active,
        .content-hub-panel__tabs button:hover {
          color: #f2d08a;
          border-color: rgba(242, 208, 138, 0.55);
          background: rgba(242, 208, 138, 0.1);
        }
        .content-hub-panel label {
          display: flex;
          flex-direction: column;
          gap: 5px;
          color: rgba(232, 220, 200, 0.7);
          font-size: 11px;
          font-weight: 600;
        }
        .content-hub-panel input,
        .content-hub-panel textarea,
        .content-hub-panel select {
          width: 100%;
          border: 1px solid rgba(242, 208, 138, 0.18);
          color: #f4ead7;
          background: rgba(0, 0, 0, 0.28);
          border-radius: 6px;
          padding: 8px;
          outline: none;
          resize: vertical;
        }
        .content-hub-panel input:focus,
        .content-hub-panel textarea:focus,
        .content-hub-panel select:focus {
          border-color: rgba(242, 208, 138, 0.58);
        }
        .content-hub-panel__generate {
          color: #130f14;
          background: #f2d08a;
          border-color: #f2d08a;
          font-weight: 700;
        }
        .content-hub-panel__generate:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .content-hub-panel__result {
          overflow: auto;
          border: 1px solid rgba(242, 208, 138, 0.14);
          background: rgba(0, 0, 0, 0.2);
          border-radius: 6px;
          padding: 10px;
        }
        .content-hub-panel__result pre {
          margin: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          color: rgba(244, 234, 215, 0.88);
          font-size: 11px;
          line-height: 1.45;
        }
        .content-hub-panel__empty,
        .content-hub-panel__error {
          padding: 12px;
          font-size: 12px;
          color: rgba(232, 220, 200, 0.58);
        }
        .content-hub-panel__error {
          color: #ffb4a8;
          border: 1px solid rgba(255, 120, 100, 0.35);
          border-radius: 6px;
          background: rgba(150, 30, 30, 0.12);
        }
        .content-hub-panel details {
          margin-top: 12px;
          border-top: 1px solid rgba(242, 208, 138, 0.12);
          padding-top: 10px;
        }
        .content-hub-panel summary {
          cursor: pointer;
          color: #f2d08a;
          font-size: 12px;
        }
        .content-hub-panel__spin {
          animation: content-hub-spin 0.8s linear infinite;
        }
        @keyframes content-hub-spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 700px) {
          .content-hub-panel__body {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default ContentHubPanel;
