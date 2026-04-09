# Hyperscape Server

This package is the Hyperscapes API and control plane. For the duel-streaming
stack it should be read as the canonical source of lifecycle, renderer, and
delivery truth consumed by Hyperbet. The source worker is separate in staging
and production unless `DUEL_OWNS_STREAM_CAPTURE=true` is set for local
integrated ownership.

## Streaming Architecture

- Cloudflare Pages hosts the public stream page.
- The GPU host runs the dedicated source worker service for browser capture
  and FFmpeg encode.
- Railway runs this server package and publishes the canonical stream session.
- Viewer delivery is selected by authority-layer provider priority.
- Self-hosted HLS is the current canonical rail for personal staging.
- Cloudflare Stream remains configured as a warm fallback and investigation
  provider.

This server is not the renderer of record.
The split topology is the default operating model.

## Same-Origin PhysX Requirement

The stream page must load PhysX JS and WASM same-origin from the Pages-hosted
client. Do not relax CSP to permit arbitrary script origins. If same-origin
loading is broken, the renderer should degrade instead of silently widening
policy.

## Delivery Configuration

Provider-neutral delivery envs:

- `STREAM_DELIVERY_MODE=self_hls|external_hls`
- `STREAM_DELIVERY_PROVIDER`
- `STREAM_CANONICAL_PROVIDER_PRIORITY`
- `STREAM_FAILBACK_SOAK_MS`
- `STREAM_INGEST_RTMPS_URL`
- `STREAM_INGEST_STREAM_KEY`
- `STREAM_PLAYBACK_HLS_URL`
- `STREAM_PLAYBACK_LLHLS_URL`
- `STREAM_EXTERNAL_DELIVERY_PROVIDER`
- `STREAM_EXTERNAL_PLAYBACK_HLS_URL`
- `STREAM_EXTERNAL_PLAYBACK_LLHLS_URL`
- `STREAM_EXTERNAL_INGEST_RTMPS_URL`
- `STREAM_CLOUDFLARE_PROBE_ONLY`

Selection order for playback:

1. the active canonical destination selected from provider priority and health
2. `STREAM_PLAYBACK_LLHLS_URL` or `STREAM_PLAYBACK_HLS_URL` for that provider
3. local `/live/stream.m3u8` when self-hosted HLS is canonical

`hls-cdn-sync.ts` is fallback/object-store sync only.

## Capture And Encode Defaults

Personal staging expects:

- `FFMPEG_HWACCEL=nvidia`
- `STREAM_LOW_LATENCY=true`
- `STREAM_FPS=30`
- `HLS_TIME_SECONDS=1`
- `HLS_LIST_SIZE=6`
- `HLS_DELETE_THRESHOLD=24`

## Health Contract

The canonical capture status now includes additive fields that Hyperbet and
operator surfaces consume:

- `sourceRuntime`
- `rendererHealth`
- `metrics`
  - `captureFps`
  - `encodeFps`
  - `droppedFrames`
  - `latestFrameAt`
  - `latestRenderTickAt`
  - `latestDuelStateTickAt`
  - `latestVisualChangeAt`
  - `visualChangeAgeMs`
  - `hlsManifest`
- `delivery`
  - `mode`
  - `provider`
  - `playbackUrl`
  - `canonicalDestination`
  - `fallbackDestination`

Phase-aware degradation can emit:

- `render_tick_stale`
- `visual_change_stale`
- `capture_fps_low`
- `encoder_fps_low`
- `manifest_stale`
- `asset_origin_incomplete`

## Endpoints

Operationally important endpoints:

- `GET /health`
- `GET /api/streaming/state`
- `GET /api/streaming/state/events`
- `GET /api/streaming/capture/status`
- `GET /api/streaming/rtmp/status`
- `GET /api/hyperbet/config`

## Deployment Rule

Keep secrets and delivery URLs in Railway, Pages, and GPU-host runtime config.
Do not hardcode them in the repo and do not commit staging-only secrets.
