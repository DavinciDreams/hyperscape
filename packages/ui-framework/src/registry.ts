/**
 * WidgetRegistry — runtime map from widget-id → WidgetRegistration.
 *
 * The registry is framework-agnostic: `Component` is typed by the
 * consumer at construction time (`new WidgetRegistry<React.ComponentType<...>>()`).
 *
 * Two-step registration flow:
 *
 *   1. Framework-level code calls `registry.defineBuiltins([...])` with
 *      the built-in widget *schemas* shipped by this package. At this
 *      point the schemas exist but have no renderer.
 *   2. The consumer package (client) calls `registry.bindComponent(id, Impl)`
 *      for each schema it has a renderer for. Trying to render a
 *      widget whose component is unbound throws a descriptive error.
 *
 * This split lets server-side layout validation, codemods, and tests
 * use the registry without a React dependency, while the client still
 * gets a single lookup point at runtime.
 */

import type { Widget, WidgetRegistration } from "./widget";

export interface ComponentBinding<C> {
  Component: C;
}

export class WidgetRegistry<C = unknown> {
  // Each entry is optional-Component so schemas can be defined before
  // the renderer is available (server, tests, early boot).
  private readonly entries = new Map<
    string,
    {
      widget: Widget<Record<string, unknown>>;
      Component?: C;
    }
  >();

  /**
   * Register a widget schema with no renderer yet. If the id already
   * exists the call throws — re-defining a widget is almost always a
   * bug (duplicate id across plugins, hot-reload without clear).
   */
  defineWidget(widget: Widget<Record<string, unknown>>): void {
    if (this.entries.has(widget.manifest.id)) {
      throw new Error(
        `WidgetRegistry: widget id "${widget.manifest.id}" is already defined`,
      );
    }
    this.entries.set(widget.manifest.id, { widget });
  }

  /**
   * Bulk-register widget schemas. Order is preserved and each id
   * must be unique.
   */
  defineBuiltins(
    widgets: ReadonlyArray<Widget<Record<string, unknown>>>,
  ): void {
    for (const w of widgets) {
      this.defineWidget(w);
    }
  }

  /**
   * Attach a renderer to an already-defined widget.
   */
  bindComponent(id: string, Component: C): void {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(
        `WidgetRegistry: cannot bind component to unknown widget id "${id}"`,
      );
    }
    entry.Component = Component;
  }

  /**
   * Register a full WidgetRegistration in one call.
   */
  register(registration: WidgetRegistration<Record<string, unknown>, C>): void {
    this.defineWidget(registration.widget);
    this.bindComponent(registration.widget.manifest.id, registration.Component);
  }

  /**
   * Returns the Widget schema for the given id, or undefined.
   */
  getWidget(id: string): Widget<Record<string, unknown>> | undefined {
    return this.entries.get(id)?.widget;
  }

  /**
   * Returns the Component bound to the given id. Throws if the id is
   * unknown or if no component has been bound yet — callers that need
   * a non-throwing variant should check `hasComponent` first.
   */
  getComponent(id: string): C {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`WidgetRegistry: unknown widget id "${id}"`);
    }
    if (entry.Component === undefined) {
      throw new Error(
        `WidgetRegistry: widget "${id}" has no bound Component. Call bindComponent(id, Impl) before render.`,
      );
    }
    return entry.Component;
  }

  /**
   * True iff the widget id exists (regardless of whether a Component
   * has been bound).
   */
  hasWidget(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * True iff the widget id exists AND has a bound Component.
   */
  hasComponent(id: string): boolean {
    const entry = this.entries.get(id);
    return entry !== undefined && entry.Component !== undefined;
  }

  /**
   * All registered widgets in definition order. Useful for editor
   * palettes and debug inspectors.
   */
  listWidgets(): ReadonlyArray<Widget<Record<string, unknown>>> {
    return Array.from(this.entries.values()).map((e) => e.widget);
  }

  /**
   * Clears all entries. Intended for tests + plugin hot-reload.
   */
  clear(): void {
    this.entries.clear();
  }
}
