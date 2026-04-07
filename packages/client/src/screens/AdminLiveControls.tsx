import React, { useEffect, useState, useRef } from "react";
import {
  Play,
  Pause,
  RefreshCw,
  Terminal,
  Activity,
  Video,
  Power,
  AlertTriangle,
  Server,
} from "lucide-react";
import Hls from "hls.js";

const LOW_LATENCY_HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: true,
  liveSyncDurationCount: 2,
  liveMaxLatencyDurationCount: 4,
  liveBackBufferLength: 10,
  maxBufferLength: 6,
  maxMaxBufferLength: 12,
  maxLiveSyncPlaybackRate: 1.5,
};

const STABLE_HLS_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  liveSyncDurationCount: 4,
  liveMaxLatencyDurationCount: 8,
  liveBackBufferLength: 16,
  maxBufferLength: 12,
  maxMaxBufferLength: 20,
  maxLiveSyncPlaybackRate: 1.25,
};

function resolvePlaybackProfile(streamUrl: string) {
  if (streamUrl.includes("protocol=llhls")) {
    return {
      config: LOW_LATENCY_HLS_CONFIG,
      driftThresholdMs: 8_000,
      waitingGraceMs: 450,
      reloadOnBufferStall: true,
    };
  }
  return {
    config: STABLE_HLS_CONFIG,
    driftThresholdMs: 14_000,
    waitingGraceMs: 1_500,
    reloadOnBufferStall: false,
  };
}

function readLiveEdgeLatencyMs(video: HTMLVideoElement, hls: Hls | null): number | null {
  if (hls && typeof hls.latency === "number" && Number.isFinite(hls.latency)) {
    return Math.max(0, Math.round(hls.latency * 1000));
  }
  if (video.seekable.length > 0) {
    const liveEdge = video.seekable.end(video.seekable.length - 1);
    const remaining = liveEdge - video.currentTime;
    if (Number.isFinite(remaining) && remaining >= 0) {
      return Math.round(remaining * 1000);
    }
  }
  if (video.buffered.length > 0) {
    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    const remaining = bufferedEnd - video.currentTime;
    if (Number.isFinite(remaining) && remaining >= 0) {
      return Math.round(remaining * 1000);
    }
  }
  return null;
}

interface LogEntry {
  timestamp: number;
  level: string;
  system: string;
  message: string;
  data?: Record<string, unknown>;
}

interface MaintenanceStatus {
  active: boolean;
  enteredAt: number | null;
  reason: string | null;
  safeToDeploy: boolean;
  currentPhase: string | null;
  marketStatus: string;
  pendingMarkets: number;
}

interface DuelStatus {
  currentCycle: any;
  leaderboard: any[];
  recentDuels: any[];
  streamHealth: {
    rtmpConnected: boolean;
    viewerCount: number;
  } | null;
}

interface AdminLiveControlsProps {
  adminFetch: (path: string, options?: RequestInit) => Promise<any>;
}

