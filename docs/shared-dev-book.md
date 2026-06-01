# Shared Engine Developer Book

The shared engine developer book lives in
[`packages/shared/dev-book`](../packages/shared/dev-book). It documents the core
Hyperscape 3D multiplayer engine: world lifecycle, ECS concepts, configuration,
combat, troubleshooting, and engine vocabulary.

## Entry Point

- [`packages/shared/dev-book/README.md`](../packages/shared/dev-book/README.md)

## Available Pages

### Overview

- [Introduction](../packages/shared/dev-book/01-overview/introduction.md)
- [Architecture](../packages/shared/dev-book/01-overview/architecture.md)
- [Features](../packages/shared/dev-book/01-overview/features.md)
- [Tech Stack](../packages/shared/dev-book/01-overview/tech-stack.md)

### Getting Started

- [Installation](../packages/shared/dev-book/02-getting-started/installation.md)
- [Configuration](../packages/shared/dev-book/02-getting-started/configuration.md)
- [Quick Start](../packages/shared/dev-book/02-getting-started/quick-start.md)
- [Troubleshooting](../packages/shared/dev-book/02-getting-started/troubleshooting.md)

### User Guides

- [Creating Worlds](../packages/shared/dev-book/03-user-guides/creating-worlds.md)

### Core Systems

- [World](../packages/shared/dev-book/05-core-systems/world.md)
- [Combat System Documentation](../packages/shared/dev-book/05-core-systems/COMBAT-SYSTEM-DOCUMENTATION.md)

### Appendix

- [FAQ](../packages/shared/dev-book/15-appendix/faq.md)
- [Glossary](../packages/shared/dev-book/15-appendix/glossary.md)

## Notes

- The package README references additional planned pages that are not currently
  checked in. This docs-site index only links files that exist in this branch.
- The engine is WebGPU-only in this repository. Do not introduce WebGL fallback
  instructions when editing these docs.
