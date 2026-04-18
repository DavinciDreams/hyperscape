/**
 * In-memory duplex socket pair.
 *
 * Produces two `NodeWebSocket`-compatible endpoints that pipe each
 * other's writes into the peer's `message` event. Used by PIE to run
 * a real client+server pair in-process without opening a TCP socket.
 *
 * Each endpoint implements the same surface the `Socket` class already
 * assumes:
 *
 *   - `on(event, listener)` / `removeListener(event, listener)` for
 *     `"message" | "pong" | "close"` events.
 *   - `send(packet)` writes a binary packet to the peer.
 *   - `ping()` delivers a `"pong"` event on the peer (there is no
 *     protocol-level ping in the in-memory transport, so we short-circuit
 *     the heartbeat).
 *   - `close()` / `terminate()` deliver `"close"` to both sides.
 *
 * Delivery is async (`queueMicrotask` by default) to match the event-loop
 * timing of a real WebSocket. A `latencyMs` knob forces an `setTimeout`
 * delay on each packet, useful for desync + interpolation regression tests.
 *
 * @internal
 */

type SocketEvent = "message" | "pong" | "close";

interface PairedSocketOptions {
  /** Per-packet latency in ms. 0 = microtask-deferred (matches native). */
  latencyMs?: number;
  /** Tag used in diagnostics / error messages. */
  tag?: string;
}

/**
 * One end of an in-memory pair. Implements enough of the `NodeWebSocket`
 * surface that `Socket` in `platform/shared/Socket.ts` is oblivious to
 * the fact it isn't talking to a real `ws`.
 */
export class InMemorySocket {
  /** Peer endpoint — set by `InMemorySocketPair.create`. */
  private _peer: InMemorySocket | null = null;
  private readonly _listeners: Record<SocketEvent, Set<Function>> = {
    message: new Set(),
    pong: new Set(),
    close: new Set(),
  };
  private _closed = false;
  private readonly _latencyMs: number;
  readonly tag: string;

  constructor(opts: PairedSocketOptions = {}) {
    this._latencyMs = Math.max(0, opts.latencyMs ?? 0);
    this.tag = opts.tag ?? "in-memory";
  }

  /** @internal */
  _bindPeer(peer: InMemorySocket): void {
    this._peer = peer;
  }

  on(event: string, listener: Function): void {
    const key = event as SocketEvent;
    const set = this._listeners[key];
    if (!set) return;
    set.add(listener);
  }

  removeListener(event: string, listener: Function): void {
    const key = event as SocketEvent;
    this._listeners[key]?.delete(listener);
  }

  /**
   * Send a packet to the peer. The packet is delivered through the peer's
   * `message` listeners on the next microtask (or after `latencyMs`).
   */
  send(packet: ArrayBuffer | Uint8Array): void {
    if (this._closed) return;
    const peer = this._peer;
    if (!peer || peer._closed) return;
    this._schedule(() => peer._dispatch("message", packet));
  }

  /**
   * The real WebSocket's `ping()` writes a control frame the runtime
   * automatically answers with a `pong`. In-memory we fire `pong` on the
   * peer directly so the heartbeat code paths run end-to-end.
   */
  ping(): void {
    if (this._closed) return;
    const peer = this._peer;
    if (!peer || peer._closed) return;
    this._schedule(() => peer._dispatch("pong", undefined));
  }

  close(): void {
    this._closeBoth(1000);
  }

  terminate(): void {
    this._closeBoth(1006);
  }

  /** @internal test hook — dispatches the same event the peer would. */
  _dispatch(event: SocketEvent, arg: unknown): void {
    const set = this._listeners[event];
    if (!set || set.size === 0) return;
    // Copy so handlers that mutate the set don't miss each other.
    for (const fn of Array.from(set)) {
      (fn as (arg?: unknown) => void)(arg);
    }
  }

  private _closeBoth(code: number): void {
    if (this._closed) return;
    this._closed = true;
    // Deliver close on both sides (ours first, matches real WS semantics
    // where the closing side sees the event when its socket transitions).
    this._schedule(() => this._dispatch("close", { code }));
    const peer = this._peer;
    if (peer && !peer._closed) {
      peer._closed = true;
      peer._schedule(() => peer._dispatch("close", { code }));
    }
  }

  private _schedule(fn: () => void): void {
    if (this._latencyMs > 0) {
      setTimeout(fn, this._latencyMs);
    } else {
      queueMicrotask(fn);
    }
  }
}

/**
 * Factory — creates a bound pair. Callers hand one end to the server's
 * `ServerNetwork.onConnection` path and the other to the client's
 * `ClientNetwork.init` path.
 */
export interface SocketPair {
  server: InMemorySocket;
  client: InMemorySocket;
}

export interface SocketPairOptions {
  /** Per-packet latency (both directions). */
  latencyMs?: number;
}

export function createInMemorySocketPair(
  opts: SocketPairOptions = {},
): SocketPair {
  const server = new InMemorySocket({
    latencyMs: opts.latencyMs,
    tag: "pie-server",
  });
  const client = new InMemorySocket({
    latencyMs: opts.latencyMs,
    tag: "pie-client",
  });
  server._bindPeer(client);
  client._bindPeer(server);
  return { server, client };
}
