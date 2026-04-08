import React, { useState, useEffect } from "react";
import {
  Clock,
  Activity,
  MessageSquare,
  Zap,
  AlertCircle,
  Brain,
  Swords,
} from "lucide-react";
import type { Agent } from "./types";
import { ELIZAOS_API } from "@/lib/api-config";

interface TimelineEvent {
  id: string;
  type: "thinking" | "decision" | "action" | "situation" | "evaluation";
  title: string;
  description: string;
  timestamp: number;
}

interface AgentThought {
  id: string;
  type: "situation" | "evaluation" | "thinking" | "decision" | "action";
  content: string;
  timestamp: number;
}

interface AgentTimelineProps {
  agent: Agent;
}

export const AgentTimeline: React.FC<AgentTimelineProps> = ({ agent }) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 8000);
    return () => clearInterval(interval);
  }, [agent.id]);

  const fetchTimeline = async () => {
    try {
      const response = await fetch(
        `${ELIZAOS_API}/agents/${agent.id}/thoughts?limit=100`,
      );

      if (!response.ok) {
        setEvents([]);
        setError("Timeline unavailable right now");
        return;
      }

      const data = await response.json();
      if (!data.success) {
        setEvents([]);
        setError(data.message || "Timeline unavailable");
        return;
      }

      const thoughts: AgentThought[] = data.thoughts || [];

      const timelineEvents: TimelineEvent[] = thoughts.map((t) => ({
        id: t.id,
        type: t.type,
        title: formatThoughtTitle(t),
        description: t.content,
        timestamp: t.timestamp,
      }));

      // Most recent first
      timelineEvents.sort((a, b) => b.timestamp - a.timestamp);

      setEvents(timelineEvents);
      setError(null);
    } catch {
      setEvents([]);
      setError("Timeline unavailable right now");
    } finally {
      setLoading(false);
    }
  };

  const formatThoughtTitle = (t: AgentThought): string => {
    switch (t.type) {
      case "situation":
        return "Situation Assessment";
      case "evaluation":
        return "Evaluating Options";
      case "thinking":
        return "Thinking";
      case "decision":
        return "Decision Made";
      case "action":
        return "Action Taken";
      default:
        return "Activity";
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "situation":
        return <MessageSquare size={16} className="text-blue-400" />;
      case "evaluation":
        return <Brain size={16} className="text-purple-400" />;
      case "thinking":
        return <Brain size={16} className="text-cyan-400" />;
      case "decision":
        return <Zap size={16} className="text-yellow-400" />;
      case "action":
        return <Swords size={16} className="text-green-400" />;
      default:
        return <Activity size={16} className="text-[#f2d08a]" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "situation":
        return "border-blue-500/30 bg-blue-900/10";
      case "evaluation":
        return "border-purple-500/30 bg-purple-900/10";
      case "thinking":
        return "border-cyan-500/30 bg-cyan-900/10";
      case "decision":
        return "border-yellow-500/30 bg-yellow-900/10";
      case "action":
        return "border-green-500/30 bg-green-900/10";
      default:
        return "border-[#8b4513]/30 bg-[#1a1005]";
    }
  };

  const filteredEvents = events.filter((event) => {
    if (filter === "all") return true;
    return event.type === filter;
  });

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
            <Clock className="text-[#f2d08a]" size={20} />
            <h2 className="font-bold text-[#f2d08a]">Activity Timeline</h2>
            <span className="px-2 py-0.5 rounded text-[10px] bg-[#f2d08a]/10 text-[#f2d08a] border border-[#f2d08a]/20">
              {filteredEvents.length} Events
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              "all",
              "action",
              "decision",
              "thinking",
              "situation",
              "evaluation",
            ] as const
          ).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded capitalize ${
                filter === f
                  ? f === "all"
                    ? "bg-[#f2d08a]/20 text-[#f2d08a]"
                    : f === "action"
                      ? "bg-green-500/20 text-green-400"
                      : f === "decision"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : f === "thinking"
                          ? "bg-cyan-500/20 text-cyan-400"
                          : f === "situation"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-purple-500/20 text-purple-400"
                  : "bg-[#1a1005] text-[#f2d08a]/40 hover:text-[#f2d08a]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {error && (
          <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {error}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#f2d08a]/40">
            <Clock size={48} className="mb-4" />
            <p>No activity yet</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-[#8b4513]/30" />

            {/* Events */}
            <div className="space-y-4">
              {filteredEvents.map((event) => (
                <div key={event.id} className="relative flex gap-4">
                  {/* Icon */}
                  <div className="relative z-10 flex-shrink-0 w-12 h-12 rounded-full bg-[#0b0a15] border-2 border-[#8b4513]/30 flex items-center justify-center">
                    {getEventIcon(event.type)}
                  </div>

                  {/* Content */}
                  <div
                    className={`flex-1 border rounded-lg p-4 ${getEventColor(event.type)}`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-medium text-[#e8ebf4] text-sm">
                        {event.title}
                      </h3>
                      <span className="text-xs text-[#f2d08a]/40 whitespace-nowrap ml-3">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-[#e8ebf4]/60">
                      {event.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
