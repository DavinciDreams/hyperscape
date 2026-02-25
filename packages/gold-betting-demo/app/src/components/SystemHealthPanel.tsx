/**
 * SystemHealthPanel - Collapsible status bar showing system health at a glance
 *
 * Displays:
 * - Overall system status (green/yellow/red indicator)
 * - Service status dots (server, duel, stream, API, MM)
 * - Wallet badges (Solana + EVM, separate)
 * - Last update timestamps
 * - Expandable details panel
 */

import React, { useState } from "react";
import {
  useSystemHealth,
  formatFreshness,
  shortenAddress,
  getStatusColor,
  getOverallStatusColor,
  type HealthStatus,
  type ServiceHealth,
} from "../hooks/useSystemHealth";

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

interface StatusDotProps {
  ok: boolean | undefined;
  label: string;
  freshMs?: number | null;
  error?: string;
  showLabel?: boolean;
}

function StatusDot({
  ok,
  label,
  freshMs,
  error,
  showLabel = true,
}: StatusDotProps) {
  const color = getStatusColor(ok);
  const tooltip = error
    ? `${label}: ${error}`
    : freshMs !== null && freshMs !== undefined
      ? `${label}: updated ${formatFreshness(freshMs)}`
      : `${label}: ${ok ? "OK" : "Down"}`;

  return (
    <div
      title={tooltip}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        cursor: "help",
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: ok ? `0 0 6px ${color}` : "none",
          transition: "all 0.3s ease",
        }}
      />
      {showLabel && (
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.6)",
            textTransform: "uppercase",
            fontWeight: 600,
            letterSpacing: 0.5,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

interface WalletBadgeProps {
  chain: "SOL" | "EVM";
  connected: boolean;
  address?: string | null;
  chainName?: string | null;
}

function WalletBadge({
  chain,
  connected,
  address,
  chainName,
}: WalletBadgeProps) {
  const bgColor = connected
    ? chain === "SOL"
      ? "rgba(153, 69, 255, 0.2)"
      : "rgba(59, 130, 246, 0.2)"
    : "rgba(255,255,255,0.05)";
  const borderColor = connected
    ? chain === "SOL"
      ? "rgba(153, 69, 255, 0.4)"
      : "rgba(59, 130, 246, 0.4)"
    : "rgba(255,255,255,0.1)";
  const textColor = connected
    ? "rgba(255,255,255,0.9)"
    : "rgba(255,255,255,0.4)";

  const displayChain = chainName || (chain === "SOL" ? "Solana" : "EVM");
  const displayAddr = connected ? shortenAddress(address) : "Not connected";

  return (
    <div
      title={
        connected
          ? `${displayChain}: ${address}`
          : `${chain} wallet not connected`
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 4,
        background: bgColor,
        border: `1px solid ${borderColor}`,
        fontSize: 10,
        fontFamily: "'IBM Plex Mono', monospace",
        color: textColor,
        cursor: "help",
      }}
    >
      <span style={{ fontWeight: 700 }}>{chain}</span>
      <span style={{ opacity: 0.7 }}>|</span>
      <span>{displayAddr}</span>
    </div>
  );
}

interface ServiceRowProps {
  name: string;
  service: ServiceHealth;
}

