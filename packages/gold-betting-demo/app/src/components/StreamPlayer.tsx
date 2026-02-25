import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Hls from "hls.js";

interface StreamPlayerProps {
  streamUrl: string;
  poster?: string;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onStreamUnavailable?: () => void;
}

export const StreamPlayer: React.FC<StreamPlayerProps> = ({
  streamUrl,
  poster,
  autoPlay = true,
  muted = true,
  className,
  style,
  onStreamUnavailable,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const embedUrl = useMemo(
    () => resolveEmbedUrl(streamUrl, autoPlay, muted),
    [autoPlay, muted, streamUrl],
  );
  const unavailableNotifiedRef = useRef(false);
  const [streamDiagnostic, setStreamDiagnostic] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<
    "connecting" | "live" | "error" | "recovering"
  >("connecting");
  const diagnosticTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const markUnavailable = useCallback(() => {
    if (unavailableNotifiedRef.current) return;
    unavailableNotifiedRef.current = true;
    onStreamUnavailable?.();
  }, [onStreamUnavailable]);

  useEffect(() => {
    unavailableNotifiedRef.current = false;
  }, [streamUrl]);

  useEffect(() => {
    if (embedUrl) return;
    markUnavailable();
  }, [embedUrl, markUnavailable]);

  useEffect(() => {
    // External embeddable URLs render through iframe mode below.
    if (embedUrl) return;

    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let hls: Hls | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let healthWatchdog: ReturnType<typeof setInterval> | null = null;
    let lastPlaybackTime = 0;
    let lastPlaylistUpdateAt = Date.now();
    let stallCount = 0;
    let disposed = false;

    const clearTimers = () => {
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }
      if (healthWatchdog) {
        clearInterval(healthWatchdog);
        healthWatchdog = null;
      }
    };

    const sourceUrl = () =>
      `${streamUrl}${streamUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;

    const probeManifest = async () => {
      try {
        const response = await fetch(sourceUrl(), { cache: "no-store" });
        if (!response.ok) {
          const msg =
            response.status === 404
              ? `Stream not found (404) — RTMP source may be offline or HLS path misconfigured`
              : response.status === 502 || response.status === 503
                ? `Stream server unavailable (${response.status}) — RTMP bridge or origin server may be down`
                : response.status >= 500
                  ? `Server error (${response.status}) — backend service issue, check server logs`
                  : response.status === 403
                    ? `Access denied (403) — check CORS policy or authentication`
                    : `Stream fetch failed: HTTP ${response.status}`;
          console.error(`[StreamPlayer] ${msg}`);
          setStreamDiagnostic(msg);
          setStreamStatus("error");
          return false;
        }
        const text = await response.text();
        const hasHeader = /#EXTM3U/i.test(text);
        const hasSegments =
          /#EXTINF/i.test(text) && /\.(ts|m4s|mp4)\b/i.test(text);

        if (!hasHeader) {
          const msg =
            "Manifest missing #EXTM3U header — file may be corrupted or incomplete";
          console.error(`[StreamPlayer] ${msg}`);
          setStreamDiagnostic(msg);
          setStreamStatus("error");
          return false;
        }
        if (!hasSegments) {
          const msg = "Stream starting — waiting for live segments…";
          console.warn(`[StreamPlayer] ${msg}`);
          setStreamDiagnostic(msg);
          setStreamStatus("connecting");
          return false;
        }
        // Clear diagnostic on successful probe
        setStreamDiagnostic(null);
        return true;
      } catch (error) {
        const msg = `Manifest probe error: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[StreamPlayer] ${msg}`);
        setStreamDiagnostic(msg);
        setStreamStatus("error");
        return false;
      }
    };

    const nudgeToLiveEdge = () => {
      if (!video) return;

      const syncPosition = hls?.liveSyncPosition;
      if (typeof syncPosition === "number" && Number.isFinite(syncPosition)) {
        if (syncPosition - video.currentTime > 1) {
          video.currentTime = Math.max(0, syncPosition - 0.5);
        }
      } else if (video.buffered.length > 0) {
        const liveEdge = video.buffered.end(video.buffered.length - 1);
        if (liveEdge - video.currentTime > 1) {
          video.currentTime = Math.max(0, liveEdge - 0.5);
        }
      }

      void video.play().catch(() => {});
    };

    const scheduleRebuild = (reason: string, delayMs = 1500) => {
      console.warn(`[StreamPlayer] Rebuilding stream: ${reason}`);
      setStreamStatus("recovering");
      setStreamDiagnostic(`Reconnecting: ${reason}`);
      if (retryTimeout) clearTimeout(retryTimeout);
      retryTimeout = setTimeout(() => {
        void initPlayer();
      }, delayMs);
    };

    const startHealthWatchdog = () => {
      if (healthWatchdog) clearInterval(healthWatchdog);

      lastPlaybackTime = 0;
      stallCount = 0;

      // Recovery loop for tiny stalls and stale playlist updates.
      healthWatchdog = setInterval(() => {
        if (!video) return;

        const now = Date.now();
        const playbackDelta = Math.abs(video.currentTime - lastPlaybackTime);
        const stalled =
          video.currentTime > 0 &&
          playbackDelta < 0.01 &&
          !video.paused &&
          !video.ended;

        if (stalled) {
          stallCount += 1;
          console.warn(
            `[StreamPlayer] Playback stalled (count: ${stallCount})`,
          );

          if (stallCount >= 3) {
            scheduleRebuild("playback stalled repeatedly");
            return;
          }

          if (stallCount === 1) {
            nudgeToLiveEdge();
          } else {
            hls?.recoverMediaError();
            nudgeToLiveEdge();
          }
        } else {
          stallCount = 0;
        }

        if (hls && now - lastPlaylistUpdateAt > 8000) {
          console.warn(
            "[StreamPlayer] Playlist stalled; forcing manifest/fragment reload",
          );
          hls.startLoad();
          nudgeToLiveEdge();
          lastPlaylistUpdateAt = now;
        }

        lastPlaybackTime = video.currentTime;
      }, 2000);
    };

    const initPlayer = async () => {
      if (disposed) return;
      clearTimers();
      if (hls) {
        hls.destroy();
        hls = null;
      }
      lastPlaylistUpdateAt = Date.now();

      const manifestReady = await probeManifest();
      if (!manifestReady) {
        console.warn(
          `[StreamPlayer] Stream initialization delayed - manifest not ready at ${streamUrl}`,
        );
        scheduleRebuild("manifest not ready", 1000);
        return;
      }

      console.log(`[StreamPlayer] Initializing playback for ${streamUrl}`);

      // Check if browser supports HLS natively (Safari)
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = sourceUrl();
        setStreamStatus("live");
        void video.play().catch(() => {});
        startHealthWatchdog();
      } else if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          // FFmpeg emits standard live HLS, not LL-HLS parts.
          lowLatencyMode: false,
          // Keep a wider live window to absorb network jitter.
          liveSyncDurationCount: 4,
          liveMaxLatencyDurationCount: 12,
          liveBackBufferLength: 30,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          // Aggressive retries when manifests/fragments fail.
          manifestLoadingMaxRetry: 10,
          manifestLoadingRetryDelay: 800,
          levelLoadingMaxRetry: 10,
          levelLoadingRetryDelay: 800,
          fragLoadingMaxRetry: 10,
          fragLoadingRetryDelay: 800,
        });

        hls.loadSource(sourceUrl());
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_LOADED, () => {
          lastPlaylistUpdateAt = Date.now();
        });

        hls.on(Hls.Events.LEVEL_LOADED, () => {
          lastPlaylistUpdateAt = Date.now();
        });

        hls.on(Hls.Events.FRAG_LOADED, () => {
          lastPlaylistUpdateAt = Date.now();
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log("[StreamPlayer] Manifest parsed, starting playback");
          setStreamDiagnostic(null);
          setStreamStatus("live");
          void video.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.warn(
            "[StreamPlayer] HLS error:",
            data.type,
            data.details,
            data.fatal,
          );

          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log("[StreamPlayer] Network error, retrying load...");
                hls?.startLoad(-1);
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log("[StreamPlayer] Media error, recovering...");
                hls?.recoverMediaError();
                nudgeToLiveEdge();
                break;
              default:
                scheduleRebuild("fatal HLS error", 2000);
                break;
            }
          } else if (
            data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
            data.details === Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT ||
            data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR
          ) {
            console.warn(
              "[StreamPlayer] Non-fatal buffering/loading issue; forcing recovery",
            );
            hls?.startLoad();
            nudgeToLiveEdge();
          }
        });

        startHealthWatchdog();
      } else {
        console.error("[StreamPlayer] HLS is not supported in this browser");
      }
    };

    const onWaiting = () => nudgeToLiveEdge();
    const onStalled = () => nudgeToLiveEdge();
    const onVideoError = () => scheduleRebuild("video element error", 1000);

    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("error", onVideoError);

    if (autoPlay) {
      video.autoplay = true;
    }
    video.muted = muted;

    void initPlayer();

    return () => {
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("error", onVideoError);
      clearTimers();
      disposed = true;
      if (hls) {
        hls.destroy();
        hls = null;
      }
    };
  }, [embedUrl, streamUrl, autoPlay, muted]);

  if (!embedUrl) {
    return (
      <div
        className={className}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          ...style,
        }}
      >
        <video
          ref={videoRef}
          poster={poster}
          autoPlay={autoPlay}
          muted={muted}
          playsInline
          controls={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            backgroundColor: "#000",
          }}
        />
        {/* Stream Status Indicator */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            right: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {/* Status Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              borderRadius: 4,
              background: "rgba(0, 0, 0, 0.75)",
              width: "fit-content",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background:
                  streamStatus === "live"
                    ? "#22c55e"
                    : streamStatus === "connecting"
                      ? "#eab308"
                      : streamStatus === "recovering"
                        ? "#f97316"
                        : "#ef4444",
                boxShadow:
                  streamStatus === "live"
                    ? "0 0 6px #22c55e"
                    : streamStatus === "connecting"
                      ? "0 0 6px #eab308"
                      : "none",
                animation:
                  streamStatus === "connecting" || streamStatus === "recovering"
                    ? "pulse 1.5s ease-in-out infinite"
                    : "none",
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color:
                  streamStatus === "live"
                    ? "#22c55e"
                    : streamStatus === "connecting"
                      ? "#eab308"
                      : streamStatus === "recovering"
                        ? "#f97316"
                        : "#ef4444",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {streamStatus === "live"
                ? "LIVE"
                : streamStatus === "connecting"
                  ? "CONNECTING"
                  : streamStatus === "recovering"
                    ? "RECONNECTING"
                    : "ERROR"}
            </span>
            {/* Stream source URL (truncated) */}
            <span
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.4)",
                fontFamily: "monospace",
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={streamUrl}
            >
              {streamUrl.length > 40 ? `…${streamUrl.slice(-35)}` : streamUrl}
            </span>
          </div>

          {/* Diagnostic Message */}
          {streamDiagnostic && (
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 4,
                background: "rgba(0, 0, 0, 0.75)",
                color:
                  streamStatus === "error"
                    ? "#ef4444"
                    : streamStatus === "recovering"
                      ? "#f97316"
                      : "#fbbf24",
                fontSize: 11,
                fontFamily: "monospace",
              }}
            >
              {streamStatus === "error" ? "✕" : "⚠"} {streamDiagnostic}
            </div>
          )}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "30%",
            background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
            pointerEvents: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", ...style }}
    >
      <iframe
        key={`${embedUrl}|${poster ?? ""}`}
        src={embedUrl}
        title="Live Stream"
        allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
        allowFullScreen
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        onError={markUnavailable}
        style={{
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
          backgroundColor: "#000",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "30%",
          background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

function resolveEmbedUrl(
  inputUrl: string,
  autoPlay: boolean,
  muted: boolean,
): string | null {
  const trimmed = inputUrl.trim();
  if (!trimmed || trimmed.includes(".m3u8")) return null;

  const parsed = parseUrl(trimmed);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();

  if (
    host.includes("youtube.com") ||
    host.includes("youtu.be") ||
    host.includes("youtube-nocookie.com")
  ) {
    return toYoutubeEmbedUrl(parsed, autoPlay, muted);
  }

  if (host.includes("twitch.tv")) {
    return toTwitchEmbedUrl(parsed, autoPlay, muted);
  }

  parsed.searchParams.set("autoplay", autoPlay ? "1" : "0");
  parsed.searchParams.set("mute", muted ? "1" : "0");
  return parsed.toString();
}

function toYoutubeEmbedUrl(
  url: URL,
  autoPlay: boolean,
  muted: boolean,
): string | null {
  const host = url.hostname.toLowerCase();
  const pathParts = url.pathname.split("/").filter(Boolean);
  const embeddedId =
    pathParts[0] === "embed" && pathParts[1] !== "live_stream"
      ? pathParts[1]
      : null;
  const videoId =
    host === "youtu.be" || host.endsWith(".youtu.be")
      ? pathParts[0]
      : url.searchParams.get("v") ||
        (pathParts[0] === "live" ? pathParts[1] : null) ||
        (pathParts[0] === "shorts" ? pathParts[1] : null) ||
        embeddedId;

  let embed: URL;
  if (videoId) {
    embed = new URL(`https://www.youtube.com/embed/${videoId}`);
  } else {
    const channelId =
      url.searchParams.get("channel") || url.searchParams.get("c");
    if (!channelId) return null;
    embed = new URL("https://www.youtube.com/embed/live_stream");
    embed.searchParams.set("channel", channelId);
  }

  embed.searchParams.set("autoplay", autoPlay ? "1" : "0");
  embed.searchParams.set("mute", muted ? "1" : "0");
  embed.searchParams.set("playsinline", "1");
  embed.searchParams.set("controls", "0");
  embed.searchParams.set("rel", "0");
  embed.searchParams.set("modestbranding", "1");
  return embed.toString();
}

function toTwitchEmbedUrl(
  url: URL,
  autoPlay: boolean,
  muted: boolean,
): string | null {
  const host = url.hostname.toLowerCase();
  const parentHost =
    typeof window !== "undefined" ? window.location.hostname : "localhost";

  let embed = url;
  if (!host.includes("player.twitch.tv")) {
    const channel = url.pathname.split("/").filter(Boolean)[0];
    if (!channel) return null;
    embed = new URL("https://player.twitch.tv/");
    embed.searchParams.set("channel", channel);
  }

  embed.searchParams.set("parent", parentHost);
  embed.searchParams.set("autoplay", autoPlay ? "true" : "false");
  embed.searchParams.set("muted", muted ? "true" : "false");
  return embed.toString();
}

function parseUrl(rawValue: string): URL | null {
  try {
    return new URL(rawValue);
  } catch {
    return null;
  }
}