export const AdminLiveControls: React.FC<AdminLiveControlsProps> = ({
  adminFetch,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(
    null,
  );
  const [duelStatus, setDuelStatus] = useState<DuelStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [previewLatencyMs, setPreviewLatencyMs] = useState<number | null>(null);
  const [previewStalls, setPreviewStalls] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const waitingTimeoutRef = useRef<number | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (autoRefresh) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Init HLS player
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Use absolute URL since frontend runs on different port usually in dev
    const streamUrl = "/live/stream.m3u8";
    const playbackProfile = resolvePlaybackProfile(streamUrl);

    const clearWaitingTimeout = () => {
      if (waitingTimeoutRef.current == null) return;
      window.clearTimeout(waitingTimeoutRef.current);
      waitingTimeoutRef.current = null;
    };

    const syncLatency = () => {
      const hls = hlsRef.current;
      const latencyMs = readLiveEdgeLatencyMs(video, hls);
      if (latencyMs != null) {
        setPreviewLatencyMs(latencyMs);
        if (latencyMs > playbackProfile.driftThresholdMs && hls) {
          setPreviewStatus("Playback drifted from the live edge.");
          hls.startLoad(-1);
        }
      }
    };

    if (Hls.isSupported()) {
      const hls = new Hls(playbackProfile.config);
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPreviewStatus(null);
        syncLatency();
        video.muted = true;
        video.play().catch((e) => console.log("HLS autoplay failed", e));
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        clearWaitingTimeout();
        setPreviewStatus(null);
        syncLatency();
      });
      hls.on(Hls.Events.LEVEL_UPDATED, () => {
        syncLatency();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal && data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          setPreviewStalls((current) => current + 1);
          setPreviewStatus("Playback drifted from the live edge.");
          if (playbackProfile.reloadOnBufferStall) {
            hls.startLoad(-1);
          } else {
            void video.play().catch(() => {});
          }
          return;
        }
        if (
          !data.fatal &&
          (data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
            data.details === Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT)
        ) {
          setPreviewStalls((current) => current + 1);
          setPreviewStatus("Reconnecting to the live stream.");
          hls.startLoad(-1);
          return;
        }
        if (data.fatal) {
          setPreviewStatus("Live stream preview unavailable.");
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", () => {
        video.muted = true;
        video.play().catch((e) => console.log("HLS autoplay failed", e));
      });
    }

    const handleWaiting = () => {
      clearWaitingTimeout();
      waitingTimeoutRef.current = window.setTimeout(() => {
        setPreviewStalls((current) => current + 1);
        setPreviewStatus("Player buffering near the live edge.");
      }, playbackProfile.waitingGraceMs);
    };
    const handlePlaying = () => {
      clearWaitingTimeout();
      setPreviewStatus(null);
      syncLatency();
    };
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    return () => {
      clearWaitingTimeout();
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  const fetchData = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const [logsData, maintData, duelData] = await Promise.all([
        adminFetch("/admin/logs"),
        adminFetch("/admin/maintenance/status"),
        adminFetch("/admin/duels/status"),
      ]);
      setLogs(logsData.logs || []);
      setMaintenance(maintData);
      setDuelStatus(duelData);
      setActionError(null);
    } catch {
      setActionError((prev) => prev ?? "Live data temporarily unavailable");
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    const clearPollTimeout = () => {
      if (pollTimeoutRef.current !== null) {
        window.clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };

    const scheduleNextPoll = () => {
      clearPollTimeout();
      if (!autoRefresh) return;
      const delay = document.visibilityState === "visible" ? 3000 : 12000;
      pollTimeoutRef.current = window.setTimeout(() => {
        pollTimeoutRef.current = null;
        void fetchData().finally(scheduleNextPoll);
      }, delay);
    };

    void fetchData().finally(scheduleNextPoll);
    const onVisibilityChange = () => {
      if (!autoRefresh) return;
      scheduleNextPoll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearPollTimeout();
    };
  }, [autoRefresh, adminFetch]);

  const handleMaintenanceToggle = async () => {
    setLoading(true);
    setActionError(null);
    try {
      if (maintenance?.active) {
        await adminFetch("/admin/maintenance/exit", { method: "POST" });
      } else {
        await adminFetch("/admin/maintenance/enter", {
          method: "POST",
          body: JSON.stringify({ reason: "Admin requested via panel" }),
        });
      }
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || "Failed to toggle maintenance mode");
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    if (
      !window.confirm(
        "Are you sure you want to restart the server? Make sure safe-to-deploy is active.",
      )
    ) {
      return;
    }
    setLoading(true);
    setActionError(null);
    try {
      await adminFetch("/admin/restart", { method: "POST" });
      alert("Restart signal sent! Server should be restarting now.");
    } catch (err: any) {
      setActionError(err.message || "Failed to restart process");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-live-controls">
      <div className="admin-panel-header">
        <h2>
          <Activity size={20} />
          Live Controls
        </h2>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <label className="admin-auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button
            className="admin-refresh-btn"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw
              size={16}
              className={loading && autoRefresh ? "spinning" : ""}
            />
          </button>
        </div>
      </div>

      {actionError && (
        <div className="admin-error-banner">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)}>Dismiss</button>
        </div>
      )}

      <div className="admin-dashboard-grid">
        {/* Stream Preview Panel */}
        <div className="admin-dashboard-card stream-card">
          <div className="card-header">
            <h3>
              <Video size={16} /> Stream Preview
            </h3>
          </div>
          <div className="stream-container">
            <video ref={videoRef} controls autoPlay muted playsInline />
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>
              latency{" "}
              {previewLatencyMs != null
                ? `${(previewLatencyMs / 1000).toFixed(1)}s`
                : "n/a"}
            </span>
            <span>stalls {previewStalls}</span>
            <span>{previewStatus ?? "live-edge healthy"}</span>
          </div>
        </div>

        {/* Server Controls Panel */}
        <div className="admin-dashboard-card controls-card">
          <div className="card-header">
            <h3>
              <Server size={16} /> Game State Controls
            </h3>
          </div>
          <div className="controls-content">
            <div
              className={`status-badge ${maintenance?.active ? "warning" : "success"}`}
            >
              {maintenance?.active ? "MAINTENANCE MODE" : "GAME ACTIVE"}
            </div>

            <p className="status-detail">
              <strong>Safe to Deploy:</strong>{" "}
              {maintenance?.safeToDeploy ? "YES" : "NO"}
              <br />
              <strong>Current Phase:</strong>{" "}
              {maintenance?.currentPhase || "IDLE"}
              <br />
              <strong>Viewers:</strong>{" "}
              {duelStatus?.streamHealth?.viewerCount || 0}
            </p>

            <div className="control-actions">
              <button
                className={`action-btn ${maintenance?.active ? "success" : "warning"}`}
                onClick={handleMaintenanceToggle}
                disabled={loading}
              >
                {maintenance?.active ? <Play size={16} /> : <Pause size={16} />}
                {maintenance?.active ? "Resume Game" : "Pause Game"}
              </button>

              <button
                className="action-btn danger"
                onClick={handleRestart}
                disabled={loading}
              >
                <Power size={16} />
                Restart Process
              </button>
            </div>

            {!maintenance?.safeToDeploy && maintenance?.active && (
              <div className="info-box waiting">
                <AlertTriangle size={14} /> Waiting for duel to finish before it
                is safe to restart.
              </div>
            )}

            {maintenance?.safeToDeploy && maintenance?.active && (
              <div className="info-box ready">
                Server is paused and safe to restart!
              </div>
            )}
          </div>
        </div>

        {/* Logs Panel */}
        <div
          className="admin-dashboard-card logs-card"
          style={{ gridColumn: "1 / -1" }}
        >
          <div className="card-header">
            <h3>
              <Terminal size={16} /> Live Logs
            </h3>
          </div>
          <div className="logs-container">
            {logs.length === 0 ? (
              <div className="empty-logs">No logs available...</div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={`log-entry level-${log.level.toLowerCase()}`}
                >
                  <span className="log-time">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="log-level">[{log.level}]</span>
                  <span className="log-system">[{log.system}]</span>
                  <span className="log-message">{log.message}</span>
                  {log.data && (
                    <span className="log-data">{JSON.stringify(log.data)}</span>
                  )}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