function ServiceRow({ name, service }: ServiceRowProps) {
  const color = getStatusColor(service.ok);
  const freshText =
    service.freshMs !== null && service.freshMs !== undefined
      ? formatFreshness(service.freshMs)
      : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 8px",
        borderRadius: 4,
        background: service.ok
          ? "rgba(34,197,94,0.05)"
          : "rgba(239,68,68,0.05)",
        border: `1px solid ${service.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            boxShadow: service.ok ? `0 0 4px ${color}` : "none",
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          {name}
        </span>
        {service.phase && (
          <span
            style={{
              fontSize: 9,
              padding: "1px 4px",
              borderRadius: 3,
              background: "rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            {service.phase}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {freshText && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            {freshText}
          </span>
        )}
        {service.error && (
          <span
            style={{
              fontSize: 10,
              color: "#ef4444",
              maxWidth: 150,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={service.error}
          >
            {service.error}
          </span>
        )}
        {service.latencyMs !== undefined && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            {service.latencyMs}ms
          </span>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function SystemHealthPanel() {
  const { health, loading, error, lastFetchAgoMs, overallStatus, refresh } =
    useSystemHealth();
  const [expanded, setExpanded] = useState(false);

  const overallColor = getOverallStatusColor(overallStatus);
  const statusLabel: Record<HealthStatus, string> = {
    healthy: "All Systems Operational",
    degraded: "Degraded Performance",
    error: "System Issues",
    unknown: "Checking Status…",
  };

  // Pulse animation for the main indicator
  const pulseKeyframes = `
    @keyframes healthPulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 4px ${overallColor}; }
      50% { opacity: 0.6; box-shadow: 0 0 8px ${overallColor}; }
    }
  `;

  return (
    <>
      <style>{pulseKeyframes}</style>
      <div
        style={{
          background: "rgba(0,0,0,0.6)",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {/* Collapsed Bar */}
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 12px",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          {/* Left: Overall status + service dots */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Main indicator */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: overallColor,
                  animation: loading
                    ? "healthPulse 1s ease-in-out infinite"
                    : "none",
                  boxShadow: `0 0 6px ${overallColor}`,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: overallColor,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {statusLabel[overallStatus]}
              </span>
            </div>

            {/* Service dots (compact) */}
            {health && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  paddingLeft: 8,
                  borderLeft: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <StatusDot
                  ok={health.services.server.ok}
                  label="SRV"
                  freshMs={health.services.server.latencyMs}
                />
                <StatusDot
                  ok={health.services.duelState.ok}
                  label="DUEL"
                  freshMs={health.services.duelState.freshMs}
                  error={health.services.duelState.error}
                />
                <StatusDot
                  ok={health.services.stream.ok}
                  label="STRM"
                  freshMs={health.services.stream.freshMs}
                  error={health.services.stream.error}
                />
                <StatusDot
                  ok={health.services.bettingApi.ok}
                  label="API"
                  freshMs={health.services.bettingApi.freshMs}
                  error={health.services.bettingApi.error}
                />
                <StatusDot
                  ok={health.services.mm.ok}
                  label="MM"
                  freshMs={health.services.mm.freshMs}
                  error={health.services.mm.error}
                />
              </div>
            )}
          </div>

          {/* Center: Wallet badges */}
          {health && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <WalletBadge
                chain="SOL"
                connected={health.wallets.solana.connected}
                address={health.wallets.solana.pubkey}
              />
              <WalletBadge
                chain="EVM"
                connected={health.wallets.evm.connected}
                address={health.wallets.evm.address}
                chainName={health.wallets.evm.chain}
              />
            </div>
          )}

          {/* Right: Last update + expand toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {error && (
              <span
                style={{
                  fontSize: 10,
                  color: "#ef4444",
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={error}
              >
                {error}
              </span>
            )}
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
              Updated {formatFreshness(lastFetchAgoMs)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void refresh();
              }}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.4)",
                cursor: "pointer",
                padding: 4,
                fontSize: 12,
              }}
              title="Refresh now"
            >
              ⟳
            </button>
            <span
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.4)",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              ▼
            </span>
          </div>
        </div>

        {/* Expanded Details */}
        {expanded && health && (
          <div
            style={{
              padding: "8px 12px 12px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            {/* Services */}
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                Services
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <ServiceRow name="Server" service={health.services.server} />
                <ServiceRow
                  name="Duel Scheduler"
                  service={health.services.duelState}
                />
                <ServiceRow
                  name="Stream (HLS)"
                  service={health.services.stream}
                />
                <ServiceRow
                  name="Betting API"
                  service={health.services.bettingApi}
                />
                <ServiceRow name="Market Maker" service={health.services.mm} />
              </div>
            </div>

            {/* Market & Wallets */}
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                Market Status
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  fontSize: 11,
                }}
              >
                <div>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>
                    Last Trade:
                  </span>{" "}
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>
                    {health.market.lastTradeAt
                      ? formatFreshness(
                          Date.now() -
                            new Date(health.market.lastTradeAt).getTime(),
                        )
                      : "—"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>
                    Trade Size:
                  </span>{" "}
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>
                    {health.market.lastTradeSize ?? "—"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>
                    Orderbook:
                  </span>{" "}
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>
                    {health.market.orderbookFreshMs !== null
                      ? formatFreshness(health.market.orderbookFreshMs)
                      : "—"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>
                    Mid Price:
                  </span>{" "}
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>
                    {health.market.midPrice !== null
                      ? `${(health.market.midPrice * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              </div>

              {/* Stream URL */}
              {health.services.stream.url && (
                <div style={{ marginTop: 8, fontSize: 10 }}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>
                    Stream:
                  </span>{" "}
                  <span
                    style={{
                      color: health.services.stream.ok
                        ? "rgba(34,197,94,0.8)"
                        : "rgba(239,68,68,0.8)",
                      fontFamily: "'IBM Plex Mono', monospace",
                      wordBreak: "break-all",
                    }}
                  >
                    {health.services.stream.url}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
