import React, { useState, useEffect } from "react";
import {
  Activity,
  Swords,
  Skull,
  TrendingUp,
  Coins,
  Pickaxe,
  RefreshCw,
} from "lucide-react";
import type { Agent } from "./types";
import { ELIZAOS_API } from "@/lib/api-config";

interface RecentAction {
  type: string;
  description: string;
  xpGained?: number;
  timestamp: number;
}

interface SessionStats {
  kills: number;
  deaths: number;
  totalXpGained: number;
  goldEarned: number;
  resourcesGathered: Record<string, number>;
}

interface AgentRunsProps {
  agent: Agent;
}

export const AgentRuns: React.FC<AgentRunsProps> = ({ agent }) => {
  const [actions, setActions] = useState<RecentAction[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 10000);
    return () => clearInterval(interval);
  }, [agent.id]);

  const fetchActivity = async () => {
    try {
      const response = await fetch(
        `${ELIZAOS_API}/agents/${agent.id}/activity`,
      );

      if (!response.ok) {
        setActions([]);
        setError("Activity unavailable right now");
        return;
      }

      const data = await response.json();

      if (!data.success) {
        setActions([]);
        setError(data.message || "Activity unavailable");
        return;
      }

      setActions(data.recentActions || []);
      setStats(data.sessionStats || null);
      setError(null);
    } catch {
      setActions([]);
      setError("Activity unavailable right now");
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("kill") || t.includes("combat") || t.includes("attack"))
      return <Swords size={14} className="text-red-400" />;
    if (t.includes("death") || t.includes("died"))
      return <Skull size={14} className="text-gray-400" />;
    if (t.includes("xp") || t.includes("level"))
      return <TrendingUp size={14} className="text-green-400" />;
    if (
      t.includes("gold") ||
      t.includes("coin") ||
      t.includes("buy") ||
      t.includes("sell")
    )
      return <Coins size={14} className="text-yellow-400" />;
    if (
      t.includes("gather") ||
      t.includes("mine") ||
      t.includes("chop") ||
      t.includes("fish")
    )
      return <Pickaxe size={14} className="text-blue-400" />;
    return <Activity size={14} className="text-[#f2d08a]" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0b0a15]/50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f2d08a]"></div>
      </div>
    );
  }

  const resourceEntries = stats
    ? Object.entries(stats.resourcesGathered).filter(([, v]) => v > 0)
    : [];

  return (
    <div className="flex flex-col h-full bg-[#0b0a15]/50 backdrop-blur-sm">
      {/* Header */}
      <div className="p-4 border-b border-[#8b4513]/30 bg-[#0b0a15]/80">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Activity className="text-[#f2d08a]" size={20} />
            <h2 className="font-bold text-[#f2d08a]">Session Activity</h2>
          </div>
          <button
            onClick={fetchActivity}
            className="p-2 hover:bg-[#f2d08a]/10 rounded-lg text-[#f2d08a] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Session Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#1a1005] border border-[#8b4513]/30 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Swords size={14} className="text-red-400" />
                <span className="text-xs text-[#f2d08a]/60">Kills</span>
              </div>
              <span className="text-lg font-bold text-[#e8ebf4]">
                {stats.kills}
              </span>
            </div>
            <div className="bg-[#1a1005] border border-[#8b4513]/30 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Skull size={14} className="text-gray-400" />
                <span className="text-xs text-[#f2d08a]/60">Deaths</span>
              </div>
              <span className="text-lg font-bold text-[#e8ebf4]">
                {stats.deaths}
              </span>
            </div>
            <div className="bg-[#1a1005] border border-[#8b4513]/30 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp size={14} className="text-green-400" />
                <span className="text-xs text-[#f2d08a]/60">XP</span>
              </div>
              <span className="text-lg font-bold text-[#e8ebf4]">
                {stats.totalXpGained.toLocaleString()}
              </span>
            </div>
            <div className="bg-[#1a1005] border border-[#8b4513]/30 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Coins size={14} className="text-yellow-400" />
                <span className="text-xs text-[#f2d08a]/60">Gold</span>
              </div>
              <span className="text-lg font-bold text-[#e8ebf4]">
                {stats.goldEarned.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {resourceEntries.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {resourceEntries.map(([resource, count]) => (
              <span
                key={resource}
                className="px-2 py-1 text-xs bg-[#1a1005] border border-[#8b4513]/30 rounded text-[#e8ebf4]/80"
              >
                <Pickaxe size={10} className="inline mr-1 text-blue-400" />
                {resource}: {count}
              </span>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {error}
          </div>
        )}
      </div>

      {/* Recent Actions */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#f2d08a]/40">
            <Activity size={48} className="mb-4" />
            <p className="text-center">No recent actions</p>
            <p className="text-xs mt-1">
              Activity will appear here as the agent plays
            </p>
          </div>
        ) : (
          actions.map((action, i) => (
            <div
              key={`${action.timestamp}-${i}`}
              className="flex items-start gap-3 bg-[#1a1005] border border-[#8b4513]/30 rounded-lg p-3 hover:border-[#f2d08a]/20 transition-colors"
            >
              <div className="mt-0.5">{getActionIcon(action.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#e8ebf4]">{action.description}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-[#f2d08a]/40">
                  <span>{new Date(action.timestamp).toLocaleTimeString()}</span>
                  {action.xpGained != null && action.xpGained > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-green-400">
                        +{action.xpGained} XP
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
