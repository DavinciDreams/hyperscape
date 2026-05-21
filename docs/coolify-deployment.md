# Coolify Deployment

This repo includes `docker-compose.coolify.yml` for a simple Coolify deployment
with the Hyperscape app container and a Postgres database.

## Services

- `hyperscape`: builds from `Dockerfile.server` and listens on port `5555`.
- `postgres`: `pgvector/pgvector:pg16` with a persistent named volume.

Set at least:

```env
POSTGRES_PASSWORD=<strong-password>
PUBLIC_API_URL=https://<your-domain>
PUBLIC_WS_URL=wss://<your-domain>/ws
PUBLIC_PRIVY_APP_ID=<privy-app-id>
PRIVY_APP_SECRET=<privy-app-secret>
JWT_SECRET=<random-32-byte-secret>
ADMIN_CODE=<private-admin-code>
```

The compose file sets:

```env
USE_LOCAL_POSTGRES=false
DATABASE_URL=postgresql://hyperscape:<password>@postgres:5432/hyperscape
DEFAULT_GOBLINS_ENABLED=false
```

Leave `DEFAULT_GOBLINS_ENABLED=false` unless you intentionally want the
hardcoded starter test goblin cluster.

## Assets and CDN

The production image copies `packages/server/world` into the app image, and the
server exposes those files at `/game-assets`. The simplest Coolify setup is to
use same-origin assets:

```env
PUBLIC_CDN_URL=https://<your-domain>/game-assets
```

If you want a separate self-hosted static asset service, common choices are:

- Caddy or nginx serving files from a mounted asset directory.
- MinIO behind Caddy/nginx if you want S3-compatible uploads and buckets.
- Garage if you want a lightweight distributed object store.

A single Caddy/nginx box is technically an asset server, not a global CDN. It
becomes CDN-like when you put Cloudflare or another edge cache in front of it.

For most Coolify deployments, prefer either same-origin `/game-assets` or
Cloudflare R2/custom-domain assets. Only add a separate CDN container if you need
to update large assets independently from app deploys.
