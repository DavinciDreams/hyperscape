import React from "react";
import { Terminal, Download, Pause, Play, Trash2 } from "lucide-react";
import type { Agent } from "./types";
import { ELIZAOS_API } from "@/lib/api-config";

interface LogEntry {
  id: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug" | "success" | "warning";
  message: string;
  source: string;
}

interface ElizaOSLog {
  id: string;
  type?: string;
  body?: {
    modelType?: string;
    executionTime?: number;
    [key: string]: unknown;
  };
  createdAt: string;
  [key: string]: unknown;
}

interface AgentLogsProps {
  agent: Agent;
}

export const AgentLogs: React.FC<AgentLogsProps> = ({ agent }) => {
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [filter, setFilter] = React.useState<string>("all");
  const [isPaused, setIsPaused] = React.useState(false);
  const [deletingLogId, setDeletingLogId] = React.useState<string | null>(null);
  const logsEndRef = React.useRef<HTMLDivElement>(null);
  const retryTimeoutRef = React.useRef<number | null>(null);
  const inFlightRef = React.useRef(false);
  const filteredLogs = React.useMemo(
    () => logs.filter((log) => filter === "all" || log.level === filter),
    [filter, logs],
  );

  // Delete individual log entry
  const deleteLog = async (logId: string) => {
    setDeletingLogId(logId);
    try {
      const response = await fetch(
        `${ELIZAOS_API}/agents/${agent.id}/logs/${logId}`,
        { method: "DELETE" },
      );

      if (response.ok) {
        // Remove log from local state immediately
        setLogs((prev) => prev.filter((log) => log.id !== logId));
      } else {
        console.error(
          `[AgentLogs] Failed to delete log: HTTP ${response.status}`,
        );
      }
    } catch (error) {
      console.error("[AgentLogs] Error deleting log:", error);
    } finally {
      setDeletingLogId(null);
    }
  };

  // Fetch logs from API
  React.useEffect(() => {
    const clearRetryTimeout = () => {
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };

    const fetchLogs = async () => {
      if (isPaused || inFlightRef.current) return;
      inFlightRef.current = true;

      // Only fetch logs for active agents
      if (agent.status !== "active") {
        setLogs((prev) => (prev.length > 0 ? [] : prev));
        inFlightRef.current = false;
        return;
      }

      try {
        // Use ElizaOS REST API to fetch agent logs
        // Use 'limit' parameter (not 'count') and 'level' filter
        const response = await fetch(
          `${ELIZAOS_API}/agents/${agent.id}/logs?limit=200&level=info`,
        );
        if (response.ok) {
          const result = await response.json();

          // ElizaOS returns { success, data: [...] } where data is the logs array
          if (!result.success || !result.data || !Array.isArray(result.data)) {
            console.warn("[AgentLogs] Unexpected response format");
            return;
          }

          const logs = result.data;

          // Extract log level from type (e.g., "useModel:TEXT_EMBEDDING" -> "info")
          const extractLevel = (log: ElizaOSLog): string => {
            const type = log.type || "";
            if (type.includes("error") || type.includes("Error"))
              return "error";
            if (type.includes("warn") || type.includes("Warning"))
              return "warn";
            if (type.includes("debug")) return "debug";
            return "info"; // Default to info
          };

          // Extract message from log body and type
          const extractMessage = (log: ElizaOSLog): string => {
            const type = log.type || "unknown";
            const body = log.body || {};

            // Format based on type
            if (type.startsWith("useModel:")) {
              const modelType =
                body.modelType || type.split(":")[1] || "unknown";
              const executionTime = body.executionTime
                ? `${body.executionTime.toFixed(2)}ms`
                : "";
              return `Used ${modelType} model${executionTime ? ` (${executionTime})` : ""}`;
            }

            // Generic fallback
            return type;
          };

          const formattedLogs = logs.map((log: ElizaOSLog) => ({
            id: log.id,
            timestamp: new Date(log.createdAt),
            level: extractLevel(log),
            message: extractMessage(log),
            source: agent.name,
          }));

          setLogs(formattedLogs);
        } else {
          console.error(`[AgentLogs] Failed to fetch logs: ${response.status}`);
        }
      } catch (error) {
        console.error("[AgentLogs] Failed to fetch logs:", error);
      } finally {
        inFlightRef.current = false;
      }
    };

    const scheduleNextFetch = () => {
      clearRetryTimeout();
      const delay =
        document.visibilityState === "visible" && !isPaused ? 5000 : 20000;
      retryTimeoutRef.current = window.setTimeout(() => {
        retryTimeoutRef.current = null;
        void fetchLogs().finally(scheduleNextFetch);
      }, delay);
    };

    void fetchLogs().finally(scheduleNextFetch);
    const onVisibilityChange = () => {
      clearRetryTimeout();
      scheduleNextFetch();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearRetryTimeout();
    };
  }, [agent.id, agent.status, isPaused]);

  // Auto-scroll to bottom
  React.useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-400";
      case "warn":
      case "warning":
        return "text-yellow-400";
      case "debug":
        return "text-blue-400";
      case "success":
        return "text-green-500"; // Added success color
      default:
        return "text-green-400"; // Default for info
    }
  };

  const downloadLogs = React.useCallback(() => {
    if (filteredLogs.length === 0) return;

    const payload = filteredLogs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      level: log.level,
      source: log.source,
      message: log.message,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${agent.name || agent.id}-logs.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [agent.id, agent.name, filteredLogs]);

  return (
    <div className="flex flex-col h-full bg-[#0b0a15]/50 backdrop-blur-sm">
      {/* Header */}
      <div className="p-4 border-b border-[#8b4513]/30 bg-[#0b0a15]/80 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Terminal className="text-[#f2d08a]" size={20} />
          <h2 className="font-bold text-[#f2d08a]">Live Logs</h2>
          <span className="px-2 py-0.5 rounded text-[10px] bg-[#f2d08a]/10 text-[#f2d08a] border border-[#f2d08a]/20">
            {logs.length} Events
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#1a1005] border border-[#8b4513]/30 rounded-lg p-1">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 text-xs rounded ${filter === "all" ? "bg-[#f2d08a]/20 text-[#f2d08a]" : "text-[#f2d08a]/40 hover:text-[#f2d08a]"}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("error")}
              className={`px-3 py-1 text-xs rounded ${filter === "error" ? "bg-red-500/20 text-red-400" : "text-[#f2d08a]/40 hover:text-red-400"}`}
            >
              Errors
            </button>
          </div>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-2 hover:bg-[#f2d08a]/10 rounded-lg text-[#f2d08a]/60 hover:text-[#f2d08a] transition-colors"
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
          </button>

          <button
            className="p-2 hover:bg-[#f2d08a]/10 rounded-lg text-[#f2d08a]/60 hover:text-[#f2d08a] transition-colors disabled:opacity-40"
            onClick={downloadLogs}
            disabled={filteredLogs.length === 0}
            title="Download logs"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Logs Viewer */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-[#050408]">
        <div className="space-y-1">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="flex gap-3 hover:bg-[#f2d08a]/5 p-1 rounded transition-colors group"
            >
              <span className="text-[#f2d08a]/30 w-20 flex-shrink-0 text-xs pt-0.5">
                {log.timestamp.toLocaleTimeString([], {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>

              <span
                className={`w-16 flex-shrink-0 text-xs font-bold pt-0.5 uppercase ${getLevelColor(log.level)}`}
              >
                {log.level}
              </span>

              <span className="text-[#f2d08a]/60 w-32 flex-shrink-0 text-xs pt-0.5 truncate">
                [{log.source}]
              </span>

              <span className="text-[#e8ebf4]/80 flex-1 break-all">
                {log.message}
              </span>

              <button
                onClick={() => deleteLog(log.id)}
                disabled={deletingLogId === log.id}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/10 rounded text-red-400/60 hover:text-red-400 disabled:opacity-50"
                title="Delete log"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="text-center py-20 text-[#f2d08a]/40">
              {agent.status !== "active" ? (
                <>
                  <div className="text-lg font-bold text-[#f2d08a]/60 mb-2">
                    Agent is {agent.status}
                  </div>
                  <div className="text-sm">Start the agent to see logs</div>
                </>
              ) : (
                <>
                  <div className="text-lg font-bold text-[#f2d08a]/60 mb-2">
                    No logs yet
                  </div>
                  <div className="text-sm">Waiting for agent activity...</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
