/**
 * Disconnected Overlay Component
 *
 * Shows when the connection to the server is lost.
 * Provides auto-reconnect with countdown and manual reconnect option.
 *
 * @packageDocumentation
 */

import React, { useEffect, useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { useThemeStore } from "@/ui";
import { UI } from "@/ui/core";
import {
  getInteractiveTileStyle,
  getPanelSurfaceStyle,
} from "@/ui/theme/themes";

/**
 * Disconnected overlay component
 */
export function Disconnected(): React.ReactElement {
  const theme = useThemeStore((s) => s.theme);
  const [countdown, setCountdown] = useState(5);
  const [isAutoReconnecting, setIsAutoReconnecting] = useState(true);

  // Auto-reconnect countdown
  useEffect(() => {
    if (!isAutoReconnecting || countdown <= 0) return;

    const timer = window.setTimeout(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [isAutoReconnecting, countdown]);

  const handleManualReconnect = (): void => {
    window.location.reload();
  };

  const handleCancelAutoReconnect = (): void => {
    setIsAutoReconnecting(false);
  };

  return (
    <>
      <div
        className="fixed top-0 left-0 w-full h-full backdrop-grayscale pointer-events-none opacity-0 animate-[fadeIn_3s_ease-in-out_forwards]"
        style={{ zIndex: UI.Z_INDEX.CRITICAL }}
      />
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <div
        className="pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 backdrop-blur-md rounded-2xl p-4 flex flex-col items-center gap-3"
        style={{
          ...getPanelSurfaceStyle(theme, { emphasis: "strong" }),
          color: theme.colors.text.primary,
          minWidth: "240px",
          zIndex: UI.Z_INDEX.CRITICAL,
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: isAutoReconnecting ? "#f59e0b" : "#ef4444",
              animation: isAutoReconnecting
                ? "pulse 1.5s ease-in-out infinite"
                : "none",
            }}
          />
          <span className="font-medium">Connection Lost</span>
        </div>

        {isAutoReconnecting ? (
          <>
            <div className="text-sm opacity-70">
              Reconnecting in {countdown}s...
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                style={{
                  ...getInteractiveTileStyle(theme, {
                    active: true,
                    accentColor:
                      theme.colors.accent?.primary ||
                      theme.colors.border.default,
                    radius: theme.borderRadius.lg,
                  }),
                  color: theme.colors.text.primary,
                }}
                onClick={handleManualReconnect}
              >
                <RefreshCwIcon size={14} />
                <span>Reconnect Now</span>
              </button>
              <button
                className="px-3 py-1.5 rounded-lg cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  ...getInteractiveTileStyle(theme, {
                    radius: theme.borderRadius.lg,
                  }),
                  color: theme.colors.text.secondary,
                }}
                onClick={handleCancelAutoReconnect}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm opacity-70">Auto-reconnect cancelled</div>
            <button
              className="px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
              style={{
                ...getInteractiveTileStyle(theme, {
                  active: true,
                  accentColor:
                    theme.colors.accent?.primary || theme.colors.border.default,
                  radius: theme.borderRadius.lg,
                }),
                color: theme.colors.text.primary,
              }}
              onClick={handleManualReconnect}
            >
              <RefreshCwIcon size={16} />
              <span>Reconnect</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}

export default Disconnected;
