# Duel Stack

This document is the authoritative streaming model for the duel arena stack on
`enoomian` personal staging and the basis for the canonical production path.

## Source Of Truth

Hyperscapes owns duel truth across three layers:

1. simulation truth
   - duel lifecycle
   - fighter state
   - result data
2. renderer truth
   - stream-page readiness
   - render tick freshness
   - visual change freshness
   - capture and encoder cadence
3. delivery truth
   - playback URL selection
   - HLS/LL-HLS freshness
   - fallback routing

Hyperbet does not invent a second stream-truth model. It consumes the additive
stream session that Hyperscapes publishes.

## Runtime Topology

- Cloudflare Pages hosts the public `/stream` page.
- The GPU host runs the renderer, browser capture, and FFmpeg encode process.
- Railway hosts the Hyperscapes API and control plane.
- Self-hosted HLS remains available on the GPU host for smoke, fallback, and
  diagnostics.
- Cloudflare Stream LL-HLS is the target viewer-delivery path once external
  delivery is enabled.

Railway is not the renderer of record for personal staging.

## Asset Policy

- PhysX JS and WASM must load same-origin from the Pages-hosted client.
- General game assets must come from one manifest-complete asset origin.
- Do not widen CSP to allow arbitrary script origins.
- If the stream page cannot resolve a complete asset origin, renderer health
  must degrade with `asset_origin_incomplete`.

## Capture And Encode Defaults

These are the staging defaults that the integrated branch expects:

- `FFMPEG_HWACCEL=nvidia`
- `STREAM_LOW_LATENCY=true`
- `STREAM_FPS=30`
- `gopSize=30`
- `HLS_TIME_SECONDS=1`
- `HLS_LIST_SIZE=6`
- `HLS_DELETE_THRESHOLD=24`

If FFmpeg falls back to `libx264` on the GPU box, treat that as misconfigured
for the live betting path.

## Delivery Modes

The runtime is provider-neutral. Delivery is selected with:

- `STREAM_DELIVERY_MODE=self_hls|external_hls`
- `STREAM_DELIVERY_PROVIDER`
- `STREAM_INGEST_RTMPS_URL`
- `STREAM_INGEST_STREAM_KEY`
- `STREAM_PLAYBACK_HLS_URL`
- `STREAM_PLAYBACK_LLHLS_URL`

Selection order:

1. `STREAM_PLAYBACK_LLHLS_URL`
2. `STREAM_PLAYBACK_HLS_URL`
3. local `/live/stream.m3u8`

`hls-cdn-sync.ts` is backup/object-store sync only. It is not the primary
viewer-delivery path.

## Renderer Health Model

The stream page now publishes a heartbeat and the capture pipeline persists a
richer external status snapshot. Health is phase-aware:

- `IDLE`, `OPEN`, `LOCKED`
  - require fresh render tick and fresh delivery/manifests
- `FIGHT`, `RESOLUTION`
  - also require recent visual change
  - also require acceptable capture and encoder cadence

Current degraded reasons include:

- `render_tick_stale`
- `visual_change_stale`
- `capture_fps_low`
- `encoder_fps_low`
- `manifest_stale`
- `asset_origin_incomplete`

## Required Health Checks

For the renderer/capture worker:

- `GET /api/streaming/capture/status`
- `GET /api/streaming/rtmp/status`
- `GET /live/stream.m3u8`

For the API/control plane:

- `GET /health`
- `GET /api/streaming/state`
- `GET /api/streaming/state/events`
- `GET /api/hyperbet/config`

For the rendered page:

- `/stream` must visibly move through a full duel
- during active combat, `visualChangeAgeMs < 1000`
- during active combat, `captureFps >= 24`
- during active combat, `encodeFps >= 24`

## Personal Staging Rule

On `enoomian` personal staging:

- Pages hosts the public client
- the GPU box renders and encodes
- Railway serves the API and control plane
- Cloudflare Stream LL-HLS is the target viewer path once enabled
- self-hosted HLS remains reachable for smoke and emergency fallback
