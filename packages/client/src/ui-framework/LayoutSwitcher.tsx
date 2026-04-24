/**
 * LayoutSwitcher — the player-facing dropdown that closes the U6 loop.
 *
 * Lists every UI layout available for the current studio-launched game
 * (team-owned + public + templates, via `useGameUILayouts`) and lets
 * the player pick one. The selection is persisted per-game in
 * localStorage via `setPlayerLayoutOverride`, which `useActiveUILayout`
 * reads first (before falling back to the game's authored default).
 *
 * Hides itself when:
 *   - there is no studio context (hook returns empty list), or
 *   - the fetch errored (we have no meaningful choices to show).
 *
 * "Default" resets the override so the game's authored default wins
 * on the next load.
 */

import { memo, useCallback, useEffect, useState } from "react";
import {
  readPlayerLayoutOverride,
  setPlayerLayoutOverride,
  useGameUILayouts,
} from "./useActiveUILayout";

interface LayoutSwitcherProps {
  /**
   * The game id the switcher writes overrides against. Pass the same
   * value that `useActiveUILayout` reads from `__HYPERIA_STUDIO__` /
   * URL params. When omitted we try to read it from the same sources.
   */
  gameId?: string;
  className?: string;
  onChange?: (layoutId: string | null) => void;
}

interface WindowWithStudio extends Window {
  __HYPERIA_STUDIO__?: { gameId?: string };
}

function readFallbackGameId(): string | null {
  if (typeof window === "undefined") return null;
  const fromGlobal = (window as WindowWithStudio).__HYPERIA_STUDIO__?.gameId;
  if (fromGlobal) return fromGlobal;
  try {
    return (
      new URLSearchParams(window.location.search).get("studioGameId") ?? null
    );
  } catch {
    return null;
  }
}

const DEFAULT_VALUE = "__default__";

export const LayoutSwitcher = memo(function LayoutSwitcher({
  gameId,
  className,
  onChange,
}: LayoutSwitcherProps) {
  const effectiveGameId = gameId ?? readFallbackGameId();
  const { layouts, loading, error } = useGameUILayouts();
  const [current, setCurrent] = useState<string>(DEFAULT_VALUE);

  // Sync from localStorage on mount / gameId change so the dropdown
  // reflects the real persisted choice.
  useEffect(() => {
    if (!effectiveGameId) return;
    const stored = readPlayerLayoutOverride(effectiveGameId);
    setCurrent(stored ?? DEFAULT_VALUE);
  }, [effectiveGameId]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value;
      setCurrent(next);
      if (!effectiveGameId) return;
      if (next === DEFAULT_VALUE) {
        setPlayerLayoutOverride(effectiveGameId, null);
        onChange?.(null);
      } else {
        setPlayerLayoutOverride(effectiveGameId, next);
        onChange?.(next);
      }
    },
    [effectiveGameId, onChange],
  );

  // Hide the switcher when we have no game context or nothing to pick.
  // A single authored layout + no templates means the dropdown would
  // only show "Default", which is just noise.
  if (!effectiveGameId) return null;
  if (error) return null;
  if (!loading && layouts.length === 0) return null;

  return (
    <select
      className={className}
      value={current}
      onChange={handleChange}
      aria-label="UI layout"
      disabled={loading}
    >
      <option value={DEFAULT_VALUE}>Default</option>
      {layouts.map((layout) => (
        <option key={layout.id} value={layout.id}>
          {layout.name}
        </option>
      ))}
    </select>
  );
});
