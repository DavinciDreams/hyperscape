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

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

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

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.muted = true;
        video.play().catch((e) => console.log("HLS autoplay failed", e));
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", () => {
        video.muted = true;
        video.play().catch((e) => console.log("HLS autoplay failed", e));
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  const fetchData = async () => {
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
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    }
  };

  useEffect(() => {
    fetchData();
    if (autoRefresh) {
      const interval = setInterval(fetchData, 3000);
      return () => clearInterval(interval);
    }
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
