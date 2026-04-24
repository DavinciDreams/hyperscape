/**
 * Plugin context scope.
 *
 * Pure-logic utility that any `PluginContext` implementation can
 * compose with to track per-plugin registrations. When a plugin is
 * disabled the scope invokes its disposers in LIFO order, mirroring
 * C# `using` / Python context managers.
 *
 * Scope intentionally knows nothing about world/registry/widget
 * APIs — it just stores opaque `Disposer` callbacks. Callers wrap
 * their own registration methods (`registerSystem`, `registerWidget`,
 * …) and push a disposer onto the scope each time.
 *
 * Use with `PluginLoader`:
 *   1. Caller supplies a `PluginContextProvider` that constructs a
 *      context object holding a fresh `PluginContextScope`.
 *   2. Context exposes typed `registerX` methods that call
 *      `scope.register(() => unregisterX(...))` internally.
 *   3. Caller's `onDisable` handler (either the plugin's or a wrapper
 *      around it) calls `scope.dispose()`.
 */

/**
 * Opaque teardown callback — invoked during `dispose()`. May be sync
 * or async; errors are collected and the first one is re-thrown
 * after every disposer has been attempted.
 */
export type Disposer = () => void | Promise<void>;

export class PluginContextScope {
  readonly pluginId: string;
  private readonly _disposers: Disposer[] = [];
  private _disposed = false;

  constructor(pluginId: string) {
    if (!pluginId) {
      throw new Error("PluginContextScope requires a non-empty pluginId");
    }
    this.pluginId = pluginId;
  }

  /**
   * Attach a teardown callback. Disposers run in reverse of their
   * registration order when `dispose()` is called — last registered,
   * first torn down. Throws if the scope has already been disposed.
   */
  register(disposer: Disposer): void {
    if (this._disposed) {
      throw new Error(
        `PluginContextScope "${this.pluginId}" already disposed — cannot register further`,
      );
    }
    this._disposers.push(disposer);
  }

  /** Count of pending disposers. */
  get size(): number {
    return this._disposers.length;
  }

  get disposed(): boolean {
    return this._disposed;
  }

  /**
   * Invoke every disposer in LIFO order. Best-effort: a throw in one
   * disposer does NOT stop the rest. The first error is surfaced
   * after all disposers have run; subsequent errors are lost (matching
   * the `PluginLoader.disableAll` policy).
   *
   * Calling `dispose()` twice is a no-op.
   */
  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    let firstError: Error | null = null;
    for (let i = this._disposers.length - 1; i >= 0; i--) {
      const d = this._disposers[i];
      try {
        await d();
      } catch (e) {
        if (firstError === null) {
          firstError = e instanceof Error ? e : new Error(String(e));
        }
      }
    }
    this._disposers.length = 0;
    if (firstError !== null) {
      throw firstError;
    }
  }

  /**
   * Re-open a disposed scope so the next enable cycle can push fresh
   * disposers. No-op when the scope is still live. Preserves the
   * `PluginContextScope` reference itself so other plugins that
   * captured a handle during `onLoad` keep a working reference across
   * `enabled ⇄ disabled` cycles.
   *
   * Safety: throws if the disposer list is non-empty — that would
   * mean the scope was never disposed and reopening could strand
   * disposers. Callers should always `dispose()` before `reopen()`.
   */
  reopen(): void {
    if (!this._disposed) return;
    if (this._disposers.length !== 0) {
      throw new Error(
        `PluginContextScope "${this.pluginId}" has ${this._disposers.length} pending disposer(s); call dispose() before reopen()`,
      );
    }
    this._disposed = false;
  }
}
