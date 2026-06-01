# Client and Gameplay Guide

This page mirrors the useful operational content from
[`packages/client/README.md`](../packages/client/README.md) and corrects it for
the current WebGPU-only runtime.

## Overview

The Hyperscape RPG client is the browser frontend for a persistent
RuneScape-inspired multiplayer RPG. It includes real-time combat, skill
progression, resource gathering, crafting, banking, trading interfaces, mob AI,
inventory/equipment UI, and agent dashboards.

## Quick Start

```bash
cd packages/client
bun install
bun run dev
```

Open `http://localhost:3333`. The backend normally runs on
`http://localhost:5555`.

Authentication is optional for local development. Without Privy credentials, the
app falls back to anonymous local tokens.

## Prerequisites

- Bun 1.1.38+.
- Node.js 18+ where package scripts require it.
- 4GB+ RAM for local world/database/rendering work.
- A modern browser with WebGPU support. Chrome 113+, Edge 113+, and Safari 17+
  are the baseline.

Hyperscape requires WebGPU. WebGL fallback code will not render the TSL material
stack correctly.

## Optional Privy Authentication

Privy enables persistent accounts, wallet/email/social login, Farcaster login,
and progress tied to user identity.

1. Create or select an app in the [Privy Dashboard](https://dashboard.privy.io/).
2. Enable Farcaster login if the deployment will run as a Farcaster mini-app.
3. Set the public/client and server credentials in local `.env` files or the
   deployment secret store:

```bash
PUBLIC_PRIVY_APP_ID=your-privy-app-id-here
PRIVY_APP_ID=your-privy-app-id-here
PRIVY_APP_SECRET=your-privy-app-secret-here
```

Do not commit real Privy secrets.

## First-Time Play Flow

1. Open the client.
2. Authenticate with Privy or continue anonymously in local development.
3. Create a character.
4. Click the ground to move.
5. Left-click objects and NPCs to interact.
6. Right-click for context menus and advanced actions.
7. Use the left sidebar for inventory, skills, equipment, settings, and account
   tools.

## Mobile and Native Context

The web client can be used by Capacitor/Tauri wrappers, but WebGPU availability
is still mandatory. Android WebView support remains the limiting platform case.
See [Native Release and Distribution](./native-release.md) and
[`packages/app/README.md`](../packages/app/README.md) for native app details.

For LAN/mobile development, point the app at a reachable dev server URL:

```bash
export CAP_SERVER_URL="http://192.168.1.XXX:3333"
bun run dev
```

## Farcaster Mini-App Deployment

Farcaster deployments require Privy with Farcaster login enabled and a public
HTTPS URL.

```bash
PUBLIC_ENABLE_FARCASTER=true
PUBLIC_APP_URL=https://your-game-domain.com
```

Use the Farcaster developer tools to validate the mini-app metadata. Localhost
will not work for Farcaster testing; use a tunnel such as ngrok or Cloudflare
Tunnel when testing from a local machine.

## Game Systems

Core systems include:

- Combat with melee/ranged weapons, auto-attack, damage formulas, and death
  mechanics.
- Skills: Attack, Strength, Defense, Constitution, Ranged, Woodcutting,
  Fishing, Firemaking, and Cooking.
- Equipment tiers: Bronze, Steel, and Mithril.
- Inventory, banking, stores, loot drops, and character progression.
- Grid-based terrain with biomes, towns, safe zones, and difficulty areas.

## UI and Controls

- Movement: click-to-move.
- Camera: right-click drag to rotate, scroll to zoom.
- Interact: left-click objects, mobs, NPCs, and items.
- Context menu: right-click.
- Panels: account, combat, skills, inventory, equipment, settings, banking,
  store, health, stamina, and minimap views.

## Architecture Notes

The RPG client sits on Hyperscape's ECS-driven engine:

- Systems handle gameplay logic.
- Entities represent players, mobs, items, resources, and world objects.
- Components store entity data.
- Actions represent validated player or agent commands.

Important related server systems live under `packages/server`, while shared
engine code lives under `packages/shared`.

## Testing

The client package README references the unified browser-based test suite. Use
the package scripts that are current in `package.json`; common commands include:

```bash
bun run test
bun run test:headed
bun run test:verbose
```

AGENTS.md requires real browser sessions for tests. Do not replace gameplay or
rendering validation with mocks.

## Deployment Notes

Typical runtime variables include:

```bash
DATABASE_URL=sqlite:./world/db.sqlite
WORLD_PATH=./world
PUBLIC_CDN_URL=https://your-cdn.com
LIVEKIT_API_KEY=your-livekit-key
LIVEKIT_API_SECRET=your-livekit-secret
```

Use placeholders in tracked examples and docs. Real keys belong in local `.env`
files or deployment secret stores.

## Troubleshooting

- Server does not start: check Bun/Node version, database permissions, and port
  availability.
- Client cannot connect: check WebSocket URL, server status, and browser dev
  tools.
- Authentication fails: verify Privy app ID/secret and allowed redirect URLs.
- Farcaster fails: confirm `PUBLIC_ENABLE_FARCASTER=true`, public HTTPS, and
  Farcaster login in Privy.
- Rendering fails: confirm WebGPU is available and enabled. Do not switch to
  WebGL.
- Performance problems: reduce local player/agent count, check memory, and
  inspect database size.

## Debugging

```bash
DEBUG=hyperscape:* bun run dev
DEBUG=rpg:* bun run dev
```

Run targeted validation from the package when needed:

```bash
bun run test:health
bun run test:rpg:integration
```
