# Hyperscape Docs

This directory collects operational, integration, release, and package-level
documentation for Hyperscape/Gaia.

## Core Guides

- [Client and Gameplay Guide](./client.md)
- [Shared Engine Developer Book](./shared-dev-book.md)
- [Package README Catalog](./package-readmes.md)
- [Unified Asset Pipeline](./asset-pipeline.md)
- [Coolify Deployment](./coolify-deployment.md)
- [Duel Stack](./duel-stack.md)
- [Native Release and Distribution](./native-release.md)
- [Railway Dev/Prod](./railway-dev-prod.md)
- [Safier Semantics Integration](./integrations/safier-semantics.md)

## Notes

- Hyperscape is WebGPU-only. Do not add WebGL fallback paths.
- Real secrets belong in local `.env` files or deployment secret stores, never
  in tracked docs or examples.
