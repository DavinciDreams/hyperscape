import React, { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import type { Agent } from "./types";
import { ChevronDown, ChevronUp, ScrollText } from "lucide-react";

const QUEST_POLL_INTERVAL_MS = 15000;

interface QuestInfo {
  id: string;
  name: string;
  status: string;
  difficulty: string;
  questPoints: number;
  startNpc: string;
  stageType?: string;
  stageTarget?: string;
  stageCount?: number;
  stageProgress?: Record<string, number>;
}

interface AgentQuestPanelProps {
  agent: Agent;
  isViewportActive: boolean;
}

/** Status → color mapping: red=not_started, yellow=in_progress, green=completed */
function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "#4ade80"; // green
    case "in_progress":
    case "ready_to_complete":
      return "#facc15"; // yellow
    case "not_started":
    default:
      return "#f87171"; // red
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In Progress";
    case "ready_to_complete":
      return "Ready to Turn In";
    case "not_started":
      return "Not Started";
    default:
      return status;
  }
}

function getStageProgress(quest: QuestInfo): string | null {
  if (!quest.stageProgress || !quest.stageType) return null;

  const entries = Object.entries(quest.stageProgress);
  if (entries.length === 0) return null;

  const [key, value] = entries[0];
  const count = quest.stageCount || 0;

  if (quest.stageType === "kill" || quest.stageType === "gather") {
    return `${value}/${count} ${quest.stageTarget || key}`;
  }

  return `${key}: ${value}${count ? `/${count}` : ""}`;
}

export const AgentQuestPanel: React.FC<AgentQuestPanelProps> = ({ agent }) => {
  const [quests, setQuests] = useState<QuestInfo[]>([]);
  const [questPoints, setQuestPoints] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (agent.status !== "active") {
      setQuests([]);
      return;
    }

    fetchQuests();
    const interval = setInterval(fetchQuests, QUEST_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [agent.id, agent.status]);

  const fetchQuests = async () => {
    try {
      const result = await apiClient.get<{
        quests?: QuestInfo[];
        questPoints?: number;
      }>(`/api/agents/${agent.id}/quests`);

      if (!result.ok) {
        if (result.status === 503) {
          setError("Service not ready");
          return;
        }
        throw new Error(`Failed: ${result.error || result.status}`);
      }

      setQuests(result.data?.quests || []);
      setQuestPoints(result.data?.questPoints || 0);
      setError(null);
    } catch (err) {
      console.error("[AgentQuestPanel] Error fetching quests:", err);
    }
  };

  if (agent.status !== "active") {
    return null;
  }

  // Sort: in_progress/ready first, then not_started, then completed
  const sortOrder: Record<string, number> = {
    ready_to_complete: 0,
    in_progress: 1,
    not_started: 2,
    completed: 3,
  };

  const sorted = [...quests].sort(
    (a, b) => (sortOrder[a.status] ?? 2) - (sortOrder[b.status] ?? 2),
  );

  const completedCount = quests.filter((q) => q.status === "completed").length;
  const activeCount = quests.filter(
    (q) => q.status === "in_progress" || q.status === "ready_to_complete",
  ).length;

  return (
    <div className="border-t border-[#8b4513]/30 bg-[#0b0a15]/80">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2 hover:bg-[#f2d08a]/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ScrollText size={14} className="text-[#f2d08a]/60" />
          <span className="text-xs font-bold text-[#f2d08a]/80 uppercase tracking-wider">
            Quests
          </span>
          {quests.length > 0 && (
            <span className="text-[10px] text-[#f2d08a]/50">
              {completedCount}/{quests.length}
              {activeCount > 0 && ` (${activeCount} active)`}
            </span>
          )}
          {questPoints > 0 && (
            <span className="text-[10px] text-yellow-400/60">
              {questPoints} QP
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp size={14} className="text-[#f2d08a]/40" />
        ) : (
          <ChevronDown size={14} className="text-[#f2d08a]/40" />
        )}
      </button>

      {/* Quest List */}
      {expanded && (
        <div className="px-2 pb-2">
          {error ? (
            <div className="text-center py-2 text-[10px] text-red-400/70">
              {error}
            </div>
          ) : quests.length === 0 ? (
            <div className="text-center py-3 text-[10px] text-[#f2d08a]/50">
              No quests available
            </div>
          ) : (
            <div className="space-y-1">
              {sorted.map((quest) => {
                const color = getStatusColor(quest.status);
                const progress = getStageProgress(quest);

                return (
                  <div
                    key={quest.id}
                    className="flex items-center gap-2 p-1.5 rounded bg-black/30 border border-[#8b4513]/15"
                  >
                    {/* Status dot */}
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                      title={getStatusLabel(quest.status)}
                    />

                    {/* Quest info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-medium truncate"
                          style={{ color }}
                        >
                          {quest.name}
                        </span>
                        {quest.status === "ready_to_complete" && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-300 flex-shrink-0">
                            TURN IN
                          </span>
                        )}
                      </div>
                      {progress && (
                        <div className="text-[9px] text-[#e8ebf4]/50 mt-0.5">
                          {progress}
                        </div>
                      )}
                    </div>

                    {/* Difficulty */}
                    <span className="text-[8px] text-[#f2d08a]/30 flex-shrink-0 uppercase">
                      {quest.difficulty}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
