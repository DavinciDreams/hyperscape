/**
 * NodePalette — Left sidebar for the Script Editor.
 *
 * Displays all available node types grouped by category. Each item is
 * draggable onto the React Flow canvas. Includes a search/filter input.
 */

import * as LucideIcons from "lucide-react";
import { Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import React, { useState, useCallback, useMemo } from "react";

import type { NodeTypeDefinition } from "../nodeLibrary";
import {
  getNodesByCategory,
  getAllCategories,
  getCategoryColor,
} from "../nodeLibrary";

// ============== TYPES ==============

interface NodePaletteProps {
  onAddNode: (type: string, position: { x: number; y: number }) => void;
}

// ============== ICON RESOLVER ==============

function resolveIcon(iconName: string): LucideIcon | null {
  return (
    (LucideIcons as unknown as Record<string, LucideIcon>)[iconName] ?? null
  );
}

// ============== CATEGORY LABELS ==============

const CATEGORY_LABELS: Record<string, string> = {
  trigger: "Triggers",
  condition: "Conditions",
  action: "Actions",
  flow: "Flow Control",
};

// ============== DRAGGABLE NODE ITEM ==============

interface PaletteItemProps {
  definition: NodeTypeDefinition;
}

function PaletteItem({ definition }: PaletteItemProps) {
  const Icon = resolveIcon(definition.icon);

  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData(
        "application/script-node-type",
        definition.type,
      );
      event.dataTransfer.effectAllowed = "move";
    },
    [definition.type],
  );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 px-3 py-2 rounded-md cursor-grab active:cursor-grabbing"
      style={{
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border-primary)",
        transition: "all 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.borderColor = "var(--border-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-tertiary)";
        e.currentTarget.style.borderColor = "var(--border-primary)";
      }}
      title={definition.description}
    >
      <div
        className="w-6 h-6 rounded flex items-center justify-center shrink-0"
        style={{ backgroundColor: definition.color + "25" }}
      >
        {Icon && <Icon size={14} style={{ color: definition.color }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{ fontSize: 11, color: "var(--text-primary)" }}
        >
          {definition.label}
        </div>
        <div
          className="truncate"
          style={{ fontSize: 10, color: "var(--text-tertiary)" }}
        >
          {definition.description}
        </div>
      </div>
    </div>
  );
}

// ============== PALETTE COMPONENT ==============

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const categories = useMemo(() => getAllCategories(), []);

  const filteredByCategory = useMemo(() => {
    const result: Record<string, NodeTypeDefinition[]> = {};
    const query = searchQuery.toLowerCase().trim();

    for (const category of categories) {
      const defs = getNodesByCategory(category);
      const filtered = query
        ? defs.filter(
            (d) =>
              d.label.toLowerCase().includes(query) ||
              d.description.toLowerCase().includes(query) ||
              d.type.toLowerCase().includes(query),
          )
        : defs;

      if (filtered.length > 0) {
        result[category] = filtered;
      }
    }

    return result;
  }, [categories, searchQuery]);

  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-primary)",
      }}
    >
      {/* Search */}
      <div
        className="p-3"
        style={{ borderBottom: "1px solid var(--border-primary)" }}
      >
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="ws-input w-full"
            style={{
              paddingLeft: 30,
              fontFamily: "var(--font-sans)",
              fontSize: 11,
            }}
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto ws-panel p-2 space-y-2">
        {Object.entries(filteredByCategory).map(([category, defs]) => {
          const isCollapsed = collapsedCategories.has(category);
          const color = getCategoryColor(category);

          return (
            <div key={category}>
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  transition: "background 100ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-tertiary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span>{CATEGORY_LABELS[category] ?? category}</span>
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    ({defs.length})
                  </span>
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
                  {isCollapsed ? "\u25BC" : "\u25B2"}
                </span>
              </button>

              {!isCollapsed && (
                <div className="mt-1 space-y-1 pl-1">
                  {defs.map((def) => (
                    <PaletteItem key={def.type} definition={def} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(filteredByCategory).length === 0 && (
          <div
            className="text-center py-8"
            style={{ fontSize: 11, color: "var(--text-muted)" }}
          >
            No nodes match &ldquo;{searchQuery}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
