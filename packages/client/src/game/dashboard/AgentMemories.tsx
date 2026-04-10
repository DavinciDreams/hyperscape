import React, { useState, useEffect } from "react";
import { Brain, Search, Eye, Target } from "lucide-react";
import type { Agent } from "./types";
import { ELIZAOS_API } from "@/lib/api-config";

interface MemoryEntry {
  id: string;
  type: string;
  content: string;
  timestamp: number;
}

interface AgentMemoriesProps {
  agent: Agent;
}

export const AgentMemories: React.FC<AgentMemoriesProps> = ({ agent }) => {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMemories();
    const interval = setInterval(fetchMemories, 10000);
    return () => clearInterval(interval);
  }, [agent.id]);

  const fetchMemories = async () => {
    try {
      const response = await fetch(
        `${ELIZAOS_API}/agents/${agent.id}/thoughts?limit=200`,
      );

      if (!response.ok) {
        setMemories([]);
        setError("Memories unavailable right now");
        return;
      }

      const data = await response.json();

      if (!data.success) {
        setMemories([]);
        setError(data.message || "Memories unavailable");
        return;
      }

      const thoughts: MemoryEntry[] = (data.thoughts || [])
        .filter(
          (t: { type: string }) =>
            t.type === "situation" || t.type === "evaluation",
        )
        .map(
          (t: {
            id: string;
            type: string;
            content: string;
            timestamp: number;
          }) => ({
            id: t.id,
            type: t.type,
            content: t.content,
            timestamp: t.timestamp,
          }),
        );

      // Most recent first
      thoughts.sort((a, b) => b.timestamp - a.timestamp);

      setMemories(thoughts);
      setError(null);
    } catch {
      setMemories([]);
      setError("Memories unavailable right now");
    } finally {
      setLoading(false);
    }
  };

  const filteredMemories = memories.filter((m) =>
    m.content.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0b0a15]/50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f2d08a]"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0b0a15]/50 backdrop-blur-sm">
      {/* Header */}
      <div className="p-4 border-b border-[#8b4513]/30 bg-[#0b0a15]/80">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Brain className="text-[#f2d08a]" size={20} />
            <h2 className="font-bold text-[#f2d08a]">Agent Memories</h2>
            <span className="px-2 py-0.5 rounded text-[10px] bg-[#f2d08a]/10 text-[#f2d08a] border border-[#f2d08a]/20">
              {filteredMemories.length} Observations
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#f2d08a]/40"
            size={16}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className="w-full bg-[#1a1005] border border-[#8b4513]/30 rounded-lg pl-10 pr-4 py-2 text-[#e8ebf4] placeholder-[#f2d08a]/30 focus:border-[#f2d08a] outline-none transition-colors text-sm"
          />
        </div>
        {error && (
          <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {error}
          </div>
        )}
      </div>

      {/* Memories List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredMemories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#f2d08a]/40">
            <Brain size={48} className="mb-4" />
            <p className="text-center">
              {searchQuery
                ? "No memories match your search"
                : "No memories yet. The agent will build memories through gameplay."}
            </p>
          </div>
        ) : (
          filteredMemories.map((memory) => (
            <div
              key={memory.id}
              className="bg-[#1a1005] border border-[#8b4513]/30 rounded-lg p-4 hover:border-[#f2d08a]/30 transition-colors"
            >
              <div className="flex items-start gap-3 mb-2">
                <div className="mt-0.5">
                  {memory.type === "situation" ? (
                    <Eye size={14} className="text-blue-400" />
                  ) : (
                    <Target size={14} className="text-purple-400" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-[#e8ebf4] text-sm leading-relaxed">
                    {memory.content}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#f2d08a]/40 pl-7">
                <span className="capitalize text-[#f2d08a]/60">
                  {memory.type}
                </span>
                <span>•</span>
                <span>{new Date(memory.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
