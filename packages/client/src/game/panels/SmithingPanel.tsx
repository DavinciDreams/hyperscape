/**
 * SmithingPanel - OSRS-style smithing interface
 *
 * Features:
 * - Shows available items to smith based on player's bars
 * - Displays level requirements, bar requirements, XP
 * - Groups items by category (weapons, armor, etc.)
 * - Allows quantity selection (1, 5, 10, All, X)
 * - Sends smithing request to server
 */

import React, { useState, useMemo } from "react";
import type { ClientWorld } from "../../types";
import { useThemeStore } from "@/ui";
import { getPanelHeaderStyle, getPanelSurfaceStyle } from "@/ui/theme/themes";
import { formatItemName } from "@/utils";
import { ItemIcon } from "@/ui/components/ItemIcon";

interface SmithingRecipe {
  itemId: string;
  name: string;
  barType: string;
  barsRequired: number;
  levelRequired: number;
  xp: number;
  category: string;
  outputQuantity?: number;
}

interface SmithingPanelProps {
  anvilId: string;
  availableRecipes: SmithingRecipe[];
  world: ClientWorld;
  onClose: () => void;
}

/**
 * Category order for display
 */
const CATEGORY_ORDER = ["weapons", "armor", "tools", "arrowtips", "misc"];

/** localStorage key for Make X memory */
const SMITHING_LAST_X_KEY = "smithing_last_x";

