# Package README Catalog

This catalog makes the repository READMEs discoverable from the docs directory.
The package README files remain the canonical source for package-local setup and
API details.

## Primary Project READMEs

| README | Purpose |
| --- | --- |
| [`../README.md`](../README.md) | Root Gaia/Hyperscape overview, setup, and top-level development flow. |
| [`../packages/client/README.md`](../packages/client/README.md) | Browser client, gameplay systems, auth, controls, tests, and troubleshooting. See [Client and Gameplay Guide](./client.md) for the docs version. |
| [`../packages/server/README.md`](../packages/server/README.md) | Fastify game server, PostgreSQL persistence, WebSocket runtime, local/production operation. |
| [`../packages/app/README.md`](../packages/app/README.md) | Tauri native app for desktop and mobile distribution. |
| [`../packages/shared/dev-book/README.md`](../packages/shared/dev-book/README.md) | Shared engine development notes. See [Shared Engine Developer Book](./shared-dev-book.md) for the docs-site index. |

## AI, Agents, and Integrations

| README | Purpose |
| --- | --- |
| [`../packages/plugin-hyperscape/README.md`](../packages/plugin-hyperscape/README.md) | Hyperscape agent plugin surface, providers, actions, and WebSocket configuration. |
| [`./integrations/safier-semantics.md`](./integrations/safier-semantics.md) | Current Hyades/Safier integration contract and gateway notes. |

## Asset and World-Building Packages

| README | Purpose |
| --- | --- |
| [`../packages/asset-forge/README.md`](../packages/asset-forge/README.md) | Asset Forge review/generation shell and provider setup. |
| [`../packages/asset-forge/dev-book/README.md`](../packages/asset-forge/dev-book/README.md) | Asset Forge developer notes. |
| [`../packages/procgen/README.md`](../packages/procgen/README.md) | Procedural tree, plant, rock, and building generators. |
| [`../packages/decimation/README.md`](../packages/decimation/README.md) | Seam-aware mesh decimation package. |
| [`../packages/pixal3d-service/README.md`](../packages/pixal3d-service/README.md) | Pixal3D Gradio service wrapper for image-to-3D generation. |
| [`../packages/server/world/assets/README.md`](../packages/server/world/assets/README.md) | Runtime world asset folder notes. |
| [`../packages/server/world/assets/manifests/README.md`](../packages/server/world/assets/manifests/README.md) | Runtime manifest notes. |
| [`./asset-pipeline.md`](./asset-pipeline.md) | Unified Hill/VRM Viewer/Hyperscape asset pipeline. |

## Simulation and Testing

| README | Purpose |
| --- | --- |
| [`../packages/sim-engine/README.md`](../packages/sim-engine/README.md) | Duel index and perp simulator scenarios. |
| [`../packages/server/tests/e2e/branch-validation/README.md`](../packages/server/tests/e2e/branch-validation/README.md) | Branch validation E2E test notes. |
| [`../packages/shared/src/systems/shared/entities/gathering/README.md`](../packages/shared/src/systems/shared/entities/gathering/README.md) | Gathering entity/system notes. |

## Vendored or Upstream Dependency READMEs

These are useful for low-level dependency context, but they should not be copied
into first-party docs because they describe upstream PhysX/Blast/Flow packages.

| README | Purpose |
| --- | --- |
| [`../packages/physx-js-webidl/README.md`](../packages/physx-js-webidl/README.md) | Local PhysX WebIDL wrapper notes. |
| [`../packages/physx-js-webidl/PhysX/README.md`](../packages/physx-js-webidl/PhysX/README.md) | Upstream PhysX README. |
| [`../packages/physx-js-webidl/PhysX/physx/README.md`](../packages/physx-js-webidl/PhysX/physx/README.md) | Upstream PhysX SDK notes. |
| [`../packages/physx-js-webidl/PhysX/blast/README.md`](../packages/physx-js-webidl/PhysX/blast/README.md) | Upstream Blast notes. |
| [`../packages/physx-js-webidl/PhysX/flow/README.md`](../packages/physx-js-webidl/PhysX/flow/README.md) | Upstream Flow notes. |

## Branding

| README | Purpose |
| --- | --- |
| [`../publishing/branding/README.md`](../publishing/branding/README.md) | Publishing and branding notes. |
