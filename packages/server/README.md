# Hyperscape Server

This package is the Hyperscapes API and control plane. For the duel-streaming
stack it should be read as the canonical source of lifecycle, renderer, and
delivery truth consumed by Hyperbet.

## Streaming Architecture

- Cloudflare Pages hosts the public stream page.
- The GPU host runs the browser renderer, capture bridge, and FFmpeg encode.
- Railway runs this server package and publishes the canonical stream session.
- Viewer delivery prefers Cloudflare Stream LL-HLS when configured.
- Self-hosted HLS remains available for operator smoke, fallback, and
  diagnostics.

This server is not the renderer of record.

## Same-Origin PhysX Requirement

The stream page must load PhysX JS and WASM same-origin from the Pages-hosted
client. Do not relax CSP to permit arbitrary script origins. If same-origin
loading is broken, the renderer should degrade instead of silently widening
policy.

## Delivery Configuration

Provider-neutral delivery envs:

- `STREAM_DELIVERY_MODE=self_hls|external_hls`
- `STREAM_DELIVERY_PROVIDER`
- `STREAM_INGEST_RTMPS_URL`
- `STREAM_INGEST_STREAM_KEY`
- `STREAM_PLAYBACK_HLS_URL`
- `STREAM_PLAYBACK_LLHLS_URL`

Selection order for playback:

1. `STREAM_PLAYBACK_LLHLS_URL`
2. `STREAM_PLAYBACK_HLS_URL`
3. local `/live/stream.m3u8`

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