export function SmithingPanel({
  anvilId,
  availableRecipes,
  world,
  onClose,
}: SmithingPanelProps) {
  const theme = useThemeStore((s) => s.theme);
  const [selectedRecipe, setSelectedRecipe] = useState<SmithingRecipe | null>(
    null,
  );
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  const [customQuantity, setCustomQuantity] = useState("");

  // Make X memory - remember last custom quantity (OSRS feature)
  const [lastCustomQuantity, setLastCustomQuantity] = useState(() => {
    try {
      const stored = localStorage.getItem(SMITHING_LAST_X_KEY);
      return stored ? parseInt(stored, 10) || 10 : 10;
    } catch {
      return 10;
    }
  });

  // Group recipes by category
  const groupedRecipes = useMemo(() => {
    const groups: Record<string, SmithingRecipe[]> = {};

    for (const recipe of availableRecipes) {
      const category = recipe.category || "misc";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(recipe);
    }

    // Sort by category order
    const sorted: Array<[string, SmithingRecipe[]]> = [];
    for (const cat of CATEGORY_ORDER) {
      if (groups[cat]) {
        sorted.push([cat, groups[cat]]);
      }
    }
    // Add any categories not in the predefined order
    for (const cat of Object.keys(groups)) {
      if (!CATEGORY_ORDER.includes(cat)) {
        sorted.push([cat, groups[cat]]);
      }
    }

    return sorted;
  }, [availableRecipes]);

  const handleSmith = (recipe: SmithingRecipe, qty: number) => {
    if (world.network?.send) {
      world.network.send("processingSmithing", {
        recipeId: recipe.itemId,
        anvilId,
        quantity: qty,
      });
    }
    onClose();
  };

  const handleCustomQuantitySubmit = () => {
    // Use entered quantity, or fall back to last X if empty (OSRS behavior)
    const qty = customQuantity.trim()
      ? parseInt(customQuantity, 10)
      : lastCustomQuantity;

    if (qty > 0 && selectedRecipe) {
      // Save to localStorage for Make X memory (only if custom value entered)
      if (customQuantity.trim()) {
        try {
          localStorage.setItem(SMITHING_LAST_X_KEY, String(qty));
          setLastCustomQuantity(qty);
        } catch {
          // localStorage may be unavailable
        }
      }
      handleSmith(selectedRecipe, qty);
    }
    setShowQuantityInput(false);
    setCustomQuantity("");
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[2000] pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-lg shadow-2xl border"
        style={{
          ...getPanelSurfaceStyle(theme, { emphasis: "strong" }),
          minWidth: "380px",
          maxWidth: "480px",
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b"
          style={{
            ...getPanelHeaderStyle(theme),
            borderColor: theme.colors.border.decorative,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🔨</span>
            <span
              className="font-semibold text-sm"
              style={{ color: theme.colors.accent.primary }}
            >
              Smithing
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 transition-colors"
            style={{ color: theme.colors.accent.primary }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          className="p-3 overflow-y-auto"
          style={{ maxHeight: "calc(80vh - 100px)" }}
        >
          {availableRecipes.length === 0 ? (
            <div
              className="text-center py-4 text-sm"
              style={{ color: theme.colors.text.secondary }}
            >
              You don't have the bars to smith anything.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {groupedRecipes.map(([category, recipes]) => (
                <div key={category}>
                  {/* Category Header */}
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-1.5 px-1"
                    style={{ color: theme.colors.text.muted }}
                  >
                    {category}
                  </div>

                  {/* Recipe Grid */}
                  <div className="grid grid-cols-2 gap-1">
                    {recipes.map((recipe) => (
                      <button
                        key={recipe.itemId}
                        onClick={() => setSelectedRecipe(recipe)}
                        className={`flex items-center gap-2 p-2 rounded border transition-all text-left ${
                          selectedRecipe?.itemId === recipe.itemId
                            ? "ring-2 ring-yellow-500"
                            : ""
                        }`}
                        style={{
                          background:
                            selectedRecipe?.itemId === recipe.itemId
                              ? `${theme.colors.accent.primary}15`
                              : theme.colors.background.tertiary,
                          borderColor:
                            selectedRecipe?.itemId === recipe.itemId
                              ? `${theme.colors.accent.primary}50`
                              : theme.colors.border.default,
                        }}
                      >
                        <ItemIcon itemId={recipe.itemId} size={28} />

                        {/* Item Info */}
                        <div className="flex-1 min-w-0">
                          <div
                            className="font-medium text-xs truncate"
                            style={{ color: theme.colors.accent.primary }}
                          >
                            {recipe.name || formatItemName(recipe.itemId)}
                            {recipe.outputQuantity && recipe.outputQuantity > 1
                              ? ` (x${recipe.outputQuantity})`
                              : ""}
                          </div>
                          <div
                            className="text-[9px] flex items-center gap-1"
                            style={{ color: theme.colors.text.muted }}
                          >
                            <ItemIcon itemId={recipe.barType} size={14} />
                            <span>×{recipe.barsRequired}</span>
                            <span className="mx-0.5">|</span>
                            <span>Lv{recipe.levelRequired}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Selected Recipe Details & Quantity */}
              {selectedRecipe && (
                <div
                  className="mt-2 pt-3"
                  style={{
                    borderTop: `1px solid ${theme.colors.border.default}`,
                  }}
                >
                  {/* Recipe Details */}
                  <div className="flex items-center gap-3 mb-3">
                    <ItemIcon itemId={selectedRecipe.itemId} size={40} />
                    <div>
                      <div
                        className="font-semibold text-sm"
                        style={{ color: theme.colors.accent.primary }}
                      >
                        {selectedRecipe.name ||
                          formatItemName(selectedRecipe.itemId)}
                        {selectedRecipe.outputQuantity &&
                        selectedRecipe.outputQuantity > 1
                          ? ` (x${selectedRecipe.outputQuantity})`
                          : ""}
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: theme.colors.text.secondary }}
                      >
                        {selectedRecipe.barsRequired}×{" "}
                        {formatItemName(selectedRecipe.barType)} |{" "}
                        {selectedRecipe.xp} XP
                      </div>
                    </div>
                  </div>

                  {/* Quantity Selection */}
                  <div
                    className="text-xs mb-2"
                    style={{ color: theme.colors.text.secondary }}
                  >
                    How many?
                  </div>

                  {showQuantityInput ? (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={customQuantity}
                        onChange={(e) => setCustomQuantity(e.target.value)}
                        className="flex-1 px-2 py-1 rounded text-sm"
                        style={{
                          background: theme.colors.background.panelSecondary,
                          border: `1px solid ${theme.colors.border.default}`,
                          color: theme.colors.accent.primary,
                        }}
                        placeholder={`Amount (last: ${lastCustomQuantity})`}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCustomQuantitySubmit();
                          if (e.key === "Escape") setShowQuantityInput(false);
                        }}
                      />
                      <button
                        onClick={handleCustomQuantitySubmit}
                        className="px-3 py-1 rounded text-sm font-medium transition-colors"
                        style={{
                          background: `${theme.colors.state.success}30`,
                          border: `1px solid ${theme.colors.state.success}50`,
                          color: theme.colors.state.success,
                        }}
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      {[1, 5, 10].map((qty) => (
                        <button
                          key={qty}
                          onClick={() => handleSmith(selectedRecipe, qty)}
                          className="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors hover:brightness-110"
                          style={{
                            background: `${theme.colors.accent.primary}20`,
                            border: `1px solid ${theme.colors.accent.primary}30`,
                            color: theme.colors.accent.primary,
                          }}
                        >
                          {qty}
                        </button>
                      ))}
                      <button
                        onClick={() => handleSmith(selectedRecipe, 28)}
                        className="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors hover:brightness-110"
                        style={{
                          background: `${theme.colors.accent.primary}20`,
                          border: `1px solid ${theme.colors.accent.primary}30`,
                          color: theme.colors.accent.primary,
                        }}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setShowQuantityInput(true)}
                        className="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors hover:brightness-110"
                        style={{
                          background: `${theme.colors.accent.primary}20`,
                          border: `1px solid ${theme.colors.accent.primary}30`,
                          color: theme.colors.accent.primary,
                        }}
                      >
                        X
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
