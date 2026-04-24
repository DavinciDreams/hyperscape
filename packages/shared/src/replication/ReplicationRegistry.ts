/**
 * Replication registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `replication.ts`.
 * Indexes authored replicated components by PascalCase name and
 * replicated events by snake_case id, and surfaces per-field lookups
 * for delta codegen/validation.
 */

import {
  type ReplicatedComponent,
  type ReplicatedEvent,
  type ReplicatedField,
  type ReplicationManifest,
  ReplicationManifestSchema,
} from "@hyperforge/manifest-schema";

export class ReplicationNotLoadedError extends Error {
  constructor() {
    super("ReplicationRegistry used before load()");
    this.name = "ReplicationNotLoadedError";
  }
}

export class UnknownReplicatedComponentError extends Error {
  readonly componentName: string;
  constructor(name: string, available: readonly string[]) {
    super(
      `replicated component "${name}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownReplicatedComponentError";
    this.componentName = name;
  }
}

export class UnknownReplicatedEventError extends Error {
  readonly eventId: string;
  constructor(id: string, available: readonly string[]) {
    super(
      `replicated event "${id}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownReplicatedEventError";
    this.eventId = id;
  }
}

export class ReplicationRegistry {
  private _manifest: ReplicationManifest | null = null;
  private _componentsByName = new Map<string, ReplicatedComponent>();
  private _eventsById = new Map<string, ReplicatedEvent>();

  constructor(manifest?: ReplicationManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ReplicationManifest): void {
    this._manifest = manifest;
    this._componentsByName.clear();
    this._eventsById.clear();
    for (const c of manifest.components) {
      this._componentsByName.set(c.component, c);
    }
    for (const e of manifest.events) this._eventsById.set(e.id, e);
  }

  loadFromJson(raw: unknown): void {
    this.load(ReplicationManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): ReplicationManifest {
    if (!this._manifest) throw new ReplicationNotLoadedError();
    return this._manifest;
  }

  get components(): readonly ReplicatedComponent[] {
    return this.manifest.components;
  }

  get events(): readonly ReplicatedEvent[] {
    return this.manifest.events;
  }

  hasComponent(name: string): boolean {
    return this._componentsByName.has(name);
  }

  component(name: string): ReplicatedComponent {
    const c = this._componentsByName.get(name);
    if (!c) {
      throw new UnknownReplicatedComponentError(
        name,
        Array.from(this._componentsByName.keys()),
      );
    }
    return c;
  }

  field(componentName: string, fieldName: string): ReplicatedField | undefined {
    return this.component(componentName).fields.find(
      (f) => f.name === fieldName,
    );
  }

  hasEvent(id: string): boolean {
    return this._eventsById.has(id);
  }

  event(id: string): ReplicatedEvent {
    const e = this._eventsById.get(id);
    if (!e) {
      throw new UnknownReplicatedEventError(
        id,
        Array.from(this._eventsById.keys()),
      );
    }
    return e;
  }

  /** Events matching a direction predicate (useful for codegen splits). */
  eventsByDirection(
    direction: ReplicatedEvent["direction"],
  ): ReplicatedEvent[] {
    return this.manifest.events.filter((e) => e.direction === direction);
  }
}
